import { logger } from '@gladysassistant/integration-sdk';
import { SUPPORTED_APPS } from './apps.js';

/**
 * Build device payload for an Android TV device.
 *
 * @param {Object} gladys Gladys integration SDK instance
 * @param {Object} tvConfig TV configuration object ({ ip, name, certificate_key, certificate_cert })
 * @param {boolean} enableAppShortcuts Whether app shortcuts features are enabled
 * @returns {Object} Gladys Device object
 */
export function buildAndroidTVDevice(gladys, tvConfig, enableAppShortcuts = true) {
  const ip = tvConfig.ip;
  const ipSanitized = ip.replace(/[^a-zA-Z0-9]/g, '_');
  const deviceExternalId = gladys.externalId(`tv:${ipSanitized}`);
  const deviceName = tvConfig.name || `Android TV (${ip})`;

  const features = [
    {
      name: 'Power',
      external_id: `${deviceExternalId}:power`,
      selector: gladys.externalId(`tv:${ipSanitized}:power`),
      category: 'television',
      type: 'turn-on',
      min: 0,
      max: 1,
      read_only: false,
      has_feedback: true,
    },
    {
      name: 'Volume',
      external_id: `${deviceExternalId}:volume`,
      selector: gladys.externalId(`tv:${ipSanitized}:volume`),
      category: 'television',
      type: 'volume',
      min: 0,
      max: 100,
      read_only: false,
      has_feedback: true,
    },
    {
      name: 'Mute',
      external_id: `${deviceExternalId}:mute`,
      selector: gladys.externalId(`tv:${ipSanitized}:mute`),
      category: 'television',
      type: 'mute',
      min: 0,
      max: 1,
      read_only: false,
      has_feedback: true,
    },
    // Navigation & Media Button Controls
    ...['up', 'down', 'left', 'right', 'select', 'back', 'home', 'play_pause', 'rewind', 'fast_forward'].map((key) => ({
      name: `Key ${key.toUpperCase().replace('_', ' ')}`,
      external_id: `${deviceExternalId}:key:${key}`,
      selector: gladys.externalId(`tv:${ipSanitized}:key:${key}`),
      category: 'button',
      type: 'click',
      min: 0,
      max: 1,
      read_only: false,
      has_feedback: false,
    })),
  ];

  // If enabled in settings, add app shortcuts features
  if (enableAppShortcuts) {
    SUPPORTED_APPS.forEach((app) => {
      features.push({
        name: `App ${app.name}`,
        external_id: `${deviceExternalId}:app:${app.id}`,
        selector: gladys.externalId(`tv:${ipSanitized}:app:${app.id}`),
        category: 'button',
        type: 'click',
        min: 0,
        max: 1,
        read_only: false,
        has_feedback: false,
      });
    });
  }

  return {
    name: deviceName,
    external_id: deviceExternalId,
    selector: deviceExternalId,
    features,
    params: [
      { name: 'TV_IP', value: ip },
      { name: 'CERT_KEY', value: tvConfig.certificate_key || '' },
      { name: 'CERT_CERT', value: tvConfig.certificate_cert || '' },
    ],
  };
}

/**
 * Handle discovery requests (build devices for all configured TVs).
 */
export async function buildDiscoveredDevices(gladys, config) {
  logger.info('[AndroidTV] Building discovered devices list...');
  const tvs = config.tvs || [];
  return tvs.map((tv) => buildAndroidTVDevice(gladys, tv, config.enable_app_shortcuts));
}

/**
 * Action handler for UI action requests (start_pairing, submit_pin, test_connection).
 */
export async function handleActionExecution(gladys, actionKey, fields, clientManager, currentConfig) {
  logger.info(`[Action execution] Triggered action: ${actionKey}`);

  const targetIp = fields?.tv_ip || fields?.target_tv_ip || currentConfig.tv_ip || currentConfig.tvs?.[0]?.ip;
  const targetName = fields?.tv_name || currentConfig.tv_name || `Android TV (${targetIp})`;

  if (!targetIp) {
    throw new Error('Please specify a valid TV IP address for pairing.');
  }

  const existingTvConfig = currentConfig.tvs?.find((t) => t.ip === targetIp) || {
    ip: targetIp,
    name: targetName,
    certificate_key: '',
    certificate_cert: '',
  };

  const client = clientManager.getOrCreateClient(existingTvConfig);

  if (actionKey === 'start_pairing') {
    logger.info(`[Action execution] Starting pairing with ${targetIp}...`);
    const result = await client.startPairing();
    return {
      success: true,
      message: {
        en: `Pairing initiated for ${targetIp}! Check your TV screen for a 6-digit PIN code, enter it in the "Pairing Code (PIN)" field, then click "Confirm PIN Code & Add TV".`,
        fr: `Appairage démarré pour ${targetIp} ! Vérifiez le code PIN à 6 chiffres sur votre TV, saisissez-le dans le champ "Code d'association (PIN)", puis cliquez sur "Valider le code PIN & Ajouter la TV".`,
      },
      data: result,
    };
  }

  if (actionKey === 'submit_pin') {
    const pin = fields?.pairing_pin || currentConfig.pairing_pin;
    if (!pin) {
      throw new Error('Pairing PIN code is required. Please fill in the PIN code field.');
    }

    logger.info(`[Action execution] Submitting PIN code for ${targetIp}...`);
    const result = await client.submitPin(pin);

    // Update config with certificates for target TV
    if (result.certificates) {
      const updatedTvs = [...(currentConfig.tvs || [])];
      const tvIndex = updatedTvs.findIndex((t) => t.ip === targetIp);

      const updatedTvEntry = {
        ...existingTvConfig,
        ip: targetIp,
        name: targetName,
        certificate_key: result.certificates.key,
        certificate_cert: result.certificates.cert,
      };

      if (tvIndex >= 0) {
        updatedTvs[tvIndex] = updatedTvEntry;
      } else {
        updatedTvs.push(updatedTvEntry);
      }

      await gladys.saveConfig({ tvs: updatedTvs });
    }

    return {
      success: true,
      message: {
        en: `Pairing successful for ${targetIp}! TLS certificates stored successfully.`,
        fr: `Appairage réussi pour ${targetIp} ! Les certificats TLS ont été enregistrés avec succès.`,
      },
    };
  }

  if (actionKey === 'test_connection') {
    logger.info(`[Action execution] Testing connection to ${targetIp}...`);
    await client.connect();
    return {
      success: true,
      message: {
        en: `Successfully connected to Android TV at ${targetIp}!`,
        fr: `Connexion réussie à l'Android TV sur ${targetIp} !`,
      },
    };
  }

  throw new Error(`Unknown action: ${actionKey}`);
}
