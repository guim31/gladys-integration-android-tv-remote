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
   * @param {string} ip TV IP address.
   * @returns {AndroidTVClient|undefined} The client, when it exists.
   */
  getClient(ip) {
    return this.clients.get(ip);
  }

  /**
   * Get the client of a TV, creating AND registering it when it is missing.
   *
   * Registering matters for the pairing sequence: "Start Pairing" and "Confirm
   * PIN" are two separate user actions, and the second one needs the very
   * session opened by the first — a client created and thrown away would make
   * every pairing fail with "No pairing session is active".
   *
   * @param {Object} tvConfig TV configuration ({ ip, name, certificate_key, certificate_cert }).
   * @returns {AndroidTVClient} The registered client.
   */
  getOrCreateClient(tvConfig) {
    const existing = this.clients.get(tvConfig.ip);
    if (existing) {
      // Certificates may have been added to the configuration since.
      if (tvConfig.certificate_key && tvConfig.certificate_cert && !existing.isPaired()) {
        existing.key = tvConfig.certificate_key;
        existing.cert = tvConfig.certificate_cert;
      }
      return existing;
    }

    const client = this._createClient(tvConfig);
    this.clients.set(tvConfig.ip, client);
    return client;
  }

  /**
   * Initialize and connect client instances for all configured TVs.
   *
   * @param {Array<Object>} tvs Array of TV configuration objects.
   */
  async connectAll(tvs = []) {
    this.disconnectAll();

    for (const tv of tvs) {
      if (!tv.ip) {
        continue;
      }

      const client = this.getOrCreateClient(tv);

      if (!client.isPaired()) {
        logger.info(`[AndroidTV] The TV at ${tv.ip} is not paired yet, pairing required.`);
        continue;
      }

      try {
        await client.connect();
        logger.info(`[AndroidTV] Connected to ${tv.name || tv.ip} (${tv.ip})`);
      } catch (err) {
        logger.error(`[AndroidTV] Failed to connect to the TV at ${tv.ip}: ${err.message}`);
      }
    }

    await this.refreshConnectionStatus();
  }

  /**
   * Publish the application-level connection status shown in the Gladys
   * configuration screen, with a message explaining what is missing.
   */
  async refreshConnectionStatus() {
    const clients = [...this.clients.values()];
    const connected = clients.filter((client) => client.isConnected);

    if (connected.length > 0) {
      await this.gladys.setConnectionStatus(true).catch(() => {});
      return;
    }

    let message;
    if (clients.length === 0) {
      message = {
        en: 'No Android TV configured. Enter the IP address of your TV, then run the pairing sequence.',
        fr: "Aucune Android TV configurée. Saisissez l'adresse IP de votre TV, puis lancez l'appairage.",
      };
    } else if (clients.every((client) => !client.isPaired())) {
      message = {
        en: 'Android TV configured but not paired yet. Run "Start Pairing", then confirm the PIN code displayed on the TV.',
        fr: "Android TV configurée mais pas encore appairée. Lancez « Démarrer l'appairage », puis validez le code PIN affiché sur la TV.",
      };
    } else {
      message = {
        en: 'No Android TV reachable. Make sure your TVs are turned on and connected to the same network.',
        fr: 'Aucune Android TV joignable. Vérifiez que vos TV sont allumées et connectées au même réseau.',
      };
    }

    await this.gladys.setConnectionStatus(false, message).catch(() => {});
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

  /**
   * Build a client wired to the Gladys state channel.
   *
   * @param {Object} tvConfig TV configuration object.
   * @returns {AndroidTVClient} The new client.
   */
  _createClient(tvConfig) {
    const client = new AndroidTVClient({
      tv_ip: tvConfig.ip,
      certificate_key: tvConfig.certificate_key,
      certificate_cert: tvConfig.certificate_cert,
    });

    const ipSanitized = String(tvConfig.ip).replace(/[^a-zA-Z0-9]/g, '_');
    const featureId = (suffix) => this.gladys.externalId(`tv:${ipSanitized}:${suffix}`);
    const publish = (suffix, value) => this.gladys.publishState(featureId(suffix), value).catch(() => {});

    client.on('power', (powered) => publish('power', powered ? 1 : 0));

    client.on('volume', (volume) => {
      if (typeof volume?.level === 'number' && client.volumeMax) {
        publish('volume', Math.round((volume.level / client.volumeMax) * 100));
      }
      if (typeof volume?.muted === 'boolean') {
        publish('mute', volume.muted ? 1 : 0);
      }
    });

    // A TV switched on later, a connection dropped, a certificate revoked: the
    // status shown in the configuration screen has to follow.
    client.on('connected', () => this.refreshConnectionStatus());
    client.on('disconnected', () => this.refreshConnectionStatus());
    client.on('unpaired', () => this.refreshConnectionStatus());

    return client;
  }
}
