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

test('handleActionExecution - should trigger start_pairing action', async () => {
  const client = { startPairing: async () => ({ status: 'secret_required' }) };
  const manager = { getOrCreateClient: () => client };

  const result = await handleActionExecution(mockGladys, 'start_pairing', { tv_ip: '192.168.100.130' }, manager, {
    tv_ip: '192.168.100.130',
    tvs: [],
  });

  assert.ok(result.en.includes('192.168.100.130'));
  assert.ok(result.fr.includes('Appairage démarré'));
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
    submitPin: async () => ({ status: 'success', certificates: { key: 'NEW_KEY', cert: 'NEW_CERT' } }),
  };
  const manager = {
    getOrCreateClient: () => client,
    refreshConnectionStatus: async () => {},
  };

  const result = await handleActionExecution(gladys, 'submit_pin', {}, manager, {
    tv_ip: '192.168.1.50',
    tv_name: 'TV Salon',
    pairing_pin: '123456',
    tvs: [],
  });

  assert.equal(saved[0].tvs.length, 1);
  assert.equal(saved[0].tvs[0].ip, '192.168.1.50');
  assert.equal(saved[0].tvs[0].certificate_key, 'NEW_KEY');
  assert.equal(saved[0].tvs[0].certificate_cert, 'NEW_CERT');
  assert.ok(result.fr.includes('Appairage réussi'));
});

test('handleActionExecution - submit_pin should keep the other paired TVs', async () => {
  const saved = [];
  const gladys = { ...mockGladys, setConfig: async (partial) => saved.push(partial) };
  const client = {
    submitPin: async () => ({ status: 'success', certificates: { key: 'K2', cert: 'C2' } }),
  };
  const manager = { getOrCreateClient: () => client, refreshConnectionStatus: async () => {} };

  await handleActionExecution(gladys, 'submit_pin', {}, manager, {
    tv_ip: '192.168.1.51',
    pairing_pin: '123456',
    tvs: [{ ip: '192.168.1.50', name: 'TV Salon', certificate_key: 'K1', certificate_cert: 'C1' }],
  });

  assert.equal(saved[0].tvs.length, 2);
  assert.equal(saved[0].tvs[0].certificate_key, 'K1');
  assert.equal(saved[0].tvs[1].ip, '192.168.1.51');
});

test('handleActionExecution - should reject an action without any TV IP', async () => {
  const manager = { getOrCreateClient: () => ({}) };
  await assert.rejects(
    () => handleActionExecution(mockGladys, 'start_pairing', {}, manager, { tvs: [] }),
    /IP address/,
  );
});

test('handleActionExecution - test_connection should refuse an unpaired TV', async () => {
  const client = { isPaired: () => false, isConnected: false, connect: async () => true };
  const manager = { getOrCreateClient: () => client, refreshConnectionStatus: async () => {} };

  await assert.rejects(
    () => handleActionExecution(mockGladys, 'test_connection', {}, manager, { tv_ip: '192.168.1.50', tvs: [] }),
    /not paired/,
  );
});
