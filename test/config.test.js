import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';

test('normalizeConfig - should apply default values when config is empty', () => {
  const normalized = normalizeConfig({});
  assert.equal(normalized.tv_ip, '192.168.1.50');
  assert.equal(normalized.pairing_pin, '');
  assert.equal(normalized.certificate_key, '');
  assert.equal(normalized.certificate_cert, '');
  assert.equal(normalized.enable_app_shortcuts, true);
});

test('normalizeConfig - should preserve provided config values', () => {
  const input = {
    tv_ip: '192.168.1.100',
    pairing_pin: '123456',
    certificate_key: 'MY_PRIVATE_KEY',
    certificate_cert: 'MY_CERTIFICATE',
    enable_app_shortcuts: false,
  };
  const normalized = normalizeConfig(input);
  assert.equal(normalized.tv_ip, '192.168.1.100');
  assert.equal(normalized.pairing_pin, '123456');
  assert.equal(normalized.certificate_key, 'MY_PRIVATE_KEY');
  assert.equal(normalized.certificate_cert, 'MY_CERTIFICATE');
  assert.equal(normalized.enable_app_shortcuts, false);
});
