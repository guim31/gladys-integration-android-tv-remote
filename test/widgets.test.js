import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import {
  APP_SETTINGS,
  WIDGET,
  WIDGET_TTL_SECONDS,
  appButtons,
  appsContent,
  emptyContent,
  fit,
  foregroundApp,
  mediaContent,
  powerStatus,
  remoteContent,
  resolveWidgetTv,
  volumeContent,
  widgetCommand,
  widgetContent,
  widgetLanguage,
  widgetToast,
} from '../src/widgets.js';
import { resolveApps } from '../src/devices/apps.js';

const IP = '192.168.1.50';
const DEVICE_ID = 'ext:androidtv:tv:192_168_1_50';

const view = (state = {}, overrides = {}) => ({
  ip: IP,
  name: 'TV Salon',
  deviceExternalId: DEVICE_ID,
  state: { connected: true, powered: true, volume: 42, muted: false, appPackage: 'com.netflix.ninja', ...state },
  apps: resolveApps(),
  deviceAdded: true,
  ...overrides,
});

const buttons = (content) => content.components.filter((component) => component.type === 'button');
const status = (content) => content.components.find((component) => component.type === 'status');
const texts = (content) => content.components.filter((component) => component.type === 'text');

/** Every text of a content, in both languages, so a missing translation shows up. */
function assertBilingual(content) {
  const visit = (value, path) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
    } else if (value && typeof value === 'object') {
      if (typeof value.en === 'string') {
        assert.ok(value.fr, `${path} has no French text`);
        return;
      }
      Object.entries(value).forEach(([key, item]) => visit(item, `${path}.${key}`));
    }
  };
  visit(content.components, 'components');
}

// Every content produced must be rendered exactly as sent by the core: the
// budget (8 components, 2 texts, 4 buttons, unique action keys) and the text
// bounds are what validateWidgetContent checks.
test('widgets - every widget produces a valid content, in both languages, within its ttl', () => {
  for (const key of Object.values(WIDGET)) {
    for (const language of ['fr', 'en', 'de']) {
      const content = widgetContent(key, view(), { app_1: 'Netflix' }, language);
      assert.deepEqual(validateWidgetContent(content), [], `${key} (${language})`);
      assertBilingual(content);
      assert.equal(content.ttl_seconds, WIDGET_TTL_SECONDS[key]);
      assert.ok(content.ttl_seconds >= 10 && content.ttl_seconds <= 3600);
      assert.ok(buttons(content).length <= 4);
      // Never the primary style: invisible in dark mode.
      buttons(content).forEach((button) => assert.equal(button.style, undefined));
      // Every button carries the TV it acts on.
      buttons(content).forEach((button) => assert.equal(button.action.params.ip, IP));
    }
  }
  assert.throws(() => widgetContent('unknown', view()), /Unknown widget/);
});

test('widgets - the empty states are a sentence, never an error', () => {
  for (const reason of ['none', 'unknown']) {
    const content = emptyContent(reason);
    assert.deepEqual(validateWidgetContent(content), []);
    assert.equal(content.components.length, 1);
    assert.equal(content.components[0].type, 'text');
    assert.equal(content.components[0].variant, 'body');
    assertBilingual(content);
  }
  assert.match(emptyContent('none').components[0].text.fr, /appairée/);
  assert.match(emptyContent('unknown').components[0].text.fr, /plus appairée/);
});

