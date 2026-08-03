import test from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import {
  buildAndroidTVDevice,
  buildDiscoveredDevices,
  handleActionExecution,
  REMOTE_KEYS,
} from '../src/devices/index.js';
import { SUPPORTED_APPS } from '../src/devices/apps.js';

const mockGladys = {
  externalId: (id) => `androidtv:${id}`,
};

const pairedTv = {
  ip: '192.168.1.50',
  name: 'Living Room TV',
  certificate_key: 'KEY',
  certificate_cert: 'CERT',
};

test('buildAndroidTVDevice - should construct device structure correctly with app shortcuts', () => {
  const device = buildAndroidTVDevice(mockGladys, pairedTv, true);

  assert.equal(device.name, 'Living Room TV');
  assert.equal(device.external_id, 'androidtv:tv:192_168_1_50');
  assert.ok(Array.isArray(device.features));

  const powerFeature = device.features.find((f) => f.external_id.endsWith(':power'));
  assert.ok(powerFeature);
  assert.equal(powerFeature.category, 'television');
  assert.equal(powerFeature.type, 'binary');

  const volumeFeature = device.features.find((f) => f.external_id.endsWith(':volume'));
  assert.ok(volumeFeature);
  assert.equal(volumeFeature.type, 'volume');

  const muteFeature = device.features.find((f) => f.external_id.endsWith(':mute'));
  assert.ok(muteFeature);
  assert.equal(muteFeature.type, 'volume-mute');

  const youtubeFeature = device.features.find((f) => f.external_id.endsWith(':app:youtube'));
  assert.ok(youtubeFeature);
  assert.equal(youtubeFeature.category, 'button');
});

test('buildAndroidTVDevice - every feature must use a category and a type known to Gladys', () => {
  const device = buildAndroidTVDevice(mockGladys, pairedTv, true);
  const categories = Object.values(DEVICE_FEATURE_CATEGORIES);

  device.features.forEach((feature) => {
    assert.ok(categories.includes(feature.category), `unknown category: ${feature.category}`);

    const groupKey = Object.keys(DEVICE_FEATURE_CATEGORIES).find(
      (key) => DEVICE_FEATURE_CATEGORIES[key] === feature.category,
    );
    const validTypes = Object.values(DEVICE_FEATURE_TYPES[groupKey] || {});
    assert.ok(validTypes.includes(feature.type), `unknown type for ${feature.category}: ${feature.type}`);
  });
});

test('buildAndroidTVDevice - feature external ids must be unique', () => {
  const device = buildAndroidTVDevice(mockGladys, pairedTv, true);
  const ids = device.features.map((f) => f.external_id);
  assert.equal(new Set(ids).size, ids.length);
});

test('buildAndroidTVDevice - must not expose the TLS certificates as device params', () => {
  const device = buildAndroidTVDevice(mockGladys, pairedTv, true);
  const paramNames = device.params.map((param) => param.name);
  assert.deepEqual(paramNames, ['TV_IP']);
});

test('buildAndroidTVDevice - should expose every remote key', () => {
  const device = buildAndroidTVDevice(mockGladys, pairedTv, false);
  REMOTE_KEYS.forEach((remoteKey) => {
    assert.ok(
      device.features.find((f) => f.external_id.endsWith(`:key:${remoteKey.key}`)),
      `missing key feature: ${remoteKey.key}`,
    );
  });
});

test('buildAndroidTVDevice - should omit app shortcuts when disabled', () => {
  const device = buildAndroidTVDevice(mockGladys, { ip: '192.168.1.50' }, false);
  assert.equal(
    device.features.find((f) => f.external_id.includes(':app:')),
    undefined,
  );
});

test('buildDiscoveredDevices - should only publish paired TVs', async () => {
  const config = {
    tvs: [
      { ip: '192.168.1.50', name: 'TV Salon', certificate_key: 'K', certificate_cert: 'C' },
      { ip: '192.168.1.51', name: 'TV Chambre', certificate_key: 'K', certificate_cert: 'C' },
      { ip: '192.168.1.52', name: 'TV pas encore appairée' },
    ],
    enable_app_shortcuts: true,
  };
  const list = await buildDiscoveredDevices(mockGladys, config);
  assert.equal(list.length, 2);
  assert.equal(list[0].name, 'TV Salon');
  assert.equal(list[1].name, 'TV Chambre');
});

test('SUPPORTED_APPS - should contain major TV streaming apps', () => {
  const appIds = SUPPORTED_APPS.map((a) => a.id);
  assert.ok(appIds.includes('youtube'));
  assert.ok(appIds.includes('netflix'));
  assert.ok(appIds.includes('disneyplus'));
  assert.ok(appIds.includes('primevideo'));
  assert.ok(appIds.includes('spotify'));
});

/**
 * Build a client manager mock reproducing the pairing hand-off between the two
 * numbered actions.
 *
 * @param {Object} client The client returned to every caller.
 * @returns {Object} The mock manager.
 */
function createManagerMock(client) {
  return {
    pairingTarget: null,
    getOrCreateClient: () => client,
    setPairingTarget(ip, name) {
      this.pairingTarget = { ip, name };
    },
    getPairingTarget() {
      return this.pairingTarget ? { ...this.pairingTarget, client } : undefined;
    },
    refreshConnectionStatus: async () => {},
    removedClients: [],
    removeClient(ip) {
      this.removedClients.push(ip);
    },
  };
}

test('handleActionExecution - start_pairing should take its IP from the action field', async () => {
  const client = { startPairing: async () => ({ status: 'secret_required' }) };
  const manager = createManagerMock(client);

  const result = await handleActionExecution(
    mockGladys,
    'start_pairing',
    { tv_ip: '192.168.100.130', tv_name: 'Shield TV' },
    manager,
    { tvs: [] },
  );

  assert.ok(result.en.includes('192.168.100.130'));
  assert.ok(result.fr.includes('code PIN'));
  // Step 2 must find the TV again without asking for the address twice.
  assert.deepEqual(manager.pairingTarget, { ip: '192.168.100.130', name: 'Shield TV' });
});

