// -----------------------------------------------------------------------------
// Android TV Remote Integration for Gladys Assistant
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import { AndroidTVClientManager } from './src/remote/client-manager.js';
import { buildDiscoveredDevices, handleActionExecution } from './src/devices/index.js';
import { SUPPORTED_APPS } from './src/devices/apps.js';

const gladys = new GladysIntegration();

let config = normalizeConfig();
const clientManager = new AndroidTVClientManager(gladys);

/**
 * Initialize or re-initialize connections to all configured Android TV devices.
 */
async function initTVConnections() {
  await clientManager.connectAll(config.tvs);
}

// Listen for config updates
gladys.onConfigChange((newConfig) => {
  logger.info('Configuration updated');
  config = normalizeConfig(newConfig);
  initTVConnections();
});

// Handle scan requests
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> publishing discovered Android TV devices');
  const devices = await buildDiscoveredDevices(gladys, config);
  await gladys.publishDiscoveredDevices(devices);
});

// Handle incoming control commands from Gladys
gladys.onSetValue(async (device, feature, value) => {
  logger.info(`onSetValue <- ${feature.external_id} = ${value}`);

  // Extract TV IP address from device parameters or feature external ID
  let tvIp = device?.params?.find((p) => p.name === 'TV_IP')?.value;
  if (!tvIp && feature?.external_id) {
    const match = feature.external_id.match(/tv:([0-9_]+):/);
    if (match) {
      tvIp = match[1].replace(/_/g, '.');
    }
  }

  if (!tvIp) {
    throw new Error(`Unable to determine target TV IP for feature ${feature.external_id}`);
  }

  const tvClient = clientManager.getClient(tvIp);

  if (!tvClient || !tvClient.isConnected) {
    throw new Error(`Android TV at ${tvIp} is not connected. Make sure the TV is turned ON and paired.`);
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
  return handleActionExecution(gladys, actionKey, fields, clientManager, currentConfig);
});

// Startup initialization
const rawConfig = await gladys.getConfig().catch(() => ({}));
config = normalizeConfig(rawConfig);
await initTVConnections();