test('widgets - resolveWidgetTv picks the device of the setting, else the first paired TV', () => {
  const config = {
    tvs: [
      { ip: '192.168.1.10', name: 'Unpaired', certificate_key: '', certificate_cert: '' },
      { ip: IP, name: 'TV Salon', certificate_key: 'K', certificate_cert: 'C' },
      { ip: '192.168.1.51', name: 'TV Chambre', certificate_key: 'K', certificate_cert: 'C' },
    ],
  };
  // Empty setting: the first PAIRED TV, an unpaired one has nothing to show.
  assert.equal(resolveWidgetTv({}, config).tv.ip, IP);
  assert.equal(resolveWidgetTv({ tv: '' }, config).tv.ip, IP);
  // The setting value is the device external_id, whatever the selector prefix.
  assert.equal(resolveWidgetTv({ tv: 'ext:androidtv:tv:192_168_1_51' }, config).tv.ip, '192.168.1.51');
  assert.equal(resolveWidgetTv({ tv: ' ext:androidtv:tv:192_168_1_51 ' }, config).tv.ip, '192.168.1.51');
  // A device whose TV was removed, or an unpaired TV: say so.
  assert.deepEqual(resolveWidgetTv({ tv: 'ext:androidtv:tv:192_168_1_99' }, config), {
    tv: undefined,
    reason: 'unknown',
  });
  assert.deepEqual(resolveWidgetTv({ tv: 'ext:androidtv:tv:192_168_1_10' }, config), {
    tv: undefined,
    reason: 'unknown',
  });
  assert.deepEqual(resolveWidgetTv({}, { tvs: [] }), { tv: undefined, reason: 'none' });
  assert.deepEqual(resolveWidgetTv({}, {}), { tv: undefined, reason: 'none' });
});

test('widgets - remote: the TV name, its states and the four keys', () => {
  const content = remoteContent(view());
  assert.deepEqual(validateWidgetContent(content), []);
  assert.deepEqual(texts(content), [{ type: 'text', variant: 'heading', text: 'TV Salon' }]);

  const rows = status(content).items;
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], {
    label: { en: 'Power', fr: 'Alimentation' },
    value: { en: 'On', fr: 'Allumée' },
    color: 'success',
  });
  assert.deepEqual(rows[1], { label: { en: 'Volume', fr: 'Volume' }, value: '42 %' });
  assert.deepEqual(rows[2], { label: { en: 'Mute', fr: 'Sourdine' }, value: { en: 'No', fr: 'Non' } });
  assert.deepEqual(rows[3], { label: { en: 'Application', fr: 'Application' }, value: 'Netflix' });

  assert.deepEqual(
    buttons(content).map((button) => [button.action.key, button.icon, button.label.fr]),
    [
      ['power', 'power', 'Éteindre'],
      ['home', 'home', 'Accueil'],
      ['back', 'corner-up-left', 'Retour'],
      ['ok', 'check', 'OK'],
    ],
  );
});

test('widgets - remote: an off or unreachable TV offers to turn it on', () => {
  const off = remoteContent(view({ powered: false }));
  assert.deepEqual(status(off).items[0].value, { en: 'Off', fr: 'Éteinte' });
  assert.equal(status(off).items[0].color, 'neutral');
  assert.equal(buttons(off)[0].label.fr, 'Allumer');

  // Connected but nothing reported yet: it answered the connection, so it is
  // awake, as the client assumes after its grace delay.
  const silent = remoteContent(view({ powered: null }));
  assert.deepEqual(status(silent).items[0].value, { en: 'On', fr: 'Allumée' });
  assert.equal(buttons(silent)[0].label.fr, 'Éteindre');

  // Unreachable: the TV is fully powered off (or gone), whatever it said last.
  const gone = remoteContent(view({ connected: false, powered: true }));
  assert.deepEqual(status(gone).items[0].value, { en: 'Unreachable', fr: 'Injoignable' });
  assert.equal(status(gone).items[0].color, 'warning');
  assert.equal(buttons(gone)[0].label.fr, 'Allumer');
  assert.deepEqual(validateWidgetContent(gone), []);
});

test('widgets - remote: unknown states are left out, the power row always stays', () => {
  const content = remoteContent(view({ volume: null, muted: null, appPackage: null }));
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(status(content).items.length, 1);
  assert.deepEqual(status(content).items[0], powerStatus(view().state));

  // An app outside the launcher list is not named (nothing to name it with).
  const unknownApp = remoteContent(view({ appPackage: 'com.some.unknown.app' }));
  assert.equal(unknownApp.components[1].items.length, 3);
});

