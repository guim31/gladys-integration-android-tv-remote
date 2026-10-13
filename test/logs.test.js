import test from 'node:test';
import assert from 'node:assert/strict';
import { logger } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import AndroidRemotePkg from 'androidtv-remote';
import { RemoteManager } from 'androidtv-remote/dist/remote/RemoteManager.js';
import { AndroidTVClient } from '../src/remote/android-tv-client.js';
import { AndroidTVClientManager } from '../src/remote/client-manager.js';
import { formatLibraryLine } from '../src/remote/library-console.js';

const { AndroidRemote } = AndroidRemotePkg;
const TV = { ip: '192.168.1.50', name: 'Salon TV', certificate_key: 'KEY', certificate_cert: 'CERT' };

// The info level only tells the lifecycle (start, a TV connected, lost, back,
// one line per user action): what the TV reports in a normal session — and
// it reports a lot — stays at the debug level.

/**
 * Silence and record the integration logger, level by level.
 *
 * @param {Object} t The test context.
 * @returns {Object} The mocks, by level.
 */
function spyLogger(t) {
  return Object.fromEntries(
    ['debug', 'info', 'warn', 'error'].map((level) => [level, t.mock.method(logger, level, () => {})]),
  );
}

/**
 * Lines given to a logger mock.
 *
 * @param {Object} mock A mock of spyLogger().
 * @returns {Array<string>} The first argument of each call.
 */
function lines(mock) {
  return mock.mock.calls.map((call) => String(call.arguments[0]));
}

/**
 * Record the text written on stdout and stderr while `run` runs.
 *
 * The console writes strings; the test runner talks to its parent process
 * through the same stdout with Buffers, which are passed through.
 *
 * @param {Function} run The code to watch.
 * @returns {Promise<string>} What the console wrote.
 */
async function captureOutput(run) {
  const written = [];
  const stdout = process.stdout.write;
  const stderr = process.stderr.write;
  const capture =
    (original, stream) =>
    (chunk, ...rest) => {
      if (typeof chunk === 'string') {
        written.push(chunk);
        return true;
      }
      return original.call(stream, chunk, ...rest);
    };
  process.stdout.write = capture(stdout, process.stdout);
  process.stderr.write = capture(stderr, process.stderr);
  try {
    await run();
  } finally {
    process.stdout.write = stdout;
    process.stderr.write = stderr;
  }
  return written.join('');
}

test('logs - a normal session writes nothing at the info level, the library chatter included', async (t) => {
  const log = spyLogger(t);
  const gladys = createFakeGladys();
  const manager = new AndroidTVClientManager(gladys);
  const client = manager.getOrCreateClient(TV);

  // The session opens: one lifecycle line.
  client.isConnected = true;
  client._emit('connected');
  await gladys.publishChangedStates([]);
  assert.deepEqual(lines(log.info), ['[AndroidTV] Connected to the TV Salon TV (192.168.1.50).']);
  log.info.mock.resetCalls();

  // A real AndroidRemote whose socket only swallows the bytes: the library
  // prints every message it builds.
  const remote = new AndroidRemote(TV.ip, { cert: { key: 'KEY', cert: 'CERT' } });
  remote.remoteManager = new RemoteManager(TV.ip, 6466, { key: 'KEY', cert: 'CERT' });
  remote.remoteManager.client = { write: () => true };
  client.remote = remote;
  client.volume = 2;
  client.volumeMax = 10;

  const output = await captureOutput(async () => {
    // What a TV sends during an evening: power, app changes, a volume report
    // per key press.
    client._emit('power', true);
    client._emit('current_app', 'com.netflix.ninja');
    client._emit('current_app', 'com.google.android.youtube.tv');
    for (let level = 2; level <= 6; level += 1) {
      client._emit('volume', { level, maximum: 10, muted: false });
    }
    // Commands, each one already logged once by its handler in index.js.
    await client.sendKey('home');
    await client.setVolumeLevel(50);
    await client.setMute(false);
    await gladys.publishChangedStates([]);
  });

  assert.deepEqual(lines(log.info), []);
  assert.deepEqual(lines(log.warn), []);
  assert.deepEqual(lines(log.error), []);
  // The library wrote nothing on the console by itself...
  assert.equal(output, '');
  // ...its lines went to the debug level.
  assert.ok(lines(log.debug).some((line) => line.startsWith('[AndroidTV] [androidtv-remote] Sending')));
  manager.disconnectAll();
});

test('logs - a TV that stays unreachable is reported once, and once when it is back', async (t) => {
  const log = spyLogger(t);
  const connect = t.mock.method(AndroidTVClient.prototype, 'connect', async () => {
    throw new Error('connect EHOSTUNREACH 192.168.1.50:6466');
  });
  const gladys = createFakeGladys();
  const manager = new AndroidTVClientManager(gladys);

  await manager.connectAll([TV]);
  // A night of attempts, every 2 minutes.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await manager._attemptReconnect(TV.ip);
  }
  assert.equal(connect.mock.callCount(), 6);
  assert.equal(log.warn.mock.callCount(), 1);
  assert.match(lines(log.warn)[0], /192\.168\.1\.50 is not reachable \(connect EHOSTUNREACH/);
  assert.deepEqual(lines(log.info), []);

  // The TV is switched on: one line.
  const client = manager.getClient(TV.ip);
  client.isConnected = true;
  client._emit('connected');
  assert.deepEqual(lines(log.info), ['[AndroidTV] The TV Salon TV (192.168.1.50) is reachable again.']);

  // Then switched off: one line for the loss, none for the attempts.
  client.isConnected = false;
  client._emit('disconnected');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await manager._attemptReconnect(TV.ip);
  }
  assert.equal(log.warn.mock.callCount(), 2);
  assert.match(lines(log.warn)[1], /not reachable \(connection closed\)/);
  assert.equal(log.error.mock.callCount(), 0);
  manager.disconnectAll();
});

test('logs - a refused certificate is reported once, not at every attempt', (t) => {
  const log = spyLogger(t);
  const manager = new AndroidTVClientManager(createFakeGladys());
  const client = manager.getOrCreateClient(TV);

  client._emit('unpaired');
  client._emit('unpaired');
  client._emit('unpaired');

  assert.equal(log.warn.mock.callCount(), 1);
  assert.match(lines(log.warn)[0], /rejected the stored certificate/);
  manager.disconnectAll();
});

test('logs - a library error is reduced to its code and message', () => {
  const err = Object.assign(new Error('connect ECONNREFUSED 192.168.1.50:6466'), { code: 'ECONNREFUSED' });
  assert.equal(
    formatLibraryLine(['192.168.1.50', err]),
    '192.168.1.50 ECONNREFUSED connect ECONNREFUSED 192.168.1.50:6466',
  );
  assert.equal(formatLibraryLine(['Receive : {\n "a": 1 }']), 'Receive : { "a": 1 }');
});
