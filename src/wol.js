import { logger } from '@gladysassistant/integration-sdk';

// The Gladys core rate-limits wakeOnLan to 1 packet per 2 seconds per
// integration: the fallback packets are spaced a little wider than that.
export const WAKE_STAGGER_MS = 2100;

/**
 * Wake-on-LAN destinations for a TV, most reliable first.
 *
 * The magic packet is emitted by the Gladys core (host network), but a single
 * destination is not enough in practice:
 * - the subnet directed broadcast (x.x.x.255) is the one that crosses Docker
 *   bridges and satisfies devices that ignore the limited broadcast;
 * - 255.255.255.255 (the historical default) covers subnets that are not /24;
 * - the unicast IP of the TV reaches it while its ARP entry is still cached.
 *
 * The subnet mask is not known here: /24 covers the home networks this
 * integration targets, and the two other destinations back the rare setups
 * it does not.
 *
 * @param {string} tvIp The TV IPv4 address.
 * @returns {Array<string>} Destination addresses, deduplicated, most reliable first.
 */
export function buildWakeTargets(tvIp) {
  const targets = [];
  const octets = String(tvIp ?? '').split('.');
  if (octets.length === 4) {
    targets.push([...octets.slice(0, 3), '255'].join('.'));
  }
  targets.push('255.255.255.255');
  if (octets.length === 4) {
    targets.push(String(tvIp));
  }
  return [...new Set(targets)];
}

/**
 * Emit the Wake-on-LAN magic packet towards every destination of the TV.
 *
 * The first packet (subnet broadcast) is awaited so the caller reports a real
 * failure to the user; the fallbacks run in the background, spaced to respect
 * the rate limit of the core — their failure only concerns destinations that
 * were second chances to begin with, it is logged and never thrown.
 *
 * @param {Object} gladys Gladys integration SDK instance.
 * @param {string} mac The TV MAC address.
 * @param {string} tvIp The TV IPv4 address.
 * @param {Object} [options] Options.
 * @param {number} [options.staggerMs] Delay between two packets (overridable for tests).
 * @returns {Promise<void>} Resolves once the first packet is emitted.
 */
export async function sendWakeSequence(gladys, mac, tvIp, { staggerMs = WAKE_STAGGER_MS } = {}) {
  const [primary, ...fallbacks] = buildWakeTargets(tvIp);

  logger.info(`[AndroidTV] Waking the TV at ${tvIp} (MAC ${mac}) with a magic packet to ${primary}...`);
  await gladys.wakeOnLan(mac, { address: primary });

  fallbacks.forEach((address, index) => {
    const timer = setTimeout(
      () => {
        logger.debug(`[AndroidTV] Wake-on-LAN fallback packet for ${tvIp} to ${address}.`);
        gladys
          .wakeOnLan(mac, { address })
          .catch((err) => logger.warn(`[AndroidTV] Wake-on-LAN fallback to ${address} failed: ${err.message}`));
      },
      staggerMs * (index + 1),
    );
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  });
}