test('widgets - media: the foreground app and the playback keys', () => {
  const content = mediaContent(view());
  assert.deepEqual(validateWidgetContent(content), []);
  assert.deepEqual(status(content).items, [{ label: { en: 'Application', fr: 'Application' }, value: 'Netflix' }]);
  assert.deepEqual(
    buttons(content).map((button) => [button.action.key, button.icon]),
    [
      ['play_pause', 'play'],
      ['stop', 'square'],
      ['previous', 'skip-back'],
      ['next', 'skip-forward'],
    ],
  );

  // Nothing known: no status list at all (an empty one is refused by the core).
  const idle = mediaContent(view({ appPackage: null }));
  assert.deepEqual(validateWidgetContent(idle), []);
  assert.equal(status(idle), undefined);

  // Unreachable: say it, the keys would fail.
  const gone = mediaContent(view({ connected: false }));
  assert.deepEqual(validateWidgetContent(gone), []);
  assert.deepEqual(status(gone).items[0].value, { en: 'Unreachable', fr: 'Injoignable' });
});

test('widgets - apps: without a name, the first four apps of the launcher', () => {
  const { apps, unknown } = appButtons(view(), {});
  assert.deepEqual(
    apps.map((app) => app.id),
    ['youtube', 'netflix', 'primevideo', 'disneyplus'],
  );
  assert.deepEqual(unknown, []);

  // Hidden apps are not offered; custom apps are.
  const apps2 = resolveApps({ hidden_apps: ['youtube', 'netflix'], custom_apps: [] });
  assert.equal(appButtons(view({}, { apps: apps2 }), {}).apps[0].id, 'primevideo');
});

test('widgets - apps: names are matched without case nor accents, by name or id', () => {
  const apps = resolveApps({ custom_apps: [{ id: 'francetv', name: 'France TV', uri: 'https://www.france.tv' }] });
  const { apps: found, unknown } = appButtons(view({}, { apps }), {
    app_1: ' netflix ',
    app_2: 'MOLOTOV TV',
    app_3: 'youtubemusic',
    app_4: 'France tv',
  });
  assert.deepEqual(
    found.map((app) => app.id),
    ['netflix', 'molotov', 'youtubemusic', 'francetv'],
  );
  assert.deepEqual(unknown, []);

  // Unknown names are reported, duplicates and blanks are dropped.
  const result = appButtons(view(), { app_1: 'Netflix', app_2: 'Zorglub', app_3: '', app_4: 'netflix' });
  assert.deepEqual(
    result.apps.map((app) => app.id),
    ['netflix'],
  );
  assert.deepEqual(result.unknown, ['Zorglub']);
});

test('widgets - apps: numbered buttons carrying the app, the foreground one ticked', () => {
  const content = appsContent(view(), { app_1: 'YouTube', app_2: 'Netflix' }, 'fr');
  assert.deepEqual(validateWidgetContent(content), []);
  assert.deepEqual(buttons(content), [
    {
      type: 'button',
      label: 'YouTube',
      icon: 'external-link',
      action: { key: 'app_1', params: { ip: IP, app: 'youtube' } },
    },
    {
      type: 'button',
      label: 'Netflix',
      icon: 'check-circle',
      action: { key: 'app_2', params: { ip: IP, app: 'netflix' } },
    },
  ]);
  assert.equal(texts(content).length, 1);

  // The action keys are the setting keys: unique within a content.
  const four = appsContent(view(), {}, 'en');
  assert.deepEqual(
    buttons(four).map((button) => button.action.key),
    APP_SETTINGS,
  );
});

test('widgets - apps: an unknown name is reported with the known ones, within 80 characters', () => {
  const content = appsContent(view(), { app_1: 'Netflix', app_2: 'Zorglub' }, 'fr');
  assert.deepEqual(validateWidgetContent(content), []);
  const caption = texts(content)[1];
  assert.equal(caption.variant, 'caption');
  assert.match(caption.text, /^Inconnu : Zorglub\. Connus : YouTube, Netflix/);
  assert.ok(caption.text.length <= 80);
  assert.ok(caption.text.endsWith('…'));
  assert.equal(buttons(content).length, 1);

  const english = appsContent(view(), { app_1: 'Zorglub' }, 'en');
  assert.match(texts(english)[1].text, /^Unknown: Zorglub\. Known: /);
});

