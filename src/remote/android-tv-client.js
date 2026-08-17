import AndroidRemotePkg from 'androidtv-remote';
import { logger } from '@gladysassistant/integration-sdk';

const { AndroidRemote, RemoteKeyCode, RemoteDirection } = AndroidRemotePkg;

const PAIRING_TIMEOUT_MS = 25000;
const CONNECT_TIMEOUT_MS = 15000;
const VOLUME_STEP_DELAY_MS = 40;
// Time left to the TV to report its power state after the session opens.
// Google TVs send it right away; devices that never do (Mi Box...) are
// considered awake — they answered the connection.
const POWER_REPORT_GRACE_MS = 5000;

/**
 * Options shared by every AndroidRemote instance.
 *
 * The library reads `service_name`, not `name`: this is the label the TV shows
 * in its pairing dialog and in its list of paired devices.
 */
const BASE_OPTIONS = {
  service_name: 'Gladys Assistant',
  pairing_port: 6467,
  remote_port: 6466,
};

/**
 * Key codes mapping for Gladys feature triggers.
 */
export const KEY_MAPPING = {
  power: RemoteKeyCode.KEYCODE_POWER,
  home: RemoteKeyCode.KEYCODE_HOME,
  back: RemoteKeyCode.KEYCODE_BACK,
  up: RemoteKeyCode.KEYCODE_DPAD_UP,
  down: RemoteKeyCode.KEYCODE_DPAD_DOWN,
  left: RemoteKeyCode.KEYCODE_DPAD_LEFT,
  right: RemoteKeyCode.KEYCODE_DPAD_RIGHT,
  select: RemoteKeyCode.KEYCODE_DPAD_CENTER,
  enter: RemoteKeyCode.KEYCODE_DPAD_CENTER,
  volume_up: RemoteKeyCode.KEYCODE_VOLUME_UP,
  volume_down: RemoteKeyCode.KEYCODE_VOLUME_DOWN,
  mute: RemoteKeyCode.KEYCODE_VOLUME_MUTE,
  play_pause: RemoteKeyCode.KEYCODE_MEDIA_PLAY_PAUSE,
  play: RemoteKeyCode.KEYCODE_MEDIA_PLAY,
  pause: RemoteKeyCode.KEYCODE_MEDIA_PAUSE,
  stop: RemoteKeyCode.KEYCODE_MEDIA_STOP,
  next: RemoteKeyCode.KEYCODE_MEDIA_NEXT,
  previous: RemoteKeyCode.KEYCODE_MEDIA_PREVIOUS,
  rewind: RemoteKeyCode.KEYCODE_MEDIA_REWIND,
  fast_forward: RemoteKeyCode.KEYCODE_MEDIA_FAST_FORWARD,
  menu: RemoteKeyCode.KEYCODE_MENU,
};

export class AndroidTVClient {
  constructor(config = {}) {
    this.ip = config.tv_ip;
    this.key = config.certificate_key || '';
    this.cert = config.certificate_cert || '';
    this.remote = null;
    this.isConnected = false;
    this.isPairing = false;
    this.generatedCertificates = null;
    this.listeners = new Map();
    this.powerGraceTimer = null;
    // Overridable for tests: the production value waits several seconds.
    this.powerGraceMs = config.power_report_grace_ms || POWER_REPORT_GRACE_MS;

    // Last state reported by the TV. `null` means "never reported yet".
    this.powered = null;
    this.muted = null;
    this.volume = null;
    this.volumeMax = null;
  }

  /**
   * @returns {boolean} True when TLS certificates are available for this TV.
   */
  isPaired() {
    return Boolean(this.key && this.cert);
  }

  /**
   * Register a state listener callback (one per event).
   *
   * @param {string} event Event name: power, volume, current_app, connected, disconnected, unpaired.
   * @param {Function} callback Listener.
   */
  on(event, callback) {
    this.listeners.set(event, callback);
  }

