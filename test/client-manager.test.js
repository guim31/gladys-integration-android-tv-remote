import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AndroidTVClientManager,
  RECONNECT_INITIAL_DELAY_MS,
  RECONNECT_MAX_DELAY_MS,
} from '../src/remote/client-manager.js';

function createMockGladys() {
  const published = [];
  const statuses = [];
  return {
    published,
    statuses,
    externalId: (id) => `androidtv:${id}`,
    publishState: async (externalId, value) => published.push({ externalId, value }),
    setConnectionStatus: async (connected, message) => statuses.push({ connected, message }),
  };
}

test('AndroidTVClientManager - should register a client for every configured TV', async () => {
  const manager = new AndroidTVClientManager(createMockGladys());

  await manager.connectAll([
    { ip: '192.168.1.50', name: 'Salon TV' },
    { ip: '192.168.1.51', name: 'Chambre TV' },
  ]);

  assert.ok(manager.getClient('192.168.1.50'));
  assert.ok(manager.getClient('192.168.1.51'));
  assert.equal(manager.getClient('192.168.1.52'), undefined);

  manager.disconnectAll();
  assert.equal(manager.getClient('192.168.1.50'), undefined);
});

test('AndroidTVClientManager - getOrCreateClient must register the client it creates', () => {
  const manager = new AndroidTVClientManager(createMockGladys());

  const first = manager.getOrCreateClient({ ip: '192.168.1.99', name: 'Test TV' });
  assert.ok(first);
  assert.equal(first.ip, '192.168.1.99');

  // The pairing sequence spans two separate user actions: both must land on the
  // very same client, otherwise the PIN submission finds no open session.
  const second = manager.getOrCreateClient({ ip: '192.168.1.99', name: 'Test TV' });
  assert.equal(second, first);
  assert.equal(manager.getClient('192.168.1.99'), first);
});

test('AndroidTVClientManager - getOrCreateClient should pick up certificates added later', () => {
  const manager = new AndroidTVClientManager(createMockGladys());

  const client = manager.getOrCreateClient({ ip: '192.168.1.99' });
  assert.equal(client.isPaired(), false);

  manager.getOrCreateClient({ ip: '192.168.1.99', certificate_key: 'KEY', certificate_cert: 'CERT' });
  assert.equal(client.isPaired(), true);
});

test('AndroidTVClientManager - should not try to connect an unpaired TV', async () => {
  const gladys = createMockGladys();
  const manager = new AndroidTVClientManager(gladys);

  await manager.connectAll([{ ip: '192.168.1.50', name: 'Salon TV' }]);

  const client = manager.getClient('192.168.1.50');
  assert.equal(client.isConnected, false);
  assert.equal(client.remote, null);

  const status = gladys.statuses.at(-1);
  assert.equal(status.connected, false);
  assert.match(status.message.fr, /appairée/);
});

test('AndroidTVClientManager - should report an explicit status when nothing is configured', async () => {
  const gladys = createMockGladys();
  const manager = new AndroidTVClientManager(gladys);

  await manager.connectAll([]);

  const status = gladys.statuses.at(-1);
  assert.equal(status.connected, false);
  assert.match(status.message.fr, /Aucune Android TV configurée/);
});

test('AndroidTVClientManager - should publish TV states on the matching feature ids', async () => {
  const gladys = createMockGladys();
  const manager = new AndroidTVClientManager(gladys);
  const client = manager.getOrCreateClient({ ip: '192.168.1.50' });

  client.powered = true;
  client._emit('power', true);

  client.volumeMax = 50;
  client._emit('volume', { level: 25, maximum: 50, muted: true });

  assert.deepEqual(gladys.published, [
    { externalId: 'androidtv:tv:192_168_1_50:power', value: 1 },
    { externalId: 'androidtv:tv:192_168_1_50:volume', value: 50 },
    { externalId: 'androidtv:tv:192_168_1_50:mute', value: 1 },
  ]);
});

test('AndroidTVClientManager - a configuration save must not kill a pairing in progress', () => {
  const manager = new AndroidTVClientManager(createMockGladys());

  const pairing = manager.getOrCreateClient({ ip: '192.168.1.50' });
  manager.getOrCreateClient({ ip: '192.168.1.51' });
  pairing.isPairing = true;
  manager.setPairingTarget('192.168.1.50', 'Salon TV');

  // Saving the configuration reconnects everything; the session opened by
  // step 1 holds the PIN currently displayed on the TV and must survive.
  manager.disconnectAll();

  assert.equal(manager.getClient('192.168.1.50'), pairing);
  assert.equal(manager.getClient('192.168.1.51'), undefined);
  assert.equal(manager.getPairingTarget().client, pairing);
  assert.equal(manager.getPairingTarget().name, 'Salon TV');
});

test('AndroidTVClientManager - removeClient should forget the TV, even mid-pairing', () => {
  const manager = new AndroidTVClientManager(createMockGladys());

  const client = manager.getOrCreateClient({ ip: '192.168.1.50' });
  client.isPairing = true;
  manager.setPairingTarget('192.168.1.50', 'Salon TV');

  // Removing a TV is an explicit user decision: unlike disconnectAll(), it
  // must also close a pairing in progress and forget the pairing target.
  manager.removeClient('192.168.1.50');

  assert.equal(manager.getClient('192.168.1.50'), undefined);
  assert.equal(manager.getPairingTarget(), undefined);
  assert.equal(client.isPairing, false);
});

test('AndroidTVClientManager - removeClient should leave the other TVs alone', () => {
  const manager = new AndroidTVClientManager(createMockGladys());

  const kept = manager.getOrCreateClient({ ip: '192.168.1.51' });
  manager.getOrCreateClient({ ip: '192.168.1.50' });

  manager.removeClient('192.168.1.50');
  manager.removeClient('192.168.1.222'); // unknown IP: no effect, no crash

  assert.equal(manager.getClient('192.168.1.51'), kept);
});

