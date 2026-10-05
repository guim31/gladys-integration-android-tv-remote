import { logger } from '@gladysassistant/integration-sdk';
import { AndroidTVClient } from './android-tv-client.js';
import { resolveApps } from '../devices/apps.js';
import { WIDGET } from '../widgets.js';

// A TV that is powered off stays unreachable for hours: the retry delay
// doubles on every failed attempt, from 5 seconds up to 2 minutes, and resets
// as soon as a connection succeeds.
export const RECONNECT_INITIAL_DELAY_MS = 5 * 1000;
export const RECONNECT_MAX_DELAY_MS = 2 * 60 * 1000;

// The Gladys core accepts one widget refresh request per 10 seconds per
// widget and drops the others silently: the nudges inside the window are
// coalesced into a single one, sent when the window ends.
export const WIDGET_NUDGE_MS = 10 * 1000;

/**
 * The last state known of a TV before it reported anything.
 *
 * @returns {Object} { connected, powered, volume, muted, appPackage }.
 */
function emptyTvState() {
  return {
    // Whether a Remote v2 session is open with the TV right now.
    connected: false,
    // true: on, false: off or in standby, null: never reported.
    powered: null,
    // Volume in percent of the TV scale, null when never reported.
    volume: null,
    // true/false, null when never reported.
    muted: null,
    // Android package of the foreground app, null when never reported.
    appPackage: null,
  };
}

export class AndroidTVClientManager {
  constructor(gladys, getApps = () => resolveApps(), { widgetNudgeMs = WIDGET_NUDGE_MS } = {}) {
    this.gladys = gladys;
    // Returns the CURRENT app list on each call: the configuration (hidden
    // and custom apps) can change at any time, a list captured at build time
    // would go stale.
    this.getApps = getApps;
    this.clients = new Map();
    // Last state known of each TV, by IP: what the dashboard widgets show.
    // A TV only pushes its states over a live session, so this memory is the
    // only way to answer a widget without a round trip to the TV.
    this.states = new Map();
    // Pending widget refresh requests, by widget key ({ last, timer }).
    this.widgetNudgeMs = widgetNudgeMs;
    this.widgetNudges = new Map();
    // TV going through the pairing sequence, remembered between step 1 and
    // step 2 so the PIN action does not have to ask for the address again.
    this.pairingTarget = null;
    // Pending reconnection timer and current retry delay, per TV IP.
    this.reconnectTimers = new Map();
    this.reconnectDelays = new Map();
  }

  /**
   * Remember the TV the pairing sequence was started for.
   *
   * @param {string} ip TV IP address.
   * @param {string} name Display name typed by the user.
   * @param {string} [mac] Normalized MAC address, for Wake-on-LAN.
   */
  setPairingTarget(ip, name, mac = '') {
    this.pairingTarget = { ip, name, mac };
  }