  /**
   * Start pairing mode to prompt the PIN code on the TV screen.
   *
   * @returns {Promise<Object>} Resolves once the TV displays its PIN code.
   */
  async startPairing() {
    if (!this.ip) {
      throw new Error('TV IP address is missing in configuration.');
    }

    // A previous attempt may have left a session open.
    this.disconnect();
    this.isPairing = true;
    logger.info(`[AndroidTV] Initiating pairing sequence with TV at ${this.ip}...`);

    return new Promise((resolve, reject) => {
      let timeout;
      let settled = false;
      const finish = (settle, value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        settle(value);
      };

      try {
        // No certificate is passed on purpose: the library then generates a
        // fresh pair and runs the PIN exchange.
        this.remote = this._createRemote();
      } catch (err) {
        this.isPairing = false;
        reject(new Error(`Failed to create remote instance: ${err.message}`));
        return;
      }

      timeout = setTimeout(() => {
        this.isPairing = false;
        finish(
          reject,
          new Error(
            'Pairing request timed out. Make sure the TV is turned ON, connected to the same network, and that its IP address is correct.',
          ),
        );
      }, PAIRING_TIMEOUT_MS);

      this.remote.once('secret', () => {
        logger.info(`[AndroidTV] PIN code displayed on the screen of the TV at ${this.ip}.`);
        finish(resolve, {
          status: 'secret_required',
          message: 'PIN code is displayed on the TV screen.',
        });
      });

      this.remote.start().catch((err) => {
        this.isPairing = false;
        finish(reject, new Error(`Failed to start pairing protocol: ${err?.message || err}`));
      });
    });
  }

  /**
   * Submit the PIN code entered by the user to finalize the pairing.
   *
   * @param {string} pin PIN code displayed on the TV.
   * @returns {Promise<Object>} Resolves with the generated TLS certificates.
   */
  async submitPin(pin) {
    if (!this.remote || !this.remote.pairingManager) {
      throw new Error(
        'No pairing session is active. Click "Start Pairing" first, then submit the PIN code displayed on the TV.',
      );
    }

    // The TV displays hexadecimal characters; they get pasted with spaces or
    // dashes often enough to be worth normalizing.
    const cleanPin = String(pin ?? '')
      .replace(/[^0-9a-fA-F]/g, '')
      .toUpperCase();

    if (!cleanPin) {
      throw new Error('PIN code is required.');
    }
    if (cleanPin.length < 4) {
      throw new Error(`The PIN code looks too short ("${cleanPin}"). Type the code displayed on the TV screen.`);
    }

    logger.info(`[AndroidTV] Submitting PIN code to TV at ${this.ip}...`);

    return new Promise((resolve, reject) => {
      let timeout;
      let settled = false;

      const cleanup = () => {
        this.remote?.removeListener('ready', onReady);
        this.remote?.removeListener('unpaired', onUnpaired);
      };
      const finish = (settle, value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        cleanup();
        settle(value);
      };

      const onReady = () => {
        this.isPairing = false;
        const certificates = this.remote.getCertificate();
        this.key = certificates?.key || '';
        this.cert = certificates?.cert || '';
        this.generatedCertificates = certificates;
        logger.info(`[AndroidTV] Pairing with ${this.ip} succeeded, certificate obtained.`);
        finish(resolve, { status: 'success', certificates });
      };

      const onUnpaired = () => {
        this.isPairing = false;
        finish(reject, new Error('The TV refused the pairing. Please restart the pairing sequence.'));
      };

      timeout = setTimeout(() => {
        this.isPairing = false;
        finish(reject, new Error('PIN verification timed out. Check the code displayed on the TV and try again.'));
      }, PAIRING_TIMEOUT_MS);

      this.remote.on('ready', onReady);
      this.remote.on('unpaired', onUnpaired);

      try {
        // The library checks the checksum carried by the first two characters
        // before writing anything: on a mismatch it returns false and drops the
        // socket, and nothing is ever emitted afterwards. Without this check a
        // simple typo costs the user the whole timeout and reports it as a
        // network problem.
        if (this.remote.sendCode(cleanPin) === false) {
          finish(
            reject,
            new Error(
              'The TV rejected this PIN code. Check the code currently displayed on the screen — if it is gone, run step 1 again to get a fresh one.',
            ),
          );
          // The socket is dead: a retry on this session could only fail.
          this.disconnect();
        }
      } catch (err) {
        finish(reject, new Error(`Failed to send PIN code: ${err.message}`));
      }
    });
  }