test('widgets - apps: nothing to offer says so instead of an empty card', () => {
  const content = appsContent(view({}, { apps: [] }), {}, 'fr');
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(buttons(content).length, 0);
  assert.equal(texts(content)[1].variant, 'body');
  assert.match(texts(content)[1].text.fr, /masquées/);
});

test('widgets - volume: a tile bound to the volume feature, the mute state, three keys', () => {
  const content = volumeContent(view({ muted: true }));
  assert.deepEqual(validateWidgetContent(content), []);
  assert.deepEqual(content.components[1], {
    type: 'value',
    label: { en: 'Volume', fr: 'Volume' },
    icon: 'volume-2',
    device_feature: `${DEVICE_ID}:volume`,
  });
  assert.deepEqual(status(content).items, [{ label: { en: 'Mute', fr: 'Sourdine' }, value: { en: 'Yes', fr: 'Oui' } }]);
  assert.deepEqual(
    buttons(content).map((button) => [button.action.key, button.icon]),
    [
      ['vol_down', 'volume-1'],
      ['vol_up', 'volume-2'],
      ['mute', 'check-circle'],
    ],
  );
  assert.equal(buttons(volumeContent(view({ muted: false })))[2].icon, 'volume-x');
});

test('widgets - volume: a TV not added as a device gets a plain tile with the last level', () => {
  const content = volumeContent(view({}, { deviceAdded: false }));
  assert.deepEqual(validateWidgetContent(content), []);
  assert.deepEqual(content.components[1], {
    type: 'value',
    label: { en: 'Volume', fr: 'Volume' },
    icon: 'volume-2',
    value: 42,
    unit: '%',
  });

  const unknown = volumeContent(view({ volume: null, muted: null }, { deviceAdded: false }));
  assert.deepEqual(validateWidgetContent(unknown), []);
  assert.equal(unknown.components[1].value, '—');
  assert.equal(unknown.components[1].unit, undefined);
  assert.equal(status(unknown), undefined);

  // Unreachable: said in the status list, with the mute state when known.
  const gone = volumeContent(view({ connected: false }));
  assert.deepEqual(validateWidgetContent(gone), []);
  assert.equal(status(gone).items.length, 2);
  assert.deepEqual(status(gone).items[0].value, { en: 'Unreachable', fr: 'Injoignable' });
});

test('widgets - the volume tile binds the exact feature id published for the device', async () => {
  const { buildAndroidTVDevice } = await import('../src/devices/index.js');
  const gladys = { externalId: (id) => `ext:androidtv:${id}` };
  const device = buildAndroidTVDevice(gladys, { ip: IP, name: 'TV Salon' });
  const tile = volumeContent(view({}, { deviceExternalId: device.external_id })).components[1];
  const volumeFeature = device.features.find((feature) => feature.type === 'volume');
  assert.equal(tile.device_feature, volumeFeature.external_id);
});

