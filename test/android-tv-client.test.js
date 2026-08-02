import test from 'node:test';
import assert from 'node:assert/strict';
import { AndroidTVClient, KEY_MAPPING } from '../src/remote/android-tv-client.js';

/**
 * Build a client with a fake live session, recording the keys it sends.
 *
 * @returns {Object} The client and the list of sent keys.
 */
function createConnectedClient() {
  const client = new AndroidTVClient({ tv_ip: '192.168.1.50', certificate_key: 'K', certificate_cert: 'C' });
  const sent = [];
  client.remote = {};
  client.isConnected = true;
  client.sendKey = async (key) => {
    sent.push(key);
  };
  return { client, sent };
}

test('AndroidTVClient - isPaired should reflect the stored certificates', () => {
  assert.equal(new AndroidTVClient({ tv_ip: '192.168.1.50' }).isPaired(), false);
  assert.equal(
    new AndroidTVClient({ tv_ip: '192.168.1.50', certificate_key: 'K', certificate_cert: 'C' }).isPaired(),
    true,
  );
});

test('AndroidTVClient - connect should refuse an unpaired TV', async () => {
  const client = new AndroidTVClient({ tv_ip: '192.168.1.50' });
  await assert.rejects(() => client.connect(), /not paired/);
});

test('AndroidTVClient - submitPin should refuse a PIN without an open session', async () => {
  const client = new AndroidTVClient({ tv_ip: '192.168.1.50' });
  await assert.rejects(() => client.submitPin('123456'), /No pairing session/);
});

test('AndroidTVClient - commands should be refused when disconnected', async () => {
  const client = new AndroidTVClient({ tv_ip: '192.168.1.50' });
  await assert.rejects(() => client.sendKey('home'), /not connected/);
  await assert.rejects(() => client.sendApp('https://www.netflix.com'), /not connected/);
});

test('AndroidTVClient - sendKey should reject an unknown key', async () => {
  const { client } = createConnectedClient();
  client.sendKey = AndroidTVClient.prototype.sendKey.bind(client);
  client.remote = { sendKey: async () => 'sent' };
  await assert.rejects(() => client.sendKey('does_not_exist'), /Unknown key code/);
});

test('AndroidTVClient - sendKey should map every documented key to a numeric code', () => {
  Object.entries(KEY_MAPPING).forEach(([name, code]) => {
    assert.equal(typeof code, 'number', `key ${name} has no numeric code`);
  });
});

test('AndroidTVClient - setPower should not toggle a TV already in the requested state', async () => {
  const { client, sent } = createConnectedClient();

  client.powered = true;
  await client.setPower(true);
  assert.deepEqual(sent, [], 'KEYCODE_POWER is a toggle: it must not be sent when already on');

  await client.setPower(false);
  assert.deepEqual(sent, ['power']);
});

test('AndroidTVClient - setPower should send the key when the state is unknown', async () => {
  const { client, sent } = createConnectedClient();
  await client.setPower(true);
  assert.deepEqual(sent, ['power']);
});

test('AndroidTVClient - setMute should not toggle a TV already in the requested state', async () => {
  const { client, sent } = createConnectedClient();

  client.muted = true;
  await client.setMute(true);
  assert.deepEqual(sent, []);

  await client.setMute(false);
  assert.deepEqual(sent, ['mute']);
});

test('AndroidTVClient - setVolumeLevel should step towards the target on the TV scale', async () => {
  const { client, sent } = createConnectedClient();

  // The TV reports a 0-50 scale and currently sits at 20.
  client.volumeMax = 50;
  client.volume = 20;

  // 50% of 50 is 25: five steps up.
  await client.setVolumeLevel(50);
  assert.deepEqual(sent, ['volume_up', 'volume_up', 'volume_up', 'volume_up', 'volume_up']);
});

test('AndroidTVClient - setVolumeLevel should do nothing when already at the target', async () => {
  const { client, sent } = createConnectedClient();
  client.volumeMax = 50;
  client.volume = 25;
  await client.setVolumeLevel(50);
  assert.deepEqual(sent, []);
});

test('AndroidTVClient - setVolumeLevel should fall back to one step without feedback', async () => {
  const { client, sent } = createConnectedClient();
  await client.setVolumeLevel(80);
  assert.deepEqual(sent, ['volume_up']);
});

test('AndroidTVClient - disconnect should be safe without any session', () => {
  const client = new AndroidTVClient({ tv_ip: '192.168.1.50' });
  client.disconnect();
  assert.equal(client.remote, null);
  assert.equal(client.isConnected, false);
});

test('AndroidTVClient - disconnect should stop the reconnection loop of the library', () => {
  const client = new AndroidTVClient({ tv_ip: '192.168.1.50' });
  const removed = [];
  let destroyed = false;

  const socket = {
    removeAllListeners: (event) => removed.push(event),
    destroy: () => {
      destroyed = true;
    },
  };
  client.remote = {
    remoteManager: { client: socket, removeAllListeners: () => {} },
    removeAllListeners: () => {},
  };
  client.isConnected = true;

  client.disconnect();

  // The library restarts itself from its own socket 'close' handler: dropping
  // that listener before destroying the socket is what actually stops it.
  assert.ok(removed.includes('close'));
  assert.ok(destroyed);
  assert.equal(client.remote, null);
  assert.equal(client.isConnected, false);
});
