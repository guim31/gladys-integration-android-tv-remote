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

  const tvClient = await ensureClientConnected(tvIp);

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

  // 3. Power switch. The resulting state is not published here: KEYCODE_POWER
  // is a toggle, so the TV itself is the only source of truth — its 'powered'
  // report is what updates Gladys.
  if (extId.endsWith(':power')) {
    await tvClient.setPower(Number(value) > 0);
    return;
  }

  // 4. Volume control
  if (extId.endsWith(':volume')) {
    await tvClient.setVolumeLevel(Number(value));
    return;
  }

  // 5. Mute switch. Same as power: the state published in Gladys comes from
  // the volume report of the TV, not from the request.
  if (extId.endsWith(':mute')) {
    await tvClient.setMute(Number(value) > 0);
    return;
  }

  throw new Error(`Unsupported feature external_id: ${extId}`);
});

// The Gladys device of a TV was deleted: without it, the states published by
// the connection have nowhere to land, so the session — and its background
// reconnection attempts — can stop. The TV stays paired in the configuration;
// a new device scan re-creates the device.
gladys.onDeviceDeleted(async (device) => {
  const tvIp = device?.params?.find((param) => param.name === 'TV_IP')?.value;
  if (!tvIp) {
    return;
  }
  logger.info(`[AndroidTV] Device of the TV at ${tvIp} deleted, closing its session.`);
  clientManager.removeClient(tvIp);
  await clientManager.refreshConnectionStatus();
});

// The device of a paired TV was (re-)added from the discovery tab: connect
// right away so its states start flowing without waiting for a restart.
gladys.onDeviceCreated(async (device) => {
  const tvIp = device?.params?.find((param) => param.name === 'TV_IP')?.value;
  if (!tvIp) {
    return;
  }
  const tvConfig = config.tvs?.find((tv) => tv.ip === tvIp);
  if (!tvConfig?.certificate_key || !tvConfig?.certificate_cert) {
    return;
  }
  const client = clientManager.getOrCreateClient(tvConfig);
  if (client.isConnected) {
    return;
  }
  try {
    await client.connect();
  } catch (err) {
    logger.warn(`[AndroidTV] The TV at ${tvIp} is not reachable yet (${err.message}), retrying in the background.`);
    clientManager.scheduleReconnect(tvIp);
  }
  await clientManager.refreshConnectionStatus();
});

// Handle UI actions (start_pairing, submit_pin, test_connection, remove_tv)
const ACTIONS = ['start_pairing', 'submit_pin', 'test_connection', 'remove_tv'];
ACTIONS.forEach((actionKey) => {
  gladys.onAction(actionKey, async (fields) => {
    await refreshConfig();
    return handleActionExecution(gladys, actionKey, fields, clientManager, config);
  });
});

/**
 * Get a live client for a TV, reconnecting on the fly when needed.
 *
 * A TV in network standby still accepts Remote v2 connections: reconnecting
 * here is what makes "turn on" work on a TV that dropped its session. Only a
 * TV that is fully powered off (or unplugged) stays unreachable.
 *
 * @param {string} tvIp The TV IP address.
 * @returns {Promise<Object>} A connected AndroidTVClient.
 */
async function ensureClientConnected(tvIp) {
  const existing = clientManager.getClient(tvIp);
  if (existing?.isConnected) {
    return existing;
  }

  const tvConfig = config.tvs?.find((tv) => tv.ip === tvIp);
  if (!tvConfig || !tvConfig.certificate_key || !tvConfig.certificate_cert) {
    throw new Error(`The Android TV at ${tvIp} is not paired. Run the pairing sequence first.`);
  }

  const client = clientManager.getOrCreateClient(tvConfig);
  logger.info(`[AndroidTV] No live session with ${tvIp}, trying to reconnect...`);
  try {
    await client.connect();
  } catch (err) {
    // Keep probing in the background so the TV is picked up as soon as it
    // becomes reachable again — without blocking this command any longer.
    clientManager.scheduleReconnect(tvIp);
    throw new Error(
      `The Android TV at ${tvIp} is not reachable (${err.message}). ` +
        'Remote v2 only reaches a TV that is ON or in network standby: a TV that is fully powered off ' +
        'must be turned back on with its physical remote or HDMI-CEC first.',
      { cause: err },
    );
  }
  return client;
}

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
