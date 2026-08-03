import test from 'node:test';
import assert from 'node:assert/strict';
import { AndroidTVClientManager } from '../src/remote/client-manager.js';

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

test('AndroidTVClientManager - getPairingTarget should ignore a closed session', () => {
  const manager = new AndroidTVClientManager(createMockGladys());

  assert.equal(manager.getPairingTarget(), undefined);

  manager.getOrCreateClient({ ip: '192.168.1.50' });
  manager.setPairingTarget('192.168.1.50', 'Salon TV');

  // isPairing stays false: the session never opened, or already ended.
  assert.equal(manager.getPairingTarget(), undefined);
});