  /**
   * Connect to the TV using the stored TLS certificates.
   *
   * A failed attempt never leaves anything running: the library retries every
   * second on its own forever, so an unreachable TV would fill the logs with
   * connection errors until the container restarts. Reconnections are
   * scheduled by the client manager instead, with a capped backoff.
   *
   * @returns {Promise<boolean>} Resolves once the remote session is ready.
   */
  async connect() {
    if (!this.ip) {
      throw new Error('TV IP address is missing in configuration.');
    }
    if (!this.isPaired()) {
      throw new Error(`The Android TV at ${this.ip} is not paired yet. Run the pairing sequence first.`);
    }

    this.disconnect();
    logger.info(`[AndroidTV] Connecting to ${this.ip}...`);

    return new Promise((resolve, reject) => {
      let timeout;
      let settled = false;
      let attempt;

      const cleanup = () => {
        attempt?.removeListener('ready', onReady);
        attempt?.removeListener('unpaired', onUnpaired);
      };
      // Close this attempt, unless a newer connect() already replaced it —
      // destroying the current session because an old one timed out would
      // kill a healthy connection.
      const abandon = () => {
        if (this.remote === attempt) {
          this.disconnect();
        }
      };
      const finish = (settle, value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        cleanup();
        settle(value);
      };

      const onReady = () => finish(resolve, true);
      const onUnpaired = () => {
        abandon();
        finish(
          reject,
          new Error(`The TV at ${this.ip} refused the stored certificate. Please run the pairing sequence again.`),
        );
      };

      try {
        attempt = this._createRemote({ cert: { key: this.key, cert: this.cert } });
        this.remote = attempt;
      } catch (err) {
        reject(new Error(`Failed to create remote instance: ${err.message}`));
        return;
      }

      timeout = setTimeout(() => {
        abandon();
        this._markUnreachable();
        finish(
          reject,
          new Error(`Connection to the TV at ${this.ip} timed out. Make sure it is turned ON and reachable.`),
        );
      }, CONNECT_TIMEOUT_MS);

      attempt.on('ready', onReady);
      attempt.on('unpaired', onUnpaired);

      attempt.start().catch((err) => {
        abandon();
        finish(reject, new Error(`Failed to start connection: ${err?.message || err}`));
      });

      // With a certificate at hand, the library builds its RemoteManager
      // synchronously, so it can already be guarded against uncaught errors.
      this._guardRemoteManager();

      // The library swallows connection errors (its start() resolves
      // undefined after logging them) and retries every second until this
      // promise times out. Intercepting the manager's own start() is the only
      // way to learn about the first failure: a TV that is off answers with
      // EHOSTUNREACH within seconds — no point waiting the full timeout.
      const manager = attempt.remoteManager;
      if (manager && typeof manager.start === 'function') {
        const libraryStart = manager.start.bind(manager);
        manager.start = () =>
          libraryStart().catch((err) => {
            abandon();
            this._markUnreachable();
            finish(
              reject,
              new Error(`The TV at ${this.ip} is unreachable (${err?.message || err}). Make sure it is turned ON.`),
            );
            throw err;
          });
      }
    });
  }

  /**
   * Send a key press.
   *
   * @param {string|number} keyNameOrCode Key name of KEY_MAPPING, or a raw key code.
   * @returns {Promise<void>} Resolves once the key is written on the socket.
   */
  async sendKey(keyNameOrCode) {
    this._assertConnected();

    const keyCode =
      typeof keyNameOrCode === 'number'
        ? keyNameOrCode
        : (KEY_MAPPING[String(keyNameOrCode).toLowerCase()] ?? RemoteKeyCode[keyNameOrCode]);

    if (typeof keyCode !== 'number') {
      throw new Error(`Unknown key code: ${keyNameOrCode}`);
    }

    logger.info(`[AndroidTV] Sending keycode ${keyCode} (${keyNameOrCode}) to ${this.ip}`);
    return this.remote.sendKey(keyCode, RemoteDirection.SHORT);
  }

  /**
   * Turn the TV on or off.
   *
   * KEYCODE_POWER is a toggle: it is only sent when the state known from the TV
   * differs from the requested one, otherwise asking for "on" on a TV that is
   * already on would switch it off.
   *
   * @param {boolean} turnOn Requested power state.
   * @returns {Promise<void>} Resolves once the command is handled.
   */
  async setPower(turnOn) {
    const requested = Boolean(turnOn);
    if (this.powered !== null && this.powered === requested) {
      logger.info(`[AndroidTV] TV at ${this.ip} is already ${requested ? 'ON' : 'OFF'}, no key sent.`);
      return;
    }
    await this.sendKey('power');
  }

