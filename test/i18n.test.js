import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES, TEXTS, widgetToast } from '../src/widgets.js';
import { handleActionExecution } from '../src/devices/index.js';
import { AndroidTVClientManager } from '../src/remote/client-manager.js';

// The languages of the Gladys UI: a text missing in one of them falls back to
// English, silently. Every multi-language object must carry exactly these.
const EXPECTED = ['de', 'en', 'es', 'fr'];

// German says « du », like most screens of Gladys and the other integrations
// of the author. A capitalized Sie / Ihr… is the polite form: no German text
// here starts a sentence with « sie » (she, they) or « ihr » (her, you all).
const POLITE_GERMAN = /\b(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)\b/;

const manifest = JSON.parse(await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'));

/**
 * Every multi-language object below a value: an object holding an `en` key.
 *
 * @param {unknown} value The value to walk.
 * @param {string} path Its path, for the messages.
 * @param {Array} found The objects found, with their path.
 * @returns {Array<{ path: string, text: Object }>} The objects found.
 */
function localizedTexts(value, path, found = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => localizedTexts(item, `${path}[${index}]`, found));
  } else if (value && typeof value === 'object') {
    if ('en' in value) {
      found.push({ path, text: value });
    } else {
      Object.entries(value).forEach(([key, item]) => localizedTexts(item, `${path}.${key}`, found));
    }
  }
  return found;
}

/**
 * The bound of a manifest text, from the store schema (and the widget budget).
 *
 * @param {string} path The path of the text.
 * @returns {number} The bound, in characters per language.
 */
function manifestBound(path) {
  if (path === 'manifest.description') {
    return 100;
  }
  if (/^manifest\.widgets\[\d+\]\.label$/.test(path)) {
    return 30;
  }
  if (/^manifest\.widgets\[\d+\]\.description$/.test(path)) {
    return 100;
  }
  return 1000;
}

function assertLocalized(path, text, max) {
  assert.deepEqual(Object.keys(text).sort(), EXPECTED, `${path} must have exactly ${EXPECTED.join(', ')}`);
  for (const language of EXPECTED) {
    const value = typeof text[language] === 'function' ? text[language]('X', 'Y') : text[language];
    assert.equal(typeof value, 'string', `${path}.${language} is not a text`);
    assert.ok(value.trim().length > 0, `${path}.${language} is empty`);
    assert.ok(value.length <= max, `${path}.${language} is ${value.length} characters long (max ${max})`);
    if (language === 'de') {
      assert.doesNotMatch(value, POLITE_GERMAN, `${path}.de must say « du », not « Sie »`);
    }
  }
}

test('i18n - the languages of the code are those of the Gladys UI', () => {
  assert.deepEqual([...LANGUAGES].sort(), EXPECTED);
});

test('i18n - every multi-language object of the manifest has en, fr, de and es, within its bound', () => {
  const texts = localizedTexts(manifest, 'manifest');
  // The description, the section, the config fields, the actions and their
  // fields, the widgets and their settings: nothing may be skipped.
  assert.ok(texts.length >= 60, `only ${texts.length} texts found`);
  for (const { path, text } of texts) {
    assertLocalized(path, text, manifestBound(path));
  }
});

test('i18n - no multi-language object of the manifest lacks its English text', () => {
  const visit = (value, path) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
    } else if (value && typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.some((key) => EXPECTED.includes(key) && key !== 'en')) {
        assert.ok('en' in value, `${path} has translations but no English text`);
      }
      Object.entries(value).forEach(([key, item]) => visit(item, `${path}.${key}`));
    }
  };
  visit(manifest, 'manifest');
});

// The bounds of the core: a status row 40, a button 24, a body text 300, a
// caption 80, a toast 200 characters per language.
const WIDGET_BOUNDS = {
  noTv: 300,
  unknownTv: 300,
  noApp: 300,
  unknownApps: 80,
  power: 24,
  volume: 24,
};
const BUTTONS = [
  'turnOn',
  'turnOff',
  'home',
  'back',
  'ok',
  'playPause',
  'stop',
  'previous',
  'next',
  'volDown',
  'volUp',
];