test('handleActionExecution - start_pairing should reject a missing IP', async () => {
  const manager = createManagerMock({});
  await assert.rejects(
    () => handleActionExecution(mockGladys, 'start_pairing', {}, manager, { tvs: [] }),
    /IP address/,
  );
});

test('handleActionExecution - submit_pin should store the certificates with setConfig', async () => {
  const saved = [];
  const gladys = {
    ...mockGladys,
    setConfig: async (partial) => {
      saved.push(partial);
      return { success: true };
    },
  };
  const client = {
    startPairing: async () => ({}),
    submitPin: async () => ({ status: 'success', certificates: { key: 'NEW_KEY', cert: 'NEW_CERT' } }),
  };
  const manager = createManagerMock(client);

  await handleActionExecution(gladys, 'start_pairing', { tv_ip: '192.168.1.50', tv_name: 'TV Salon' }, manager, {
    tvs: [],
  });
  const result = await handleActionExecution(gladys, 'submit_pin', { pairing_pin: 'B4B0C7' }, manager, { tvs: [] });

  assert.equal(saved[0].tvs.length, 1);
  assert.equal(saved[0].tvs[0].ip, '192.168.1.50');
  assert.equal(saved[0].tvs[0].name, 'TV Salon');
  assert.equal(saved[0].tvs[0].certificate_key, 'NEW_KEY');
  assert.equal(saved[0].tvs[0].certificate_cert, 'NEW_CERT');
  assert.ok(result.fr.includes('appairée'));
});

test('handleActionExecution - submit_pin should keep the other paired TVs', async () => {
  const saved = [];
  const gladys = { ...mockGladys, setConfig: async (partial) => saved.push(partial) };
  const client = {
    startPairing: async () => ({}),
    submitPin: async () => ({ status: 'success', certificates: { key: 'K2', cert: 'C2' } }),
  };
  const manager = createManagerMock(client);
  const config = { tvs: [{ ip: '192.168.1.50', name: 'TV Salon', certificate_key: 'K1', certificate_cert: 'C1' }] };

  await handleActionExecution(gladys, 'start_pairing', { tv_ip: '192.168.1.51' }, manager, config);
  await handleActionExecution(gladys, 'submit_pin', { pairing_pin: 'B4B0C7' }, manager, config);

  assert.equal(saved[0].tvs.length, 2);
  assert.equal(saved[0].tvs[0].certificate_key, 'K1');
  assert.equal(saved[0].tvs[1].ip, '192.168.1.51');
});

test('handleActionExecution - submit_pin should explain that step 1 is missing', async () => {
  const manager = createManagerMock({});
  await assert.rejects(
    () => handleActionExecution(mockGladys, 'submit_pin', { pairing_pin: 'B4B0C7' }, manager, { tvs: [] }),
    /No pairing sequence is running/,
  );
});

test('handleActionExecution - submit_pin should require a PIN', async () => {
  const manager = createManagerMock({});
  await assert.rejects(
    () => handleActionExecution(mockGladys, 'submit_pin', {}, manager, { tvs: [] }),
    /PIN code displayed on the TV/,
  );
});

test('handleActionExecution - remove_tv should drop the TV, its certificates and its client', async () => {
  const saved = [];
  const gladys = { ...mockGladys, setConfig: async (partial) => saved.push(partial) };
  const manager = createManagerMock({});
  const config = {
    tvs: [
      { ip: '192.168.1.50', name: 'TV Salon', certificate_key: 'K1', certificate_cert: 'C1' },
      { ip: '192.168.1.51', name: 'TV Chambre', certificate_key: 'K2', certificate_cert: 'C2' },
    ],
  };

  const result = await handleActionExecution(gladys, 'remove_tv', { tv_ip: '192.168.1.50' }, manager, config);

  assert.equal(saved[0].tvs.length, 1);
  assert.equal(saved[0].tvs[0].ip, '192.168.1.51');
  assert.deepEqual(manager.removedClients, ['192.168.1.50']);
  assert.ok(result.fr.includes('TV Salon'));
});

test('handleActionExecution - remove_tv should refuse an unknown TV', async () => {
  const manager = createManagerMock({});
  await assert.rejects(
    () => handleActionExecution(mockGladys, 'remove_tv', { tv_ip: '192.168.1.99' }, manager, { tvs: [] }),
    /No TV with the address/,
  );
});

test('handleActionExecution - remove_tv should require an IP address', async () => {
  const manager = createManagerMock({});
  await assert.rejects(() => handleActionExecution(mockGladys, 'remove_tv', {}, manager, { tvs: [] }), /IP address/);
});

test('handleActionExecution - test_connection should refuse an unpaired TV', async () => {
  const manager = createManagerMock({ isConnected: false, connect: async () => true });

  await assert.rejects(
    () => handleActionExecution(mockGladys, 'test_connection', { tv_ip: '192.168.1.50' }, manager, { tvs: [] }),
    /not paired/,
  );
});

test('handleActionExecution - test_connection should default to the first paired TV', async () => {
  let connected = false;
  const manager = createManagerMock({
    isConnected: false,
    connect: async () => {
      connected = true;
      return true;
    },
  });

  const result = await handleActionExecution(mockGladys, 'test_connection', {}, manager, {
    tvs: [{ ip: '192.168.1.50', name: 'TV Salon', certificate_key: 'K', certificate_cert: 'C' }],
  });

  assert.ok(connected);
  assert.ok(result.fr.includes('TV Salon'));
});
