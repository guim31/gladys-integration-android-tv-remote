import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GladysIntegration } from '@gladysassistant/integration-sdk';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Recursively collect the JavaScript sources of the integration.
 *
 * @param {string} directory Directory to walk.
 * @returns {Promise<string[]>} Absolute file paths.
 */
async function collectSources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSources(path)));
    } else if (entry.name.endsWith('.js')) {
      files.push(path);
    }
  }
  return files;
}

// A typo in an SDK method name (`saveConfig` instead of `setConfig`) is invisible
// until the exact moment it runs — which, for the pairing, is right after the TV
// accepted the PIN code. This test walks the sources and checks that every
// method called on the Gladys client really exists.
test('every SDK method called by the integration must exist', async () => {
  const files = [join(ROOT, 'index.js'), ...(await collectSources(join(ROOT, 'src')))];
  const called = new Map();

  for (const file of files) {
    const content = await readFile(file, 'utf8');
    for (const match of content.matchAll(/\bgladys\.([a-zA-Z_]\w*)\s*\(/g)) {
      called.set(match[1], file.replace(ROOT, ''));
    }
  }

  assert.ok(called.size > 0, 'no SDK call found, the scan is broken');

  for (const [method, file] of called) {
    assert.equal(typeof GladysIntegration.prototype[method], 'function', `gladys.${method}() does not exist (${file})`);
  }
});

// Without connect() the WebSocket never opens: no action, no scan, no command
// ever reaches the integration, and the process exits as soon as index.js ends.
test('index.js must open the websocket and handle shutdown', async () => {
  const content = await readFile(join(ROOT, 'index.js'), 'utf8');
  assert.match(content, /await gladys\.connect\(\)/);
  assert.match(content, /gladys\.handleShutdown\(/);
});

// The manifest declares the action buttons; each one needs a handler.
test('every action of the manifest must be handled', async () => {
  const manifest = JSON.parse(await readFile(join(ROOT, 'gladys-assistant-integration.json'), 'utf8'));
  const content = await readFile(join(ROOT, 'index.js'), 'utf8');

  manifest.actions.forEach((action) => {
    assert.ok(content.includes(`'${action.key}'`), `no handler registered for action ${action.key}`);
  });
});
