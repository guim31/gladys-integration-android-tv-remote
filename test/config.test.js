import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';

test('normalizeConfig - should not invent a TV when nothing is configured', () => {
  const normalized = normalizeConfig({});
  assert.deepEqual(normalized.tvs, []);
  assert.equal(normalized.enable_app_shortcuts, true);
});

test('normalizeConfig - should preserve provided multi-TV config values', () => {
  const input = {
    tvs: [
      {
        ip: '192.168.1.100',
        name: 'Salon TV',
        certificate_key: 'MY_KEY_1',
        certificate_cert: 'MY_CERT_1',
      },
      {
        ip: '192.168.1.101',
        name: 'Chambre TV',
        certificate_key: 'MY_KEY_2',
        certificate_cert: 'MY_CERT_2',
      },
    ],
    enable_app_shortcuts: false,
  };
  const normalized = normalizeConfig(input);
  assert.equal(normalized.tvs.length, 2);
  assert.equal(normalized.tvs[0].ip, '192.168.1.100');
  assert.equal(normalized.tvs[0].name, 'Salon TV');
  assert.equal(normalized.tvs[0].certificate_key, 'MY_KEY_1');
  assert.equal(normalized.tvs[1].ip, '192.168.1.101');
  assert.equal(normalized.tvs[1].name, 'Chambre TV');
  assert.equal(normalized.enable_app_shortcuts, false);
});

// Pairing inputs live in the action fields now: a leftover tv_ip from an older
// version must not resurrect a TV in the list.
test('normalizeConfig - should ignore the legacy tv_ip form field', () => {
  const normalized = normalizeConfig({ tv_ip: '192.168.1.50', tv_name: 'TV Salon', pairing_pin: 'B4B0C7' });
  assert.deepEqual(normalized.tvs, []);
});

test('normalizeConfig - should ignore malformed TV entries', () => {
  const normalized = normalizeConfig({ tvs: [{ name: 'No IP' }, null, { ip: '   ' }, { ip: '192.168.1.60' }] });
  assert.equal(normalized.tvs.length, 1);
  assert.equal(normalized.tvs[0].ip, '192.168.1.60');
});

test('normalizeConfig - should deduplicate TVs sharing an IP', () => {
  const normalized = normalizeConfig({
    tvs: [
      { ip: '192.168.1.50', name: 'Premier', certificate_key: 'K', certificate_cert: 'C' },
      { ip: '192.168.1.50', name: 'Doublon' },
    ],
  });
  assert.equal(normalized.tvs.length, 1);
  assert.equal(normalized.tvs[0].name, 'Premier');
});