  /**
   * Mute or unmute the TV.
   *
   * KEYCODE_VOLUME_MUTE is a toggle, same reasoning as setPower().
   *
   * @param {boolean} muted Requested mute state.
   * @returns {Promise<void>} Resolves once the command is handled.
   */
  async setMute(muted) {
    const requested = Boolean(muted);
    if (this.muted !== null && this.muted === requested) {
      logger.info(`[AndroidTV] TV at ${this.ip} is already ${requested ? 'muted' : 'unmuted'}, no key sent.`);
      return;
    }
    await this.sendKey('mute');
  }

  /**
   * Set the volume level.
   *
   * The Remote v2 protocol has no absolute volume command: the target is
   * reached by repeating the step keys. The TV reports its own scale
   * (`volumeMax`), so the percentage coming from Gladys is converted first.
   *
   * @param {number} targetPercent Requested volume, 0-100.
   * @returns {Promise<void>} Resolves once every step has been sent.
   */
  async setVolumeLevel(targetPercent) {
    this._assertConnected();

    const percent = Math.min(100, Math.max(0, Number(targetPercent) || 0));

    if (this.volume === null || !this.volumeMax) {
      // The TV has not reported its volume yet: a single step is the best we
      // can do without knowing the current level.
      logger.warn(`[AndroidTV] No volume feedback from ${this.ip} yet, sending a single step.`);
      await this.sendKey(percent >= 50 ? 'volume_up' : 'volume_down');
      return;
    }

    const target = Math.round((percent / 100) * this.volumeMax);
    const delta = target - this.volume;
    if (delta === 0) {
      return;
    }

    const key = delta > 0 ? 'volume_up' : 'volume_down';
    const steps = Math.min(Math.abs(delta), this.volumeMax);
    logger.info(`[AndroidTV] Adjusting volume of ${this.ip} by ${steps} ${key} step(s).`);

    for (let i = 0; i < steps; i += 1) {
      await this.sendKey(key);
      await delay(VOLUME_STEP_DELAY_MS);
    }
  }

  /**
   * Send an application deep link or package name.
   *
   * @param {string} appUriOrPackage Deep link URI or Android package name.
   * @returns {Promise<void>} Resolves once the request is written on the socket.
   */
  async sendApp(appUriOrPackage) {
    this._assertConnected();

    logger.info(`[AndroidTV] Opening app ${appUriOrPackage} on ${this.ip}`);
    if (typeof this.remote.sendAppLink === 'function') {
      return this.remote.sendAppLink(appUriOrPackage);
    }
    throw new Error('Application launcher is not supported by the current client library version.');
  }

  /**
   * Close the connection for good.
   *
   * `AndroidRemote.stop()` alone is not enough: the RemoteManager of the
   * library restarts itself from its own socket 'close' handler, so calling it
   * leaves a socket reconnecting in the background forever. The 'close'
   * listeners are dropped before destroying the socket to actually stop that
   * loop, otherwise every configuration update would stack a new set of
   * connections on top of the previous ones.
   */
  disconnect() {
    const remote = this.remote;
    this.remote = null;
    this.isConnected = false;
    this.isPairing = false;
    clearTimeout(this.powerGraceTimer);
    this.powerGraceTimer = null;

    if (!remote) {
      return;
    }

    try {
      [remote.pairingManager, remote.remoteManager].forEach((manager) => {
        if (!manager) {
          return;
        }
        // The restart of the library may already be scheduled (its 'close'
        // handler waits a second before calling start() again): dropping the
        // socket listeners cannot cancel that pending call, so start() itself
        // is neutralized to actually end the loop.
        if (typeof manager.start === 'function') {
          manager.start = async () => false;
        }
        const socket = manager.client;
        if (socket) {
          socket.removeAllListeners('close');
          socket.destroy();
        }
        manager.removeAllListeners();
      });
      remote.removeAllListeners();
    } catch (err) {
      logger.warn(`[AndroidTV] Error while closing the connection to ${this.ip}:`, err.message);
    }
  }

