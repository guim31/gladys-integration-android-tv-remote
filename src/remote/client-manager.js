import { logger } from '@gladysassistant/integration-sdk';
import { AndroidTVClient } from './android-tv-client.js';

export class AndroidTVClientManager {
  constructor(gladys) {
    this.gladys = gladys;
    this.clients = new Map();
  }

  /**
   * Get an existing client instance by TV IP address.
   *
   * @param {string} ip
   * @returns {AndroidTVClient|undefined}
   */
  getClient(ip) {
    return this.clients.get(ip);
  }

  /**
   * Get an existing client or create a transient client for pairing/testing.
   *
   * @param {Object} tvConfig TV configuration object { ip, name, certificate_key, certificate_cert }
   * @returns {AndroidTVClient}
   */
  getOrCreateClient(tvConfig) {
    if (this.clients.has(tvConfig.ip)) {
      return this.clients.get(tvConfig.ip);
    }
    const client = new AndroidTVClient({
      tv_ip: tvConfig.ip,
      certificate_key: tvConfig.certificate_key,
      certificate_cert: tvConfig.certificate_cert,
    });
    return client;
  }

  /**
   * Initialize and connect client instances for all configured TVs.
   *
   * @param {Array<Object>} tvs Array of TV configuration objects.
   */
  async connectAll(tvs = []) {
    this.disconnectAll();

    let connectedCount = 0;

    for (const tv of tvs) {
      if (!tv.ip) continue;

      const client = new AndroidTVClient({
        tv_ip: tv.ip,
        certificate_key: tv.certificate_key,
        certificate_cert: tv.certificate_cert,
      });

      const ipSanitized = tv.ip.replace(/[^a-zA-Z0-9]/g, '_');

      // Register real-time feedback event callbacks
      client.on('power', async (state) => {
        const powerFeatureId = this.gladys.externalId(`tv:${ipSanitized}:power`);
        await this.gladys.publishState(powerFeatureId, state ? 1 : 0).catch(() => {});
      });

      client.on('volume', async (vol) => {
        if (typeof vol.level === 'number') {
          const volFeatureId = this.gladys.externalId(`tv:${ipSanitized}:volume`);
          await this.gladys.publishState(volFeatureId, vol.level).catch(() => {});
        }
        if (typeof vol.muted === 'boolean') {
          const muteFeatureId = this.gladys.externalId(`tv:${ipSanitized}:mute`);
          await this.gladys.publishState(muteFeatureId, vol.muted ? 1 : 0).catch(() => {});
        }
      });

      this.clients.set(tv.ip, client);

      if (tv.certificate_key && tv.certificate_cert) {
        try {
          await client.connect();
          connectedCount++;
          logger.info(`[AndroidTV] Connected to ${tv.name || tv.ip} (${tv.ip})`);
        } catch (err) {
          logger.error(`[AndroidTV] Failed to connect to TV at ${tv.ip}:`, err.message);
        }
      } else {
        logger.info(`[AndroidTV] TV at ${tv.ip} is missing paired certificates. Pairing required.`);
      }
    }

    if (tvs.length > 0 && connectedCount > 0) {
      await this.gladys.setConnectionStatus(true).catch(() => {});
    } else {
      await this.gladys
        .setConnectionStatus(false, {
          en: 'No Android TV connected or paired.',
          fr: 'Aucune Android TV connectée ou appairée.',
        })
        .catch(() => {});
    }
  }

  /**
   * Disconnect all TV client instances.
   */
  disconnectAll() {
    for (const [ip, client] of this.clients.entries()) {
      try {
        client.disconnect();
      } catch (err) {
        logger.warn(`[AndroidTV] Error disconnecting client ${ip}:`, err.message);
      }
    }
    this.clients.clear();
  }
}
