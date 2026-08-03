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
 * Handle a UI action (start_pairing, submit_pin, test_connection, remove_tv).
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

  if (actionKey === 'start_pairing') {
    const tvIp = trim(fields?.tv_ip);
    if (!tvIp) {
      throw new Error('Fill in the IP address of the TV you want to pair.');
    }

    const tvName = trim(fields?.tv_name) || `Android TV (${tvIp})`;
    const client = clientManager.getOrCreateClient(
      currentConfig.tvs?.find((tv) => tv.ip === tvIp) || {
        ip: tvIp,
        name: tvName,
        certificate_key: '',
        certificate_cert: '',
      },
    );

    await client.startPairing();
    clientManager.setPairingTarget(tvIp, tvName);

    return {
      en: `A PIN code is now displayed on the screen of the TV at ${tvIp}. Type it in step 2 below and run it right away — the code expires.`,
      fr: `Un code PIN s'affiche maintenant sur l'écran de la TV ${tvIp}. Saisissez-le dans l'étape 2 ci-dessous et exécutez-la dans la foulée — le code expire.`,
    };
  }

  if (actionKey === 'submit_pin') {
    const pin = trim(fields?.pairing_pin);
    if (!pin) {
      throw new Error('Type the PIN code displayed on the TV screen.');
    }

    // The session opened by step 1 is the one holding the PIN exchange: the
    // address is remembered from that step, so it is never asked twice.
    const target = clientManager.getPairingTarget();
    if (!target) {
      throw new Error(
        'No pairing sequence is running. Run step 1 first, then confirm the PIN code it displays on the TV.',
      );
    }

    const { client, ip: tvIp, name: tvName } = target;
    const result = await client.submitPin(pin);

    if (!result?.certificates?.key || !result?.certificates?.cert) {
      throw new Error('The TV accepted the PIN code but returned no certificate. Please run step 1 again.');
    }

    const updatedTvs = [...(currentConfig.tvs || [])];
    const tvIndex = updatedTvs.findIndex((tv) => tv.ip === tvIp);
    const updatedTvEntry = {
      ip: tvIp,
      name: tvName,
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

    // submitPin() resolves on the 'ready' event, so the session is already
    // live: only the status shown in the UI needs a refresh.
    await clientManager.refreshConnectionStatus();

    return {
      en: `${tvName} is paired. Now run a device scan (Discovery tab) to add it to your Gladys devices.`,
      fr: `${tvName} est appairée. Lancez maintenant une recherche d'appareils (onglet Découverte) pour l'ajouter à vos appareils Gladys.`,
    };
  }

  if (actionKey === 'remove_tv') {
    const tvIp = trim(fields?.tv_ip);
    if (!tvIp) {
      throw new Error('Fill in the IP address of the TV you want to remove.');
    }

    const tvs = currentConfig.tvs || [];
    const tvConfig = tvs.find((tv) => tv.ip === tvIp);
    if (!tvConfig) {
      throw new Error(`No TV with the address ${tvIp} is configured.`);
    }

    await gladys.setConfig({ tvs: tvs.filter((tv) => tv.ip !== tvIp) });
    clientManager.removeClient(tvIp);
    await clientManager.refreshConnectionStatus();

    return {
      en: `${tvConfig.name} (${tvIp}) has been removed, along with its certificates. If it was added as a device, delete the device from its dashboard page.`,
      fr: `${tvConfig.name} (${tvIp}) a été retirée, ainsi que ses certificats. Si elle avait été ajoutée comme appareil, supprimez l'appareil depuis sa page.`,
    };
  }

  if (actionKey === 'test_connection') {
    const tvIp = trim(fields?.tv_ip) || currentConfig.tvs?.[0]?.ip;
    if (!tvIp) {
      throw new Error('No TV is paired yet. Run step 1 and step 2 first.');
    }

    const tvConfig = currentConfig.tvs?.find((tv) => tv.ip === tvIp);
    if (!tvConfig || !tvConfig.certificate_key || !tvConfig.certificate_cert) {
      throw new Error(`The TV at ${tvIp} is not paired yet. Run step 1 and step 2 for this address first.`);
    }

    const client = clientManager.getOrCreateClient(tvConfig);
    if (!client.isConnected) {
      await client.connect();
    }
    await clientManager.refreshConnectionStatus();

    return {
      en: `Successfully connected to ${tvConfig.name} (${tvIp}).`,
      fr: `Connexion réussie à ${tvConfig.name} (${tvIp}).`,
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