  /**
   * The client of the TV being paired, when its session is still open.
   *
   * @returns {Object|undefined} { client, ip, name } of the pending pairing.
   */
  getPairingTarget() {
    if (!this.pairingTarget) {
      return undefined;
    }
    const client = this.clients.get(this.pairingTarget.ip);
    if (!client || !client.isPairing) {
      return undefined;
    }
    return { ...this.pairingTarget, client };
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
   * The last state known of a TV, for the dashboard widgets.
   *
   * A TV never heard of (no client yet, or removed) is simply not connected
   * with nothing known: the widgets show it as unreachable.
   *
   * @param {string} ip TV IP address.
   * @returns {Object} A copy of { connected, powered, volume, muted, appPackage }.
   */
  getTvState(ip) {
    return { ...(this.states.get(ip) || emptyTvState()) };
  }

  /**
   * Record what a TV just reported and nudge the widgets showing it.
   *
   * Only an actual change nudges: a TV repeats its volume report on every
   * key press, and the core rate-limits the nudges anyway.
   *
   * @param {string} ip TV IP address.
   * @param {Object} changes Fields of the state to update.
   * @param {Array<string>} widgetKeys Widgets showing these fields.
   */
  _updateTvState(ip, changes, widgetKeys) {
    const state = this.states.get(ip) || emptyTvState();
    const changed = Object.keys(changes).some((field) => state[field] !== changes[field]);
    this.states.set(ip, { ...state, ...changes });
    if (changed) {
      this.nudgeWidgets(widgetKeys);
    }
  }

  /**
   * Ask Gladys to re-pull some widgets, once per 10-second window each.
   *
   * The core drops a second request inside its window silently: a change
   * arriving right after a nudge would never reach the dashboards, so the
   * request is delayed to the end of the window instead.
   *
   * @param {Array<string>} widgetKeys Widget keys declared in the manifest.
   */
  nudgeWidgets(widgetKeys) {
    if (typeof this.gladys.requestWidgetRefresh !== 'function') {
      return;
    }
    for (const key of widgetKeys) {
      const entry = this.widgetNudges.get(key) || { last: 0, timer: null };
      this.widgetNudges.set(key, entry);
      if (entry.timer) {
        continue;
      }
      const send = () => {
        entry.timer = null;
        entry.last = Date.now();
        try {
          this.gladys.requestWidgetRefresh(key);
        } catch (err) {
          logger.debug(`[AndroidTV] Widget refresh request for "${key}" failed: ${err.message}`);
        }
      };
      const wait = entry.last + this.widgetNudgeMs - Date.now();
      if (wait <= 0) {
        send();
      } else {
        entry.timer = setTimeout(send, wait);
        if (typeof entry.timer.unref === 'function') {
          entry.timer.unref();
        }
      }
    }
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
   * The connections run in parallel: each attempt can wait its full timeout,
   * so connecting one TV after the other would make every unreachable TV delay
   * the startup of all the following ones.
   *
   * @param {Array<Object>} tvs Array of TV configuration objects.
   */
  async connectAll(tvs = []) {
    this.disconnectAll();

    await Promise.all(
      tvs
        .filter((tv) => tv.ip)
        .map(async (tv) => {
          const client = this.getOrCreateClient(tv);

          if (!client.isPaired()) {
            logger.info(`[AndroidTV] The TV at ${tv.ip} is not paired yet, pairing required.`);
            return;
          }

          try {
            await client.connect();
            logger.info(`[AndroidTV] Connected to ${tv.name || tv.ip} (${tv.ip})`);
          } catch (err) {
            logger.warn(
              `[AndroidTV] Failed to connect to the TV at ${tv.ip}: ${err.message} ` +
                'Retrying in the background — it will be picked up when it becomes reachable.',
            );
            this.scheduleReconnect(tv.ip);
          }
        }),
    );

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
   * Schedule a reconnection attempt to a TV, with an exponential backoff.
   *
   * The library used to retry on its own every second, forever: a TV powered
   * off for the night would flood the logs and hammer the network. Each
   * attempt is now a single connection try, spaced further and further apart.
   *
   * @param {string} ip TV IP address.
   */
  scheduleReconnect(ip) {
    if (this.reconnectTimers.has(ip) || !this._isReconnectable(ip)) {
      return;
    }

    const delayMs = this.reconnectDelays.get(ip) ?? RECONNECT_INITIAL_DELAY_MS;
    this.reconnectDelays.set(ip, Math.min(delayMs * 2, RECONNECT_MAX_DELAY_MS));
    logger.debug(`[AndroidTV] Next connection attempt to ${ip} in ${Math.round(delayMs / 1000)}s.`);

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(ip);
      this._attemptReconnect(ip);
    }, delayMs);
    // Never keep the process alive just for a retry timer.
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
    this.reconnectTimers.set(ip, timer);
  }

  /**
   * Run one scheduled reconnection attempt.
   *
   * Failures only reschedule quietly: the first failure was already reported,
   * repeating it every attempt is exactly the log flood the backoff avoids.
   *
   * @param {string} ip TV IP address.
   */
  async _attemptReconnect(ip) {
    if (!this._isReconnectable(ip)) {
      return;
    }
    const client = this.clients.get(ip);
    try {
      await client.connect();
      // The 'connected' listener resets the backoff and refreshes the status.
    } catch (err) {
      logger.debug(`[AndroidTV] The TV at ${ip} is still unreachable: ${err.message}`);
      this.scheduleReconnect(ip);
    }
  }

  /**
   * Retry connecting to a TV soon, forgetting the accumulated backoff.
   *
   * Used right after a Wake-on-LAN: the TV was probably unreachable for a
   * long time (delay at the cap), but it is now booting — the next attempts
   * must come quickly, not in two minutes.
   *
   * @param {string} ip TV IP address.
   */
  promptReconnect(ip) {
    this._cancelReconnect(ip);
    this.scheduleReconnect(ip);
  }

  /**
   * Whether a scheduled reconnection makes sense for a TV right now.
   *
   * `client.remote` is set for the whole lifetime of a session, from the
   * connection attempt to its close: a truthy value means an attempt is
   * already running (or the TV is connected), so a parallel one would only
   * tear it down.
   *
   * @param {string} ip TV IP address.
   * @returns {boolean} True when a new connection attempt can be scheduled.
   */
  _isReconnectable(ip) {
    const client = this.clients.get(ip);
    return Boolean(client && client.isPaired() && !client.isConnected && !client.isPairing && !client.remote);
  }

  /**
   * Cancel the pending reconnection of a TV and reset its backoff.
   *
   * @param {string} ip TV IP address.
   */
  _cancelReconnect(ip) {
    const timer = this.reconnectTimers.get(ip);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(ip);
    }
    this.reconnectDelays.delete(ip);
  }

