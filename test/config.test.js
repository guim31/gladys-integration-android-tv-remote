import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, normalizeMac, parseHiddenApps, parseCustomApps } from '../src/config.js';

test('normalizeConfig - should not invent a TV when nothing is configured', () => {
  const normalized = normalizeConfig({});
  assert.deepEqual(normalized.tvs, []);
  assert.equal(normalized.enable_app_shortcuts, true);
  assert.deepEqual(normalized.hidden_apps, []);
  assert.deepEqual(normalized.custom_apps, []);
});

test('parseHiddenApps - should accept names and ids, in any usual separator', () => {
  assert.deepEqual(parseHiddenApps('Spotify, Arte ; disneyplus\nPrime Video'), [
    'spotify',
    'arte',
    'disneyplus',
    'primevideo',
  ]);
  assert.deepEqual(parseHiddenApps(' spotify , spotify '), ['spotify']);
  assert.deepEqual(parseHiddenApps(undefined), []);
});

test('parseCustomApps - should parse "Name = link" entries', () => {
  assert.deepEqual(parseCustomApps('Twitch = twitch://stream ; France TV = https://www.france.tv'), [
    { id: 'twitch', name: 'Twitch', uri: 'twitch://stream' },
    { id: 'francetv', name: 'France TV', uri: 'https://www.france.tv' },
  ]);
});

test('parseCustomApps - should keep the equals signs of the link itself', () => {
  assert.deepEqual(parseCustomApps('Ma chaîne = https://www.youtube.com/watch?v=abc&t=10'), [
    { id: 'machaine', name: 'Ma chaîne', uri: 'https://www.youtube.com/watch?v=abc&t=10' },
  ]);
});

test('parseCustomApps - should drop incomplete or duplicated entries', () => {
  assert.deepEqual(parseCustomApps('sans lien ; = https://orphan.example ; VLC = vlc:// ; VLC = other://'), [
    { id: 'vlc', name: 'VLC', uri: 'vlc://' },
  ]);
  assert.deepEqual(parseCustomApps(undefined), []);
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

test('normalizeMac - should accept the display forms used by the TVs', () => {
  assert.equal(normalizeMac('64:E4:D5:B4:12:66'), '64:e4:d5:b4:12:66');
  assert.equal(normalizeMac('64-e4-d5-b4-12-66'), '64:e4:d5:b4:12:66');
  assert.equal(normalizeMac(' 64E4D5B41266 '), '64:e4:d5:b4:12:66');
});

test('normalizeMac - should reject anything that is not a MAC', () => {
  assert.equal(normalizeMac(''), '');
  assert.equal(normalizeMac(undefined), '');
  assert.equal(normalizeMac('192.168.1.50'), '');
  assert.equal(normalizeMac('64:E4:D5:B4:12'), '');
  assert.equal(normalizeMac('zz:zz:zz:zz:zz:zz'), '');
});

test('normalizeConfig - should keep and normalize the MAC of a TV', () => {
  const normalized = normalizeConfig({
    tvs: [{ ip: '192.168.1.50', mac: '64-E4-D5-B4-12-66', certificate_key: 'K', certificate_cert: 'C' }],
  });
  assert.equal(normalized.tvs[0].mac, '64:e4:d5:b4:12:66');

  // No MAC configured: the field is present and empty, never undefined.
  const withoutMac = normalizeConfig({ tvs: [{ ip: '192.168.1.51' }] });
  assert.equal(withoutMac.tvs[0].mac, '');
});
