// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The store indexer validates the manifest schema, but nothing there can know
// which handlers the code registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { APP_SETTINGS, WIDGET, WIDGET_TTL_SECONDS } from '../src/widgets.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const manifest = JSON.parse(await read('../gladys-assistant-integration.json'));
const pkg = JSON.parse(await read('../package.json'));
const indexSource = await read('../index.js');

test('manifest - version, image tag and package stay in sync', () => {
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/guim31/gladys-integration-android-tv-remote:${pkg.version}`);
});

test('manifest - texts fit the store limits', () => {
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  for (const [language, text] of Object.entries(manifest.description)) {
    // The store rejects a description over 100 characters, silently.
    assert.ok(text.length >= 10 && text.length <= 100, `description.${language}: ${text.length}`);
  }
});

test('manifest - every multi-language text has English and French', () => {
  const texts = [];
  const collect = (value) => {
    if (value && typeof value === 'object') {
      if (typeof value.en === 'string') {
        texts.push(value);
        return;
      }
      Object.values(value).forEach(collect);
    }
  };
  collect(manifest);
  assert.ok(texts.length > 20);
  for (const text of texts) {
    assert.ok(text.en && text.fr, JSON.stringify(text));
  }
});

test('manifest - dynamic selects declare the devices source and no static options', () => {
  const fields = [
    ...manifest.config_schema,
    ...manifest.actions.flatMap((action) => action.fields || []),
    ...manifest.widgets.flatMap((widget) => widget.settings || []),
  ];
  for (const field of fields.filter((f) => f.source !== undefined)) {
    assert.equal(field.type, 'select');
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined);
  }
});

test('manifest - the widgets need Gladys 5.1 and the SDK 0.14', () => {
  const [, major, minor] = manifest.gladys_version.match(/^>=\s*(\d+)\.(\d+)\.\d+$/).map(Number);
  assert.ok(major > 5 || (major === 5 && minor >= 1), manifest.gladys_version);
  const sdk = pkg.dependencies['@gladysassistant/integration-sdk'];
  const [, sdkMinor] = sdk.match(/^\^0\.(\d+)\./).map(Number);
  assert.ok(sdkMinor >= 14, sdk);
});

test('manifest - the widgets are the ones the code serves, each with a handler', () => {
  assert.deepEqual(manifest.widgets.map((widget) => widget.key).sort(), Object.values(WIDGET).sort());
  assert.ok(manifest.widgets.length >= 1 && manifest.widgets.length <= 5);
  // index.js registers onWidgetGet and onWidgetAction for every key of WIDGET.
  assert.match(indexSource, /Object\.values\(WIDGET\)\.forEach\(\(widgetKey\) => \{/);
  assert.match(indexSource, /gladys\.onWidgetGet\(widgetKey,/);
  assert.match(indexSource, /gladys\.onWidgetAction\(widgetKey,/);
  for (const key of Object.values(WIDGET)) {
    assert.equal(typeof WIDGET_TTL_SECONDS[key], 'number', `ttl of ${key}`);
  }
});

test('manifest - every widget fits the store limits and shows the TV picked', () => {
  for (const widget of manifest.widgets) {
    assert.match(widget.key, /^[a-z0-9_]{2,32}$/);
    assert.ok(widget.label.en && widget.label.fr && widget.description.en && widget.description.fr);
    for (const text of Object.values(widget.label)) {
      assert.ok(text.length >= 3 && text.length <= 30, `${widget.key}: label "${text}"`);
    }
    for (const text of Object.values(widget.description)) {
      assert.ok(text.length <= 100, `${widget.key}: description is ${text.length} characters`);
    }
    assert.match(widget.icon, /^[a-z0-9-]{1,40}$/);
    // Every widget has buttons: the core waits their ack under this timeout.
    assert.ok(Number.isInteger(widget.action_timeout_seconds), `${widget.key}: action_timeout_seconds`);
    assert.ok(widget.action_timeout_seconds >= 5 && widget.action_timeout_seconds <= 120);

    assert.ok((widget.settings || []).length <= 10);
    for (const field of widget.settings || []) {
      assert.match(field.key, /^[a-z0-9_]+$/);
      assert.ok(
        ['string', 'number', 'boolean', 'select', 'section'].includes(field.type),
        `${field.key}: ${field.type}`,
      );
      assert.ok(field.label.en && field.label.fr);
      assert.equal(field.required, false);
    }
    const keys = widget.settings.map((field) => field.key);
    assert.equal(new Set(keys).size, keys.length, `${widget.key}: duplicate setting keys`);

    // Every widget shows the TV picked among the devices of the integration,
    // or the first paired TV when the field is left empty.
    const tv = widget.settings.find((field) => field.key === 'tv');
    assert.equal(tv.source, 'devices');
    assert.equal(tv.required, false);
  }
});

test('manifest - the apps widget names its buttons in text settings', () => {
  const apps = manifest.widgets.find((widget) => widget.key === WIDGET.APPS);
  assert.deepEqual(
    apps.settings.filter((field) => field.type === 'string').map((field) => field.key),
    APP_SETTINGS,
  );
  for (const key of Object.values(WIDGET).filter((widgetKey) => widgetKey !== WIDGET.APPS)) {
    const widget = manifest.widgets.find((candidate) => candidate.key === key);
    assert.deepEqual(
      widget.settings.map((field) => field.key),
      ['tv'],
      `${key} only needs the TV`,
    );
  }
});

test('manifest - the user documentation exists in both languages, with a widgets section', async () => {
  for (const language of ['fr', 'en']) {
    const doc = await read(`../docs/${language}.md`);
    // The store refuses an integration without user documentation.
    assert.ok(doc.length >= 300, `docs/${language}.md is too short for the store`);
    assert.match(doc, /^## .*[Ww]idgets/m, `docs/${language}.md has no widgets section`);
  }
});