test('widgets - widgetCommand only lets the declared buttons through', () => {
  assert.deepEqual(widgetCommand('power', { ip: IP }), { kind: 'power', ip: IP });
  assert.deepEqual(widgetCommand('home', { ip: IP }), { kind: 'key', ip: IP, key: 'home' });
  assert.deepEqual(widgetCommand('back', { ip: IP }), { kind: 'key', ip: IP, key: 'back' });
  assert.deepEqual(widgetCommand('ok', { ip: IP }), { kind: 'key', ip: IP, key: 'select' });
  assert.deepEqual(widgetCommand('play_pause', { ip: IP }), { kind: 'key', ip: IP, key: 'play_pause' });
  assert.deepEqual(widgetCommand('stop', { ip: IP }), { kind: 'key', ip: IP, key: 'stop' });
  assert.deepEqual(widgetCommand('previous', { ip: IP }), { kind: 'key', ip: IP, key: 'previous' });
  assert.deepEqual(widgetCommand('next', { ip: IP }), { kind: 'key', ip: IP, key: 'next' });
  assert.deepEqual(widgetCommand('vol_down', { ip: IP }), { kind: 'key', ip: IP, key: 'volume_down' });
  assert.deepEqual(widgetCommand('vol_up', { ip: IP }), { kind: 'key', ip: IP, key: 'volume_up' });
  assert.deepEqual(widgetCommand('mute', { ip: IP }), { kind: 'key', ip: IP, key: 'mute' });
  assert.deepEqual(widgetCommand('app_3', { ip: IP, app: 'netflix' }), { kind: 'app', ip: IP, app: 'netflix' });

  // Not a button of any widget, a missing TV, an app button without its app.
  assert.equal(widgetCommand('menu', { ip: IP }), null);
  assert.equal(widgetCommand('up', { ip: IP }), null);
  assert.equal(widgetCommand('power', {}), null);
  assert.equal(widgetCommand('power', { ip: 42 }), null);
  assert.equal(widgetCommand('power'), null);
  assert.equal(widgetCommand('app_1', { ip: IP }), null);
  assert.equal(widgetCommand('app_1', { ip: IP, app: ' ' }), null);
  assert.equal(widgetCommand('app_5', { ip: IP, app: 'netflix' }), null);
});

test('widgets - every key a button sends is one the TV client knows', async () => {
  const { KEY_MAPPING } = await import('../src/remote/android-tv-client.js');
  for (const actionKey of [
    'home',
    'back',
    'ok',
    'play_pause',
    'stop',
    'previous',
    'next',
    'vol_down',
    'vol_up',
    'mute',
  ]) {
    const { key } = widgetCommand(actionKey, { ip: IP });
    assert.equal(typeof KEY_MAPPING[key], 'number', `${actionKey} -> ${key}`);
  }
});

test('widgets - the toasts are short and bilingual', () => {
  const toasts = [
    widgetToast({ kind: 'power', ip: IP }, { turnOn: true }),
    widgetToast({ kind: 'power', ip: IP }, { turnOn: false }),
    widgetToast({ kind: 'key', ip: IP, key: 'home' }),
    widgetToast({ kind: 'app', ip: IP, app: 'netflix' }, { appName: 'Netflix' }),
    widgetToast({ kind: 'app', ip: IP, app: 'netflix' }),
  ];
  for (const toast of toasts) {
    assert.ok(toast.en && toast.fr);
    assert.ok(toast.en.length <= 200 && toast.fr.length <= 200);
  }
  assert.match(toasts[0].fr, /Allumage/);
  assert.match(toasts[1].fr, /Extinction/);
  assert.match(toasts[3].fr, /Netflix/);
  assert.match(toasts[4].en, /netflix/);
});

test('widgets - helpers: language fallback, text bound, foreground app', () => {
  assert.equal(widgetLanguage('fr'), 'fr');
  assert.equal(widgetLanguage('en'), 'en');
  assert.equal(widgetLanguage('de'), 'en');
  assert.equal(widgetLanguage(undefined), 'en');

  assert.equal(fit('  TV Salon  ', 40), 'TV Salon');
  assert.equal(fit('abcdefghij', 5), 'abcd…');
  assert.equal(fit(null, 5), '');
  assert.equal(fit('a'.repeat(300), 80).length, 80);

  assert.equal(foregroundApp(view()).id, 'netflix');
  assert.equal(foregroundApp(view({ appPackage: null })), undefined);
  assert.equal(foregroundApp(view({ appPackage: 'com.unknown' })), undefined);
  // A custom app without a package never matches an empty package report.
  assert.equal(foregroundApp(view({ appPackage: '' }, { apps: [{ id: 'x', name: 'X', package: '' }] })), undefined);
});
