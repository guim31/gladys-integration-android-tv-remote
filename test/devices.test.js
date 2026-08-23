import test from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import {
  buildAndroidTVDevice,
  buildDiscoveredDevices,
  handleActionExecution,
  REMOTE_KEYS,
} from '../src/devices/index.js';
import { SUPPORTED_APPS, resolveApps } from '../src/devices/apps.js';

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

  // One dynamic select for every app, not one button per app: the buttons of
  // v1.0 were sensors in Gladys, nothing could be pressed in the UI.
  const appFeature = device.features.find((f) => f.external_id.endsWith(':app'));
  assert.ok(appFeature);
  assert.equal(appFeature.category, 'text');
  assert.equal(appFeature.type, 'select');
  assert.ok(Array.isArray(appFeature.supported_options));
  assert.ok(appFeature.supported_options.length > 0);
  appFeature.supported_options.forEach((option, index) => {
    assert.equal(typeof option.value, 'string');
    assert.equal(typeof option.label, 'string');
    assert.equal(option.sort_order, index);
  });
  assert.ok(appFeature.supported_options.some((option) => option.value === 'youtube'));
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

test('buildAndroidTVDevice - should omit the application select when disabled', () => {
  const device = buildAndroidTVDevice(mockGladys, { ip: '192.168.1.50' }, false);
  assert.equal(
    device.features.find((f) => f.external_id.endsWith(':app')),
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

test('resolveApps - should hide catalog apps and append custom ones', () => {
  const apps = resolveApps({
    hidden_apps: ['spotify', 'arte'],
    custom_apps: [{ id: 'francetv', name: 'France TV', uri: 'https://www.france.tv' }],
  });
  const ids = apps.map((app) => app.id);
  assert.ok(!ids.includes('spotify'));
  assert.ok(!ids.includes('arte'));
  assert.equal(ids[ids.length - 1], 'francetv');
});

test('resolveApps - a custom app overriding a catalog entry keeps its package for feedback', () => {
  const apps = resolveApps({
    hidden_apps: [],
    custom_apps: [{ id: 'spotify', name: 'Spotify', uri: 'https://open.spotify.com' }],
  });
  const spotify = apps.filter((app) => app.id === 'spotify');
  assert.equal(spotify.length, 1, 'the catalog entry must be replaced, not doubled');
  assert.equal(spotify[0].uri, 'https://open.spotify.com');
  assert.equal(spotify[0].package, 'com.spotify.tv.android');
});

test('buildDiscoveredDevices - the application select must follow the configured apps', async () => {
  const config = {
    tvs: [{ ip: '192.168.1.57', name: 'MiBox', certificate_key: 'K', certificate_cert: 'C' }],
    enable_app_shortcuts: true,
    hidden_apps: ['spotify'],
    custom_apps: [{ id: 'francetv', name: 'France TV', uri: 'https://www.france.tv' }],
  };
  const devices = await buildDiscoveredDevices(mockGladys, config);
  const options = devices[0].features.find((f) => f.external_id.endsWith(':app')).supported_options;
  assert.ok(!options.some((option) => option.value === 'spotify'));
  assert.ok(options.some((option) => option.value === 'francetv'));
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
    setPairingTarget(ip, name, mac = '') {
      this.pairingTarget = { ip, name, mac };
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
  assert.deepEqual(manager.pairingTarget, { ip: '192.168.100.130', name: 'Shield TV', mac: '' });
});

test('handleActionExecution - start_pairing should normalize and carry the MAC address', async () => {
  const client = { startPairing: async () => ({ status: 'secret_required' }) };
  const manager = createManagerMock(client);

  await handleActionExecution(
    mockGladys,
    'start_pairing',
    { tv_ip: '192.168.1.50', tv_name: 'TV Salon', tv_mac: ' 64-E4-D5-B4-12-66 ' },
    manager,
    { tvs: [] },
  );

  assert.equal(manager.pairingTarget.mac, '64:e4:d5:b4:12:66');
});

test('handleActionExecution - start_pairing should reject a malformed MAC address', async () => {
  const manager = createManagerMock({ startPairing: async () => ({}) });
  await assert.rejects(
    () =>
      handleActionExecution(mockGladys, 'start_pairing', { tv_ip: '192.168.1.50', tv_mac: 'not-a-mac' }, manager, {
        tvs: [],
      }),
    /not a valid MAC address/,
  );
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

test('handleActionExecution - submit_pin should persist the MAC address typed in step 1', async () => {
  const saved = [];
  const gladys = { ...mockGladys, setConfig: async (partial) => saved.push(partial) };
  const client = {
    startPairing: async () => ({}),
    submitPin: async () => ({ status: 'success', certificates: { key: 'K', cert: 'C' } }),
  };
  const manager = createManagerMock(client);

  await handleActionExecution(
    gladys,
    'start_pairing',
    { tv_ip: '192.168.1.50', tv_mac: '64:E4:D5:B4:12:66' },
    manager,
    { tvs: [] },
  );
  await handleActionExecution(gladys, 'submit_pin', { pairing_pin: 'B4B0C7' }, manager, { tvs: [] });

  assert.equal(saved[0].tvs[0].mac, '64:e4:d5:b4:12:66');
});

test('handleActionExecution - submit_pin without a MAC should keep the stored one', async () => {
  const saved = [];
  const gladys = { ...mockGladys, setConfig: async (partial) => saved.push(partial) };
  const client = {
    startPairing: async () => ({}),
    submitPin: async () => ({ status: 'success', certificates: { key: 'K2', cert: 'C2' } }),
  };
  const manager = createManagerMock(client);
  const config = {
    tvs: [
      { ip: '192.168.1.50', name: 'TV Salon', mac: '64:e4:d5:b4:12:66', certificate_key: 'K1', certificate_cert: 'C1' },
    ],
  };

  // Re-pairing the same TV (e.g. after a factory reset) without re-typing the MAC.
  await handleActionExecution(gladys, 'start_pairing', { tv_ip: '192.168.1.50' }, manager, config);
  await handleActionExecution(gladys, 'submit_pin', { pairing_pin: 'B4B0C7' }, manager, config);

  assert.equal(saved[0].tvs[0].mac, '64:e4:d5:b4:12:66');
});

test('handleActionExecution - set_mac should store the normalized MAC of a paired TV', async () => {
  const saved = [];
  const gladys = { ...mockGladys, setConfig: async (partial) => saved.push(partial) };
  const manager = createManagerMock({});
  const config = {
    tvs: [{ ip: '192.168.1.50', name: 'TV Salon', mac: '', certificate_key: 'K', certificate_cert: 'C' }],
  };

  const result = await handleActionExecution(
    gladys,
    'set_mac',
    { tv_ip: '192.168.1.50', tv_mac: '64E4D5B41266' },
    manager,
    config,
  );

  assert.equal(saved[0].tvs[0].mac, '64:e4:d5:b4:12:66');
  assert.ok(result.fr.includes('64:e4:d5:b4:12:66'));
});

test('handleActionExecution - set_mac with an empty MAC should clear the stored one', async () => {
  const saved = [];
  const gladys = { ...mockGladys, setConfig: async (partial) => saved.push(partial) };
  const manager = createManagerMock({});
  const config = {
    tvs: [
      { ip: '192.168.1.50', name: 'TV Salon', mac: '64:e4:d5:b4:12:66', certificate_key: 'K', certificate_cert: 'C' },
    ],
  };

  const result = await handleActionExecution(gladys, 'set_mac', { tv_ip: '192.168.1.50' }, manager, config);

  assert.equal(saved[0].tvs[0].mac, '');
  assert.ok(result.fr.includes('effacée'));
});

test('handleActionExecution - set_mac should reject an invalid MAC and an unknown TV', async () => {
  const manager = createManagerMock({});
  const config = { tvs: [{ ip: '192.168.1.50', name: 'TV Salon', certificate_key: 'K', certificate_cert: 'C' }] };

  await assert.rejects(
    () => handleActionExecution(mockGladys, 'set_mac', { tv_ip: '192.168.1.50', tv_mac: 'zz:zz' }, manager, config),
    /not a valid MAC address/,
  );
  await assert.rejects(
    () => handleActionExecution(mockGladys, 'set_mac', { tv_ip: '10.0.0.9', tv_mac: '64E4D5B41266' }, manager, config),
    /No TV with the address/,
  );
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
