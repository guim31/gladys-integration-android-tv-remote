import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWakeTargets, sendWakeSequence } from '../src/wol.js';

test('buildWakeTargets - should target the subnet broadcast first', () => {
  assert.deepEqual(buildWakeTargets('192.168.1.57'), ['192.168.1.255', '255.255.255.255', '192.168.1.57']);
});

test('buildWakeTargets - should fall back to the limited broadcast on a malformed IP', () => {
  assert.deepEqual(buildWakeTargets(''), ['255.255.255.255']);
  assert.deepEqual(buildWakeTargets(undefined), ['255.255.255.255']);
});

test('sendWakeSequence - should stagger one packet per destination', async () => {
  const calls = [];
  const gladys = {
    wakeOnLan: async (mac, options) => {
      calls.push({ mac, address: options.address });
    },
  };

  await sendWakeSequence(gladys, '24:18:c6:5a:1b:7e', '192.168.1.57', { staggerMs: 5 });

  // The subnet broadcast is awaited: a failure there reaches the user.
  assert.deepEqual(calls, [{ mac: '24:18:c6:5a:1b:7e', address: '192.168.1.255' }]);

  // The fallbacks follow in the background, spaced for the core rate limit.
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(
    calls.map((call) => call.address),
    ['192.168.1.255', '255.255.255.255', '192.168.1.57'],
  );
});

test('sendWakeSequence - a fallback failure must stay in the background', async () => {
  const calls = [];
  const gladys = {
    wakeOnLan: async (mac, options) => {
      calls.push(options.address);
      if (calls.length > 1) {
        throw new Error('429 rate limited');
      }
    },
  };

  await sendWakeSequence(gladys, '24:18:c6:5a:1b:7e', '192.168.1.57', { staggerMs: 5 });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(calls.length, 3, 'a failed fallback must not stop the next one');
});
