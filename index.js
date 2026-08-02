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
 * Initialize or re-initialize the connections to every configured Android TV.
 */
async function initTVConnections() {
  await clientManager.connectAll(config.tvs);
}

/**
 * Refresh the local configuration from Gladys.
 *
 * On failure the last known configuration is kept: falling back to an empty one
 * would drop the paired TVs and their certificates on the next save.
 */
async function refreshConfig() {
  try {
    config = normalizeConfig(await gladys.getConfig());
  } catch (err) {
    logger.warn(`[AndroidTV] Could not refresh the configuration, using the last known one: ${err.message}`);
  }
  return config;
}

// Listen for config updates
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('[AndroidTV] Configuration updated');
  config = normalizeConfig(newConfig);
  try {
    await initTVConnections();
  } catch (err) {
    logger.error(`[AndroidTV] Failed to apply the new configuration: ${err.message}`);
  }
});

// Handle scan requests
gladys.onScanRequest(async () => {
  logger.info('[AndroidTV] Scan requested, publishing discovered devices');
  await refreshConfig();
  const devices = await buildDiscoveredDevices(gladys, config);
  await gladys.publishDiscoveredDevices(devices);
});

// Handle incoming control commands from Gladys
gladys.onSetValue(async (device, feature, value) => {
  logger.info(`[AndroidTV] Set value <- ${feature.external_id} = ${value}`);

  const tvIp = resolveTvIp(device, feature);
  if (!tvIp) {
    throw new Error(`Unable to determine the target TV for feature ${feature.external_id}`);
  }

  const tvClient = clientManager.getClient(tvIp);
  if (!tvClient || !tvClient.isConnected) {
    throw new Error(`The Android TV at ${tvIp} is not connected. Make sure the TV is turned ON and paired.`);
  }

  const extId = feature.external_id;

  // 1. Remote key buttons
  if (extId.includes(':key:')) {
    await tvClient.sendKey(extId.slice(extId.indexOf(':key:') + 5));
    return;
  }

  // 2. App launchers
  if (extId.includes(':app:')) {
    const appId = extId.slice(extId.indexOf(':app:') + 5);
    const app = SUPPORTED_APPS.find((supported) => supported.id === appId);
    if (!app) {
      throw new Error(`Unknown app ID: ${appId}`);
    }
    await tvClient.sendApp(app.uri || app.package);
    return;
  }

  // 3. Power switch
  if (extId.endsWith(':power')) {
    await tvClient.setPower(Number(value) > 0);
    await gladys.publishState(extId, Number(value) > 0 ? 1 : 0).catch(() => {});
    return;
  }

  // 4. Volume control
  if (extId.endsWith(':volume')) {
    await tvClient.setVolumeLevel(Number(value));
    return;
  }

  // 5. Mute switch
  if (extId.endsWith(':mute')) {
    await tvClient.setMute(Number(value) > 0);
    await gladys.publishState(extId, Number(value) > 0 ? 1 : 0).catch(() => {});
    return;
  }

  throw new Error(`Unsupported feature external_id: ${extId}`);
});

// Handle UI actions (start_pairing, submit_pin, test_connection)
const ACTIONS = ['start_pairing', 'submit_pin', 'test_connection'];
ACTIONS.forEach((actionKey) => {
  gladys.onAction(actionKey, async (fields) => {
    await refreshConfig();
    return handleActionExecution(gladys, actionKey, fields, clientManager, config);
  });
});

/**
 * Find the IP address of the TV a feature belongs to.
 *
 * @param {Object} device The Gladys device.
 * @param {Object} feature The Gladys device feature.
 * @returns {string|undefined} The TV IP address.
 */
function resolveTvIp(device, feature) {
  const fromParams = device?.params?.find((param) => param.name === 'TV_IP')?.value;
  if (fromParams) {
    return fromParams;
  }
  // Fallback: the IP is part of the external id, with dots replaced by
  // underscores (ext:<selector>:tv:192_168_1_50:power).
  const match = feature?.external_id?.match(/:tv:([0-9_]+):/);
  return match ? match[1].replace(/_/g, '.') : undefined;
}

// -----------------------------------------------------------------------------
// Startup
// -----------------------------------------------------------------------------

// SIGTERM/SIGINT from the Gladys supervisor: close the TV sockets, then exit.
gladys.handleShutdown(() => clientManager.disconnectAll());

// Opens the WebSocket, authenticates and resynchronizes gladys.config. Without
// it the integration receives nothing — no action, no scan, no command — and
// the process exits as soon as this module finishes running.
await gladys.connect();

config = normalizeConfig(gladys.config);
await initTVConnections();

logger.info('[AndroidTV] Integration started');
