import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import EventEmitter from 'node:events';
import { createRequire } from 'node:module';
import AndroidRemotePkg from 'androidtv-remote';
import { RemoteManager } from 'androidtv-remote/dist/remote/RemoteManager.js';
import { PairingManager } from 'androidtv-remote/dist/pairing/PairingManager.js';
import { KEY_MAPPING } from '../src/remote/android-tv-client.js';

const require = createRequire(import.meta.url);

// The integration reaches inside androidtv-remote in several places: it guards
// remoteManager against its own 'error' events, breaks the reconnection loop of
// its socket in disconnect(), and turns the silent `false` of sendCode() into a
// user-facing message. None of that surface is a public API, so a library
// upgrade can move it without any visible sign — these tests pin down every
// internal the integration depends on, to fail in CI instead of at runtime.

const { AndroidRemote, RemoteKeyCode, RemoteDirection } = AndroidRemotePkg;

test('androidtv-remote must export AndroidRemote, RemoteKeyCode and RemoteDirection', () => {
  assert.equal(typeof AndroidRemote, 'function');
  assert.equal(typeof RemoteKeyCode, 'object');
  assert.equal(typeof RemoteDirection, 'object');
  // sendKey() always sends with this direction.
  assert.equal(typeof RemoteDirection.SHORT, 'number');
});

test('every key of KEY_MAPPING must resolve to a numeric key code', () => {
  Object.entries(KEY_MAPPING).forEach(([name, code]) => {
    assert.equal(typeof code, 'number', `KEY_MAPPING.${name} is not a number`);
  });
});

test('AndroidRemote must expose the methods and events the client relies on', () => {
  // AndroidTVClient calls these on every session.
  ['start', 'sendCode', 'sendKey', 'sendAppLink', 'getCertificate', 'stop'].forEach((method) => {
    assert.equal(typeof AndroidRemote.prototype[method], 'function', `AndroidRemote.${method}() is missing`);
  });

  // _createRemote() wires listeners with on/once, disconnect() detaches them.
  assert.ok(AndroidRemote.prototype instanceof EventEmitter, 'AndroidRemote is no longer an EventEmitter');

  const remote = new AndroidRemote('192.0.2.1', { cert: { key: 'k', cert: 'c' } });
  // connect() reads them through disconnect() and _guardRemoteManager(); they
  // are only created by start(), which the guards must tolerate.
  assert.equal(remote.remoteManager, undefined);
  assert.equal(remote.pairingManager, undefined);
});

test('RemoteManager must keep the internals the guards depend on', async () => {
  ['start', 'sendKey', 'sendAppLink', 'sendPower', 'stop'].forEach((method) => {
    assert.equal(typeof RemoteManager.prototype[method], 'function', `RemoteManager.${method}() is missing`);
  });

  // _guardRemoteManager() subscribes to 'error' on the manager itself.
  assert.ok(RemoteManager.prototype instanceof EventEmitter, 'RemoteManager is no longer an EventEmitter');

  // The socket must not exist before start(): ensureClientConnected() and the
  // guards all treat a missing `client` as "no session yet".
  const manager = new RemoteManager('192.0.2.1', 6466, { key: 'k', cert: 'c' });
  assert.equal(manager.client, undefined);

  const source = await readFile(require.resolve('androidtv-remote/dist/remote/RemoteManager.js'), 'utf8');
  // disconnect() destroys `manager.client` and removes its 'close' listeners to
  // break the auto-reconnection loop; the guard watches the same socket.
  // The dist build is transpiled: `tls.connect` becomes `_tls.default.connect`.
  assert.match(
    source,
    /this\.client\s*=\s*_?tls(\.default)?\.connect/,
    'the RemoteManager socket is no longer `this.client`',
  );
  assert.match(source, /this\.client\.on\(['"]close['"]/, 'the reconnection loop no longer hangs on a close listener');
  // The protocol error is emitted on the manager, never forwarded to
  // AndroidRemote: without our guard it kills the process.
  assert.match(source, /this\.emit\(['"]error['"]/, 'RemoteManager no longer emits its own error event');
});

test('PairingManager.sendCode must still reject a bad checksum with `false`', async () => {
  assert.equal(typeof PairingManager.prototype.sendCode, 'function');

  // submitPin() reads `sendCode(pin) === false` to report a mistyped PIN
  // immediately instead of letting the user wait out the whole timeout.
  const source = await readFile(require.resolve('androidtv-remote/dist/pairing/PairingManager.js'), 'utf8');
  assert.match(source, /return false/, 'sendCode() no longer returns false on a checksum mismatch');
});
