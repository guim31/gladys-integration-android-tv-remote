import { logger } from '@gladysassistant/integration-sdk';
import { SUPPORTED_APPS } from './apps.js';

/**
 * Build device payload for an Android TV device.
 *
 * @param {Object} gladys Gladys integration SDK instance
 * @param {Object} config Normalized integration configuration
 * @returns {Object} Gladys Device object
 */
export function buildAndroidTVDevice(gladys, config) {
  const ip = config.tv_ip;
  const ipSanitized = ip.replace(/[^a-zA-Z0-9]/g, '_');
  const deviceExternalId = gladys.externalId(`tv:${ipSanitized}`);

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
  if (config.enable_app_shortcuts) {
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
    name: `Android TV (${ip})`,
    external_id: deviceExternalId,
    selector: deviceExternalId,
    features,
    params: [
      { name: 'TV_IP', value: ip },
      { name: 'CERT_KEY', value: config.certificate_key || '' },
      { name: 'CERT_CERT', value: config.certificate_cert || '' },
    ],
  };
}

/**
 * Handle discovery requests (mDNS or manual config device build).
 */
export async function buildDiscoveredDevices(gladys, config) {
  logger.info('[AndroidTV] Building discovered device list...');
  const device = buildAndroidTVDevice(gladys, config);
  return [device];
}

/**
 * Action handler for UI action requests (start_pairing, submit_pin, test_connection).
 */
export async function handleActionExecution(gladys, actionKey, fields, client, currentConfig) {
  logger.info(`[Action execution] Triggered action: ${actionKey}`);

  if (actionKey === 'start_pairing') {
    if (!currentConfig.tv_ip) {
      throw new Error('Please configure TV IP address before pairing.');
    }
    logger.info(`[Action execution] Starting pairing with ${currentConfig.tv_ip}...`);
    const result = await client.startPairing();
    return {
      success: true,
      message: {
        en: 'Pairing initiated! Check your TV screen for a 6-digit PIN code, enter it in the "Pairing Code (PIN)" field, then click "Confirm PIN Code".',
        fr: 'Appairage démarré ! Vérifiez le code PIN à 6 chiffres sur votre TV, saisissez-le dans le champ "Code d\'association (PIN)", puis cliquez sur "Valider le code PIN".',
      },
      data: result,
    };
  }

  if (actionKey === 'submit_pin') {
    const pin = fields?.pairing_pin || currentConfig.pairing_pin;
    if (!pin) {
      throw new Error('Pairing PIN code is required. Please fill in the PIN code field.');
    }

    logger.info(`[Action execution] Submitting PIN code: ${pin}...`);
    const result = await client.submitPin(pin);

    // Save generated TLS client certificate in configuration
    if (result.certificates) {
      await gladys.saveConfig({
        certificate_key: result.certificates.key,
        certificate_cert: result.certificates.cert,
      });
    }

    return {
      success: true,
      message: {
        en: 'Pairing successful! TLS certificates stored successfully.',
        fr: 'Appairage réussi ! Les certificats TLS ont été enregistrés avec succès.',
      },
    };
  }

  if (actionKey === 'test_connection') {
    logger.info(`[Action execution] Testing connection to ${currentConfig.tv_ip}...`);
    await client.connect();
    return {
      success: true,
      message: {
        en: `Successfully connected to Android TV at ${currentConfig.tv_ip}!`,
        fr: `Connexion réussie à l'Android TV sur ${currentConfig.tv_ip} !`,
      },
    };
  }

  throw new Error(`Unknown action: ${actionKey}`);
}
