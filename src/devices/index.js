import { logger } from '@gladysassistant/integration-sdk';
import { SUPPORTED_APPS } from './apps.js';

/**
 * Remote keys exposed as Gladys features.
 *
 * `type` must be one of DEVICE_FEATURE_TYPES.TELEVISION: Gladys refuses a
 * device carrying an unknown feature type. `key` is the name understood by
 * AndroidTVClient.sendKey().
 */
export const REMOTE_KEYS = [
  { key: 'up', name: 'Up', type: 'up' },
  { key: 'down', name: 'Down', type: 'down' },
  { key: 'left', name: 'Left', type: 'left' },
  { key: 'right', name: 'Right', type: 'right' },
  { key: 'select', name: 'OK', type: 'enter' },
  { key: 'back', name: 'Back', type: 'return' },
  // Gladys has no dedicated "home" type; `exit` is the closest match and keeps
  // the button available in the remote widget.
  { key: 'home', name: 'Home', type: 'exit' },
  { key: 'menu', name: 'Menu', type: 'menu' },
  { key: 'play', name: 'Play', type: 'play' },
  { key: 'pause', name: 'Pause', type: 'pause' },
  { key: 'stop', name: 'Stop', type: 'stop' },
  { key: 'previous', name: 'Previous', type: 'previous' },
  { key: 'next', name: 'Next', type: 'next' },
  { key: 'rewind', name: 'Rewind', type: 'rewind' },
  { key: 'fast_forward', name: 'Fast forward', type: 'forward' },
];

/**
 * Build the device payload of an Android TV.
 *
 * @param {Object} gladys Gladys integration SDK instance.
 * @param {Object} tvConfig TV configuration ({ ip, name, certificate_key, certificate_cert }).
 * @param {boolean} enableAppShortcuts Whether app shortcut features are enabled.
 * @returns {Object} Gladys Device object.
 */
export function buildAndroidTVDevice(gladys, tvConfig, enableAppShortcuts = true) {
  const ip = tvConfig.ip;
  const ipSanitized = String(ip).replace(/[^a-zA-Z0-9]/g, '_');
  const deviceExternalId = gladys.externalId(`tv:${ipSanitized}`);
  const deviceName = tvConfig.name || `Android TV (${ip})`;

  const features = [
    {
      name: 'Power',
      external_id: `${deviceExternalId}:power`,
      selector: `${deviceExternalId}:power`,
      category: 'television',
      type: 'binary',
      min: 0,
      max: 1,
      read_only: false,
      has_feedback: true,
    },
    {
      name: 'Volume',
      external_id: `${deviceExternalId}:volume`,
      selector: `${deviceExternalId}:volume`,
      category: 'television',
      type: 'volume',
      unit: 'percent',
      min: 0,
      max: 100,
      read_only: false,
      has_feedback: true,
    },
    {
      name: 'Mute',
      external_id: `${deviceExternalId}:mute`,
      selector: `${deviceExternalId}:mute`,
      category: 'television',
      type: 'volume-mute',
      min: 0,
      max: 1,
      read_only: false,
      has_feedback: true,
    },
    ...REMOTE_KEYS.map((remoteKey) => ({
      name: remoteKey.name,
      external_id: `${deviceExternalId}:key:${remoteKey.key}`,
      selector: `${deviceExternalId}:key:${remoteKey.key}`,
      category: 'television',
      type: remoteKey.type,
      min: 0,
      max: 1,
      read_only: false,
      has_feedback: false,
      keep_history: false,
    })),
  ];

  if (enableAppShortcuts) {
    SUPPORTED_APPS.forEach((app) => {
      features.push({
        name: `App ${app.name}`,
        external_id: `${deviceExternalId}:app:${app.id}`,
        selector: `${deviceExternalId}:app:${app.id}`,
        category: 'button',
        type: 'click',
        min: 0,
        max: 1,
        read_only: false,
        has_feedback: false,
        keep_history: false,
      });
    });
  }

  return {
    name: deviceName,
    external_id: deviceExternalId,
    selector: deviceExternalId,
    features,
    // Certificates stay in the integration configuration: device params are
    // readable from the Gladys UI, a TLS private key does not belong there.
    params: [{ name: 'TV_IP', value: String(ip) }],
  };
}

/**
 * Build the discovered devices of every paired TV.
 *
 * A TV without certificates is skipped on purpose: creating its device in
 * Gladys would only produce a device whose every command fails.
 *
 * @param {Object} gladys Gladys integration SDK instance.
 * @param {Object} config Normalized configuration.
 * @returns {Promise<Array<Object>>} Devices to publish.
 */