  /**
   * Build an AndroidRemote instance with every state listener already attached.
   *
   * @param {Object} options Extra options merged over BASE_OPTIONS (e.g. cert).
   * @returns {Object} The AndroidRemote instance.
   */
  _createRemote(options = {}) {
    const remote = new AndroidRemote(this.ip, { ...BASE_OPTIONS, ...options });

    // AndroidRemote itself never emits 'error' today, but a listener costs
    // nothing and an EventEmitter emitting 'error' without one kills the
    // process.
    remote.on('error', (err) => {
      logger.error(`[AndroidTV] Remote error on ${this.ip}:`, err?.message || err);
    });

    // The library emits 'powered', not 'power'.
    remote.on('powered', (powered) => {
      this.powered = Boolean(powered);
      this._emit('power', this.powered);
    });

    remote.on('volume', (volume) => {
      if (typeof volume?.level === 'number') {
        this.volume = volume.level;
      }
      if (typeof volume?.maximum === 'number' && volume.maximum > 0) {
        this.volumeMax = volume.maximum;
      }
      if (typeof volume?.muted === 'boolean') {
        this.muted = volume.muted;
      }
      this._emit('volume', volume);
    });

    remote.on('current_app', (app) => this._emit('current_app', app));

    remote.on('unpaired', () => {
      this.isConnected = false;
      logger.warn(`[AndroidTV] The TV at ${this.ip} rejected the stored certificate. A new pairing is required.`);
      this._emit('unpaired');
    });

    remote.on('ready', () => {
      this.isConnected = true;
      logger.info(`[AndroidTV] Remote session ready with ${this.ip}`);
      this._guardRemoteManager();
      // A fresh session invalidates what was known of the power state. Google
      // TVs report it right away (remoteStart); a device that reports nothing
      // within the grace delay is considered awake — it answered the
      // connection. TVs in network standby do send remoteStart(false), so
      // they are not mistaken for awake.
      this.powered = null;
      clearTimeout(this.powerGraceTimer);
      this.powerGraceTimer = setTimeout(() => {
        if (this.isConnected && this.powered === null) {
          this.powered = true;
          this._emit('power', true);
        }
      }, this.powerGraceMs);
      if (typeof this.powerGraceTimer.unref === 'function') {
        this.powerGraceTimer.unref();
      }
      this._emit('connected');
    });

    return remote;
  }

  /**
   * Report the TV as switched off because it stopped answering the network.
   *
   * The Remote v2 protocol has no power query: an unreachable device is the
   * closest thing to a "the TV is off" signal (the ping-style check users
   * expect). Only the off transition is reported here; the on transition
   * comes from the TV itself once a session opens again.
   */
  _markUnreachable() {
    if (this.powered === false) {
      return;
    }
    this.powered = false;
    this._emit('power', false);
  }

  /**
   * Protect the process from the RemoteManager of the library.
   *
   * It emits 'error' on itself when the TV reports a protocol error, and that
   * event is never forwarded to the AndroidRemote instance: without a listener
   * Node throws ERR_UNHANDLED_ERROR and the container dies. Its socket 'close'
   * is watched too, to keep `isConnected` honest.
   */
  _guardRemoteManager() {
    const manager = this.remote?.remoteManager;
    if (!manager) {
      return;
    }

    if (!manager.gladysErrorGuard) {
      manager.gladysErrorGuard = true;
      manager.on('error', (err) => {
        logger.error(`[AndroidTV] Protocol error reported by ${this.ip}:`, err?.error || err?.message || err);
      });
    }

    // The manager builds a new socket on every (re)connection, so each one
    // needs its own listener.
    const socket = manager.client;
    if (socket && !socket.gladysCloseGuard) {
      socket.gladysCloseGuard = true;
      socket.on('close', () => {
        if (!this.isConnected) {
          return;
        }
        this.isConnected = false;
        logger.warn(`[AndroidTV] Connection closed for ${this.ip}`);
        // The library would now retry every second on its own, forever, even
        // against a TV that is powered off. Close the session for good: the
        // client manager schedules the reconnections, with a capped backoff.
        this.disconnect();
        this._emit('disconnected');
      });
    }
  }

  /**
   * Call the registered listener of an event, never letting it break the
   * library callback it is called from.
   *
   * @param {string} event Event name.
   * @param {unknown} payload Event payload.
   */
  _emit(event, payload) {
    const callback = this.listeners.get(event);
    if (!callback) {
      return;
    }
    try {
      const result = callback(payload);
      if (result && typeof result.catch === 'function') {
        result.catch((err) => logger.error(`[AndroidTV] Listener "${event}" failed:`, err?.message || err));
      }
    } catch (err) {
      logger.error(`[AndroidTV] Listener "${event}" failed:`, err?.message || err);
    }
  }

  /**
   * Throw a user-facing error when no live session is available.
   */
  _assertConnected() {
    if (!this.remote || !this.isConnected) {
      throw new Error(`The Android TV at ${this.ip} is not connected. Make sure it is turned ON and paired.`);
    }
  }
}

/**
 * @param {number} ms Delay in milliseconds.
 * @returns {Promise<void>} Resolves after the delay.
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
