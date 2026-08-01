import test from 'node:test';
import assert from 'node:assert/strict';
import { AndroidTVClientManager } from '../src/remote/client-manager.js';

const mockGladys = {
  externalId: (id) => `androidtv:${id}`,
  publishState: async () => {},
  setConnectionStatus: async () => {},
};

test('AndroidTVClientManager - should create client and manage map correctly', async () => {
  const manager = new AndroidTVClientManager(mockGladys);

  const tvs = [
    { ip: '192.168.1.50', name: 'Salon TV' },
    { ip: '192.168.1.51', name: 'Chambre TV' },
  ];

  await manager.connectAll(tvs);

  assert.ok(manager.getClient('192.168.1.50'));
  assert.ok(manager.getClient('192.168.1.51'));
  assert.equal(manager.getClient('192.168.1.52'), undefined);

  manager.disconnectAll();
  assert.equal(manager.getClient('192.168.1.50'), undefined);
});

test('AndroidTVClientManager - getOrCreateClient should create transient client if not existing', () => {
  const manager = new AndroidTVClientManager(mockGladys);

  const client = manager.getOrCreateClient({ ip: '192.168.1.99', name: 'Test TV' });
  assert.ok(client);
  assert.equal(client.ip, '192.168.1.99');
});