export async function buildDiscoveredDevices(gladys, config) {
  const tvs = config.tvs || [];
  const paired = tvs.filter((tv) => tv.certificate_key && tv.certificate_cert);

  if (paired.length === 0) {
    logger.warn('[AndroidTV] No paired TV to publish. Run the pairing sequence before scanning.');
  } else {
    logger.info(`[AndroidTV] Publishing ${paired.length} paired TV(s).`);
  }

  return paired.map((tv) => buildAndroidTVDevice(gladys, tv, config.enable_app_shortcuts));
}

/**
 * Handle a UI action (start_pairing, submit_pin, test_connection).
 *
 * The resolved value is acked by the SDK as `data.message` and shown under the
 * button, so it must be a string or a multi-language `{ en, fr }` object.
 *
 * @param {Object} gladys Gladys integration SDK instance.
 * @param {string} actionKey Action key declared in the manifest.
 * @param {Object} fields Values of the action mini-form.
 * @param {Object} clientManager The AndroidTVClientManager instance.
 * @param {Object} currentConfig Normalized configuration.
 * @returns {Promise<Object>} Multi-language message shown to the user.
 */
export async function handleActionExecution(gladys, actionKey, fields, clientManager, currentConfig) {
  logger.info(`[AndroidTV] Running action: ${actionKey}`);

  const targetIp =
    trim(fields?.tv_ip) || trim(fields?.target_tv_ip) || currentConfig.tv_ip || currentConfig.tvs?.[0]?.ip;

  if (!targetIp) {
    throw new Error('Please fill in the IP address of your Android TV before running this action.');
  }

  const targetName = trim(fields?.tv_name) || currentConfig.tv_name || `Android TV (${targetIp})`;
  const existingTvConfig = currentConfig.tvs?.find((tv) => tv.ip === targetIp) || {
    ip: targetIp,
    name: targetName,
    certificate_key: '',
    certificate_cert: '',
  };

  const client = clientManager.getOrCreateClient(existingTvConfig);

  if (actionKey === 'start_pairing') {
    await client.startPairing();
    return {
      en: `Pairing started for ${targetIp}. A PIN code is displayed on your TV: type it in the "Pairing Code (PIN)" field, save, then click "Confirm PIN Code & Add TV".`,
      fr: `Appairage démarré pour ${targetIp}. Un code PIN s'affiche sur votre TV : saisissez-le dans le champ « Code d'association (PIN) », enregistrez, puis cliquez sur « Valider le code PIN & Ajouter la TV ».`,
    };
  }

  if (actionKey === 'submit_pin') {
    const pin = trim(fields?.pairing_pin) || currentConfig.pairing_pin;
    if (!pin) {
      throw new Error('The pairing PIN code is required. Fill in the "Pairing Code (PIN)" field and save first.');
    }

    const result = await client.submitPin(pin);

    if (!result?.certificates?.key || !result?.certificates?.cert) {
      throw new Error('The TV accepted the PIN code but returned no certificate. Please restart the pairing sequence.');
    }

    const updatedTvs = [...(currentConfig.tvs || [])];
    const tvIndex = updatedTvs.findIndex((tv) => tv.ip === targetIp);
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

    // setConfig(), not saveConfig(): that is the SDK method name.
    await gladys.setConfig({ tvs: updatedTvs });

    // The PIN is single use; leaving it in the form only invites a retry that
    // cannot work. Best effort: losing the certificates over this would be far
    // worse than a stale field.
    await gladys.setConfig({ pairing_pin: '' }).catch((err) => {
      logger.warn(`[AndroidTV] Could not clear the PIN field: ${err.message}`);
    });

    // submitPin() resolves on the 'ready' event, so the session is already
    // live: only the status shown in the UI needs a refresh.
    await clientManager.refreshConnectionStatus();

    return {
      en: `Pairing successful for ${targetIp}. Now run a device scan to add the TV to your Gladys devices.`,
      fr: `Appairage réussi pour ${targetIp}. Lancez maintenant une recherche d'appareils pour ajouter la TV à vos appareils Gladys.`,
    };
  }

  if (actionKey === 'test_connection') {
    if (!client.isPaired()) {
      throw new Error(`The TV at ${targetIp} is not paired yet. Run the pairing sequence first.`);
    }

    if (!client.isConnected) {
      await client.connect();
    }
    await clientManager.refreshConnectionStatus();

    return {
      en: `Successfully connected to the Android TV at ${targetIp}.`,
      fr: `Connexion réussie à l'Android TV sur ${targetIp}.`,
    };
  }

  throw new Error(`Unknown action: ${actionKey}`);
}

/**
 * @param {unknown} value Value to read.
 * @returns {string} The trimmed string, or an empty string.
 */
function trim(value) {
  return typeof value === 'string' ? value.trim() : '';
}
