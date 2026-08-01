// -----------------------------------------------------------------------------
// Android TV Remote Integration for Gladys Assistant
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import { AndroidTVClient } from './src/remote/android-tv-client.js';
import { buildDiscoveredDevices, handleActionExecution } from './src/devices/index.js';
import { SUPPORTED_APPS } from './src/devices/apps.js';

const gladys = new GladysIntegration();

let config = normalizeConfig();
let tvClient = null;

/**
 * Initialize or re-initialize connection to Android TV device.
 */
async function initTVConnection() {
  if (tvClient) {
    tvClient.disconnect();
    tvClient = null;
  }

  tvClient = new AndroidTVClient(config);

  // Register real-time feedback event callbacks
  tvClient.on('power', async (state) => {
    const powerFeatureId = gladys.externalId(`tv:${config.tv_ip.replace(/[^a-zA-Z0-9]/g, '_')}:power`);
    await gladys.publishState(powerFeatureId, state ? 1 : 0).catch(() => {});
  });

  tvClient.on('volume', async (vol) => {
    const ipSanitized = config.tv_ip.replace(/[^a-zA-Z0-9]/g, '_');
    if (typeof vol.level === 'number') {
      const volFeatureId = gladys.externalId(`tv:${ipSanitized}:volume`);
      await gladys.publishState(volFeatureId, vol.level).catch(() => {});
    }
    if (typeof vol.muted === 'boolean') {
      const muteFeatureId = gladys.externalId(`tv:${ipSanitized}:mute`);
      await gladys.publishState(muteFeatureId, vol.muted ? 1 : 0).catch(() => {});
    }
  });

  // Attempt connection if certificates are present
  if (config.certificate_key && config.certificate_cert) {
    try {
      await tvClient.connect();
      await gladys.setConnectionStatus(true);
      logger.info(`Android TV Remote connected to ${config.tv_ip}`);
    } catch (err) {
      logger.error('Failed to connect to Android TV:', err.message);
      await gladys
        .setConnectionStatus(false, {
          en: `Connection failed: ${err.message}`,
          fr: `Échec de connexion : ${err.message}`,
        })
        .catch(() => {});
    }
  } else {
    logger.info('No paired TLS certificates found. Please pair with your Android TV in integration settings.');
    await gladys.setConnectionStatus(false, {
      en: 'Pairing required. Click Start Pairing in integration settings.',
      fr: "Appairage requis. Cliquez sur Démarrer l'appairage dans les paramètres.",
    });
  }
}

// Listen for config updates
gladys.onConfigChange((newConfig) => {
  logger.info('Configuration updated');
  config = normalizeConfig(newConfig);
  initTVConnection();
});

// Handle scan requests
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> publishing discovered Android TV device');
  const devices = await buildDiscoveredDevices(gladys, config);
  await gladys.publishDiscoveredDevices(devices);
});

// Handle incoming control commands from Gladys
gladys.onSetValue(async (device, feature, value) => {
  logger.info(`onSetValue <- ${feature.external_id} = ${value}`);

  if (!tvClient || !tvClient.isConnected) {
    throw new Error('Android TV is not connected. Make sure the TV is turned ON and paired.');
  }

  const extId = feature.external_id;

  // 1. Power Switch
  if (extId.endsWith(':power')) {
    await gladys.publishState(feature.external_id, value).catch(() => {});
    await tvClient.sendKey('power');
    return;
  }

  // 2. Volume control
  if (extId.endsWith(':volume')) {
    await gladys.publishState(feature.external_id, value).catch(() => {});
    // Send step volume command
    if (value > 50) {
      await tvClient.sendKey('volume_up');
    } else {
      await tvClient.sendKey('volume_down');
    }
    return;
  }

  // 3. Mute Switch
  if (extId.endsWith(':mute')) {
    await gladys.publishState(feature.external_id, value).catch(() => {});
    await tvClient.sendKey('mute');
    return;
  }

  // 4. Remote Key Buttons
  if (extId.includes(':key:')) {
    const keyName = extId.slice(extId.indexOf(':key:') + 5);
    await tvClient.sendKey(keyName);
    return;
  }

  // 5. App Launchers
  if (extId.includes(':app:')) {
    const appId = extId.slice(extId.indexOf(':app:') + 5);
    const app = SUPPORTED_APPS.find((a) => a.id === appId);
    if (!app) {
      throw new Error(`Unknown app ID: ${appId}`);
    }
    await tvClient.sendApp(app.uri || app.package);
    return;
  }

  throw new Error(`Unsupported feature external_id: ${extId}`);
});

// Handle UI actions (start_pairing, submit_pin, test_connection)
gladys.onAction(async (actionKey, fields) => {
  const currentConfig = normalizeConfig(await gladys.getConfig().catch(() => ({})));
  if (!tvClient) {
    tvClient = new AndroidTVClient(currentConfig);
  }
  return handleActionExecution(gladys, actionKey, fields, tvClient, currentConfig);
});

// Startup initialization
const rawConfig = await gladys.getConfig().catch(() => ({}));
config = normalizeConfig(rawConfig);
await initTVConnection();
