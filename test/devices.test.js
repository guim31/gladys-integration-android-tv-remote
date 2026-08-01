import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAndroidTVDevice, buildDiscoveredDevices } from '../src/devices/index.js';
import { SUPPORTED_APPS } from '../src/devices/apps.js';

const mockGladys = {
  externalId: (id) => `androidtv:${id}`,
};

test('buildAndroidTVDevice - should construct device structure correctly with app shortcuts', () => {
  const tvConfig = {
    ip: '192.168.1.50',
    name: 'Living Room TV',
    certificate_key: 'KEY',
    certificate_cert: 'CERT',
  };

  const device = buildAndroidTVDevice(mockGladys, tvConfig, true);

  assert.equal(device.name, 'Living Room TV');
  assert.equal(device.external_id, 'androidtv:tv:192_168_1_50');
  assert.ok(Array.isArray(device.features));

  // Verify power feature presence
  const powerFeature = device.features.find((f) => f.external_id.endsWith(':power'));
  assert.ok(powerFeature);
  assert.equal(powerFeature.category, 'television');
  assert.equal(powerFeature.type, 'turn-on');

  // Verify volume feature presence
  const volumeFeature = device.features.find((f) => f.external_id.endsWith(':volume'));
  assert.ok(volumeFeature);
  assert.equal(volumeFeature.category, 'television');
  assert.equal(volumeFeature.type, 'volume');

  // Verify YouTube app feature presence
  const youtubeFeature = device.features.find((f) => f.external_id.endsWith(':app:youtube'));
  assert.ok(youtubeFeature);
  assert.equal(youtubeFeature.category, 'button');
});

test('buildAndroidTVDevice - should omit app shortcuts when disabled', () => {
  const tvConfig = {
    ip: '192.168.1.50',
  };

  const device = buildAndroidTVDevice(mockGladys, tvConfig, false);
  const appFeature = device.features.find((f) => f.external_id.includes(':app:'));
  assert.equal(appFeature, undefined);
});

test('buildDiscoveredDevices - should return array containing built devices for all configured TVs', async () => {
  const config = {
    tvs: [
      { ip: '192.168.1.50', name: 'TV Salon' },
      { ip: '192.168.1.51', name: 'TV Chambre' },
      { ip: '192.168.1.52', name: 'TV Cuisine' },
    ],
    enable_app_shortcuts: true,
  };
  const list = await buildDiscoveredDevices(mockGladys, config);
  assert.equal(list.length, 3);
  assert.equal(list[0].name, 'TV Salon');
  assert.equal(list[1].name, 'TV Chambre');
  assert.equal(list[2].name, 'TV Cuisine');
});

test('SUPPORTED_APPS - should contain major TV streaming apps', () => {
  const appIds = SUPPORTED_APPS.map((a) => a.id);
  assert.ok(appIds.includes('youtube'));
  assert.ok(appIds.includes('netflix'));
  assert.ok(appIds.includes('disneyplus'));
  assert.ok(appIds.includes('primevideo'));
  assert.ok(appIds.includes('spotify'));
});