test('AndroidTVClientManager - a lost connection schedules a reconnection, a success resets it', () => {
  const manager = new AndroidTVClientManager(createMockGladys());
  const client = manager.getOrCreateClient({ ip: '192.168.1.50', certificate_key: 'K', certificate_cert: 'C' });

  // The connection dropped: a retry must be pending, and the next delay is
  // already doubled for the attempt after it.
  client._emit('disconnected');
  assert.ok(manager.reconnectTimers.has('192.168.1.50'));
  assert.equal(manager.reconnectDelays.get('192.168.1.50'), RECONNECT_INITIAL_DELAY_MS * 2);

  // The TV is back: pending attempt cancelled, backoff reset.
  client._emit('connected');
  assert.equal(manager.reconnectTimers.has('192.168.1.50'), false);
  assert.equal(manager.reconnectDelays.has('192.168.1.50'), false);
});

test('AndroidTVClientManager - scheduleReconnect should skip TVs that cannot reconnect', () => {
  const manager = new AndroidTVClientManager(createMockGladys());

  manager.scheduleReconnect('192.168.1.99'); // unknown TV
  assert.equal(manager.reconnectTimers.size, 0);

  manager.getOrCreateClient({ ip: '192.168.1.50' });
  manager.scheduleReconnect('192.168.1.50'); // not paired
  assert.equal(manager.reconnectTimers.size, 0);

  const connected = manager.getOrCreateClient({ ip: '192.168.1.51', certificate_key: 'K', certificate_cert: 'C' });
  connected.isConnected = true;
  manager.scheduleReconnect('192.168.1.51'); // already connected
  assert.equal(manager.reconnectTimers.size, 0);
});

test('AndroidTVClientManager - the retry delay doubles up to the cap', () => {
  const manager = new AndroidTVClientManager(createMockGladys());
  manager.getOrCreateClient({ ip: '192.168.1.50', certificate_key: 'K', certificate_cert: 'C' });

  let expected = RECONNECT_INITIAL_DELAY_MS;
  for (let i = 0; i < 10; i += 1) {
    manager.scheduleReconnect('192.168.1.50');
    // Drop the pending timer to simulate a failed attempt without waiting.
    clearTimeout(manager.reconnectTimers.get('192.168.1.50'));
    manager.reconnectTimers.delete('192.168.1.50');
    expected = Math.min(expected * 2, RECONNECT_MAX_DELAY_MS);
    assert.equal(manager.reconnectDelays.get('192.168.1.50'), expected);
  }
});

test('AndroidTVClientManager - promptReconnect should forget the accumulated backoff', () => {
  const manager = new AndroidTVClientManager(createMockGladys());
  manager.getOrCreateClient({ ip: '192.168.1.50', certificate_key: 'K', certificate_cert: 'C' });

  // The TV was off for a while: the delay reached the cap.
  for (let i = 0; i < 8; i += 1) {
    manager.scheduleReconnect('192.168.1.50');
    clearTimeout(manager.reconnectTimers.get('192.168.1.50'));
    manager.reconnectTimers.delete('192.168.1.50');
  }
  assert.equal(manager.reconnectDelays.get('192.168.1.50'), RECONNECT_MAX_DELAY_MS);

  // A Wake-on-LAN was just sent: the next attempts must come quickly.
  manager.promptReconnect('192.168.1.50');
  assert.ok(manager.reconnectTimers.has('192.168.1.50'));
  assert.equal(manager.reconnectDelays.get('192.168.1.50'), RECONNECT_INITIAL_DELAY_MS * 2);

  manager.disconnectAll();
});

test('AndroidTVClientManager - a known app reported by the TV updates the application select', () => {
  const gladys = createMockGladys();
  const manager = new AndroidTVClientManager(gladys);
  const client = manager.getOrCreateClient({ ip: '192.168.1.50' });

  client._emit('current_app', 'com.netflix.ninja');
  client._emit('current_app', 'com.some.unknown.app'); // not in the catalog: nothing published

  assert.deepEqual(gladys.published, [{ externalId: 'androidtv:tv:192_168_1_50:app', value: { text: 'netflix' } }]);
});

test('AndroidTVClientManager - removeClient and disconnectAll should cancel pending reconnections', () => {
  const manager = new AndroidTVClientManager(createMockGladys());
  manager.getOrCreateClient({ ip: '192.168.1.50', certificate_key: 'K', certificate_cert: 'C' });
  manager.getOrCreateClient({ ip: '192.168.1.51', certificate_key: 'K', certificate_cert: 'C' });

  manager.scheduleReconnect('192.168.1.50');
  manager.scheduleReconnect('192.168.1.51');
  assert.equal(manager.reconnectTimers.size, 2);

  manager.removeClient('192.168.1.50');
  assert.equal(manager.reconnectTimers.has('192.168.1.50'), false);

  manager.disconnectAll();
  assert.equal(manager.reconnectTimers.size, 0);
  assert.equal(manager.reconnectDelays.size, 0);
});

test('AndroidTVClientManager - getPairingTarget should ignore a closed session', () => {
  const manager = new AndroidTVClientManager(createMockGladys());

  assert.equal(manager.getPairingTarget(), undefined);

  manager.getOrCreateClient({ ip: '192.168.1.50' });
  manager.setPairingTarget('192.168.1.50', 'Salon TV');

  // isPairing stays false: the session never opened, or already ended.
  assert.equal(manager.getPairingTarget(), undefined);
});