  /**
   * Forget a TV for good: close its session and drop its client.
   *
   * Unlike disconnectAll(), a pairing in progress is closed too — removing a
   * TV in the middle of its own pairing means the user gave up on it.
   *
   * @param {string} ip TV IP address.
   */
  removeClient(ip) {
    this._cancelReconnect(ip);
    const client = this.clients.get(ip);
    if (client) {
      try {
        client.disconnect();
      } catch (err) {
        logger.warn(`[AndroidTV] Error disconnecting client ${ip}:`, err.message);
      }
      this.clients.delete(ip);
    }
    this.states.delete(ip);
    if (this.pairingTarget?.ip === ip) {
      this.pairingTarget = null;
    }
    this.nudgeWidgets(Object.values(WIDGET));
  }

  /**
   * Disconnect all TV client instances.
   */
  disconnectAll() {
    for (const ip of [...this.reconnectTimers.keys()]) {
      this._cancelReconnect(ip);
    }
    this.reconnectDelays.clear();
    for (const [ip, client] of this.clients.entries()) {
      // Saving the configuration in the middle of a pairing must not destroy
      // the session opened by step 1: step 2 needs that very socket, and the
      // PIN displayed on the TV dies with it.
      if (client.isPairing) {
        logger.info(`[AndroidTV] Pairing in progress with ${ip}, keeping its session alive.`);
        continue;
      }
      try {
        client.disconnect();
      } catch (err) {
        logger.warn(`[AndroidTV] Error disconnecting client ${ip}:`, err.message);
      }
      this.clients.delete(ip);
      this.states.delete(ip);
    }
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

    const ip = tvConfig.ip;
    const everyWidget = Object.values(WIDGET);

    client.on('power', (powered) => {
      this._updateTvState(ip, { powered: Boolean(powered) }, [WIDGET.REMOTE]);
      return publish('power', powered ? 1 : 0);
    });

    client.on('volume', (volume) => {
      const changes = {};
      if (typeof volume?.level === 'number' && client.volumeMax) {
        changes.volume = Math.round((volume.level / client.volumeMax) * 100);
        publish('volume', changes.volume);
      }
      if (typeof volume?.muted === 'boolean') {
        changes.muted = volume.muted;
        publish('mute', volume.muted ? 1 : 0);
      }
      this._updateTvState(ip, changes, [WIDGET.REMOTE, WIDGET.VOLUME]);
    });

    // The TV reports the package of its foreground app: shown as the current
    // selection of the application select. An app outside the catalog is not
    // published — the select would have no matching option to display anyway.
    client.on('current_app', (appPackage) => {
      this._updateTvState(ip, { appPackage: appPackage ? String(appPackage) : null }, [
        WIDGET.REMOTE,
        WIDGET.MEDIA,
        WIDGET.APPS,
      ]);
      const app = this.getApps().find((supported) => supported.package === appPackage);
      if (app) {
        publish('app', { text: app.id });
      }
    });

    // A TV switched on later, a connection dropped, a certificate revoked: the
    // status shown in the configuration screen has to follow.
    client.on('connected', () => {
      this._cancelReconnect(ip);
      this._updateTvState(ip, { connected: true }, everyWidget);
      return this.refreshConnectionStatus();
    });
    // A dropped connection comes back through the scheduled reconnections: a
    // TV rebooting or in standby answers the first attempt, a TV powered off
    // is probed less and less often.
    client.on('disconnected', () => {
      this._updateTvState(ip, { connected: false }, everyWidget);
      this.scheduleReconnect(ip);
      return this.refreshConnectionStatus();
    });
    client.on('unpaired', () => {
      this._updateTvState(ip, { connected: false }, everyWidget);
      return this.refreshConnectionStatus();
    });

    return client;
  }
}
