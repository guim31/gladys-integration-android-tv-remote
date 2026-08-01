import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';

test('normalizeConfig - should apply default values when config is empty', () => {
  const normalized = normalizeConfig({});
  assert.equal(normalized.tvs.length, 1);
  assert.equal(normalized.tvs[0].ip, '192.168.1.50');
  assert.equal(normalized.tvs[0].name, 'Android TV (192.168.1.50)');
  assert.equal(normalized.tvs[0].certificate_key, '');
  assert.equal(normalized.tvs[0].certificate_cert, '');
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
  assert.equal(normalized.tvs[1].ip, '192.168.1.101');
  assert.equal(normalized.tvs[1].name, 'Chambre TV');
  assert.equal(normalized.enable_app_shortcuts, false);
});
