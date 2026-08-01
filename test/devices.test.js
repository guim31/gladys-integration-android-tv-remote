import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAndroidTVDevice, buildDiscoveredDevices } from '../src/devices/index.js';
import { SUPPORTED_APPS } from '../src/devices/apps.js';

const mockGladys = {
  externalId: (id) => `androidtv:${id}`,
};

test('buildAndroidTVDevice - should construct device structure correctly with app shortcuts', () => {
  const config = {
    tv_ip: '192.168.1.50',
    certificate_key: 'KEY',
    certificate_cert: 'CERT',
    enable_app_shortcuts: true,
  };

  const device = buildAndroidTVDevice(mockGladys, config);

  assert.equal(device.name, 'Android TV (192.168.1.50)');
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
  const config = {
    tv_ip: '192.168.1.50',
    enable_app_shortcuts: false,
  };

  const device = buildAndroidTVDevice(mockGladys, config);
  const appFeature = device.features.find((f) => f.external_id.includes(':app:'));
  assert.equal(appFeature, undefined);
});

test('buildDiscoveredDevices - should return array containing built device', async () => {
  const config = { tv_ip: '192.168.1.50', enable_app_shortcuts: true };
  const list = await buildDiscoveredDevices(mockGladys, config);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'Android TV (192.168.1.50)');
});

test('SUPPORTED_APPS - should contain major TV streaming apps', () => {
  const appIds = SUPPORTED_APPS.map((a) => a.id);
  assert.ok(appIds.includes('youtube'));
  assert.ok(appIds.includes('netflix'));
  assert.ok(appIds.includes('disneyplus'));
  assert.ok(appIds.includes('primevideo'));
  assert.ok(appIds.includes('spotify'));
});