test('i18n - every widget text has en, fr, de and es, within the bounds of the core', () => {
  const texts = localizedTexts(TEXTS, 'TEXTS');
  assert.ok(texts.length >= 28, `only ${texts.length} texts found`);
  for (const { path, text } of texts) {
    const key = path.split('.')[1];
    let max = WIDGET_BOUNDS[key] || 40;
    if (BUTTONS.includes(key) || key === 'mute') {
      max = 24;
    }
    if (key === 'toast') {
      max = 200;
    }
    assertLocalized(path, text, max);
  }
});

test('i18n - every widget toast is in every language', () => {
  const toasts = [
    widgetToast({ kind: 'power', ip: '192.168.1.50' }, { turnOn: true }),
    widgetToast({ kind: 'power', ip: '192.168.1.50' }, { turnOn: false }),
    widgetToast({ kind: 'key', ip: '192.168.1.50', key: 'home' }),
    widgetToast({ kind: 'app', ip: '192.168.1.50', app: 'netflix' }, { appName: 'Netflix' }),
  ];
  toasts.forEach((toast, index) => assertLocalized(`toast[${index}]`, toast, 200));
});

const pairedTv = {
  ip: '192.168.1.50',
  name: 'TV Salon',
  mac: '',
  certificate_key: 'KEY',
  certificate_cert: 'CERT',
};

test('i18n - every action result is in every language', async () => {
  const gladys = { externalId: (id) => `androidtv:${id}`, setConfig: async () => ({ success: true }) };
  let pairingTarget = null;
  const client = {
    isConnected: true,
    startPairing: async () => ({}),
    submitPin: async () => ({ certificates: { key: 'KEY', cert: 'CERT' } }),
  };
  const manager = {
    getOrCreateClient: () => client,
    setPairingTarget(ip, name, mac) {
      pairingTarget = { client, ip, name, mac };
    },
    getPairingTarget: () => pairingTarget,
    refreshConnectionStatus: async () => {},
    removeClient: () => {},
    scheduleReconnect: () => {},
  };
  const config = { tvs: [pairedTv] };
  const results = {
    start_pairing: await handleActionExecution(gladys, 'start_pairing', { tv_ip: '192.168.1.50' }, manager, config),
    submit_pin: await handleActionExecution(gladys, 'submit_pin', { pairing_pin: 'B4B0C7' }, manager, config),
    set_mac: await handleActionExecution(
      gladys,
      'set_mac',
      { tv_ip: '192.168.1.50', tv_mac: '64:E4:D5:B4:12:66' },
      manager,
      config,
    ),
    clear_mac: await handleActionExecution(gladys, 'set_mac', { tv_ip: '192.168.1.50' }, manager, config),
    test_connection: await handleActionExecution(gladys, 'test_connection', {}, manager, config),
    remove_tv: await handleActionExecution(gladys, 'remove_tv', { tv_ip: '192.168.1.50' }, manager, config),
  };
  for (const [key, result] of Object.entries(results)) {
    assertLocalized(key, result, 1000);
  }
});

test('i18n - every connection status is in every language', async () => {
  const statuses = [];
  const gladys = {
    externalId: (id) => `androidtv:${id}`,
    publishState: async () => {},
    setConnectionStatus: async (connected, message) => statuses.push(message),
  };
  const manager = new AndroidTVClientManager(gladys);

  // Nothing configured.
  await manager.refreshConnectionStatus();
  // Configured, not paired.
  manager.getOrCreateClient({ ip: '192.168.1.50' });
  await manager.refreshConnectionStatus();
  // Paired, unreachable.
  manager.getOrCreateClient({ ip: '192.168.1.50', certificate_key: 'KEY', certificate_cert: 'CERT' });
  await manager.refreshConnectionStatus();
  manager.disconnectAll();

  assert.equal(new Set(statuses.map((message) => message.en)).size, 3);
  statuses.forEach((message, index) => assertLocalized(`status[${index}]`, message, 200));
});
