import AndroidRemotePkg from 'androidtv-remote';
import { logger } from '@gladysassistant/integration-sdk';

const { AndroidRemote, RemoteKeyCode, RemoteDirection } = AndroidRemotePkg;

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
    this.key = config.certificate_key;
    this.cert = config.certificate_cert;
    this.remote = null;
    this.isConnected = false;
    this.isPairing = false;
    this.generatedCertificates = null;
    this.listeners = new Map();
  }

  /**
   * Start pairing mode to prompt PIN code on TV screen.
   */
  async startPairing() {
    this.isPairing = true;
    logger.info(`[AndroidTV] Initiating pairing sequence with TV at ${this.ip}...`);

    return new Promise((resolve, reject) => {
      const options = {
        name: 'Gladys Assistant',
        pairing_port: 6467,
        remote_port: 6466,
      };

      try {
        this.remote = new AndroidRemote(this.ip, options);
      } catch (err) {
        this.isPairing = false;
        return reject(new Error(`Failed to create remote instance: ${err.message}`));
      }

      const timeout = setTimeout(() => {
        if (this.isPairing) {
          this.isPairing = false;
          reject(new Error('Pairing request timed out. Make sure the TV is turned ON and on the same network.'));
        }
      }, 25000);

      this.remote.on('secret', () => {
        clearTimeout(timeout);
        logger.info('[AndroidTV] PIN code displayed on TV screen. Ready to receive secret code.');
        resolve({
          status: 'secret_required',
          message: 'PIN code is displayed on TV screen. Submit code using action confirm PIN.',
        });
      });

      this.remote.on('error', (err) => {
        clearTimeout(timeout);
        this.isPairing = false;
        logger.error('[AndroidTV] Error during pairing setup:', err?.message || err);
        reject(new Error(err?.message || 'Error during TV pairing initialization.'));
      });

      this.remote.start().catch((err) => {
        clearTimeout(timeout);
        this.isPairing = false;
        reject(new Error(`Failed to start pairing protocol: ${err.message}`));
      });
    });
  }

  /**
   * Submit PIN code entered by user to finalize pairing.
   *
   * @param {string} pin
   */
  async submitPin(pin) {
    if (!this.remote) {
      throw new Error('No pairing session active. Call "Start Pairing" first.');
    }

    const cleanPin = String(pin).trim();
    if (!cleanPin) {
      throw new Error('PIN code is required.');
    }

    logger.info(`[AndroidTV] Submitting PIN code to TV at ${this.ip}...`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('PIN verification timed out. Please verify code and retry.'));
      }, 25000);

      this.remote.on('ready', () => {
        clearTimeout(timeout);
        this.isConnected = true;
        this.isPairing = false;

        let certificates = null;
        if (typeof this.remote.getCertificate === 'function') {
          certificates = this.remote.getCertificate();
        } else if (this.remote.cert) {
          certificates = this.remote.cert;
        }

        this.generatedCertificates = certificates;
        logger.info('[AndroidTV] Pairing successful! Certificate obtained.');

        resolve({
          status: 'success',
          certificates,
        });
      });

      this.remote.on('error', (err) => {
        clearTimeout(timeout);
        logger.error('[AndroidTV] PIN verification failed:', err?.message || err);
        reject(new Error(`PIN verification failed: ${err?.message || 'Invalid code or connection closed'}`));
      });

      try {
        this.remote.sendCode(cleanPin);
      } catch (err) {
        clearTimeout(timeout);
        reject(new Error(`Failed to send PIN code: ${err.message}`));
      }
    });
  }

  /**
   * Connect to TV using existing saved TLS certificates.
   */
  async connect() {
    if (!this.ip) {
      throw new Error('TV IP address is missing in configuration.');
    }

    const options = {
      name: 'Gladys Assistant',
      pairing_port: 6467,
      remote_port: 6466,
    };

    if (this.key && this.cert) {
      options.cert = {
        key: this.key,
        cert: this.cert,
      };
    }

    logger.info(`[AndroidTV] Connecting to ${this.ip}...`);

    return new Promise((resolve, reject) => {
      try {
        this.remote = new AndroidRemote(this.ip, options);
      } catch (err) {
        return reject(new Error(`Failed to create remote instance: ${err.message}`));
      }

      const timeout = setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error(`Connection to TV at ${this.ip} timed out.`));
        }
      }, 15000);

      this.remote.on('ready', () => {
        clearTimeout(timeout);
        this.isConnected = true;
        logger.info(`[AndroidTV] Connected to TV at ${this.ip}`);
        resolve(true);
      });

      this.remote.on('power', (state) => {
        if (this.listeners.has('power')) {
          this.listeners.get('power')(state);
        }
      });

      this.remote.on('volume', (vol) => {
        if (this.listeners.has('volume')) {
          this.listeners.get('volume')(vol);
        }
      });

      this.remote.on('current_app', (app) => {
        if (this.listeners.has('current_app')) {
          this.listeners.get('current_app')(app);
        }
      });

      this.remote.on('close', () => {
        this.isConnected = false;
        logger.warn(`[AndroidTV] Connection closed for ${this.ip}`);
      });

      this.remote.on('error', (err) => {
        logger.error(`[AndroidTV] Remote error on ${this.ip}:`, err?.message || err);
        if (!this.isConnected) {
          clearTimeout(timeout);
          reject(new Error(err?.message || 'Failed to connect to TV.'));
        }
      });

      this.remote.start().catch((err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to start connection: ${err.message}`));
      });
    });
  }

  /**
   * Register state listener callbacks.
   */
  on(event, callback) {
    this.listeners.set(event, callback);
  }

  /**
   * Send key press.
   *
   * @param {string|number} keyNameOrCode
   */
  async sendKey(keyNameOrCode) {
    if (!this.remote || !this.isConnected) {
      throw new Error('Android TV is not connected.');
    }

    const keyCode =
      typeof keyNameOrCode === 'number'
        ? keyNameOrCode
        : KEY_MAPPING[keyNameOrCode?.toLowerCase()] || RemoteKeyCode[keyNameOrCode];

    if (!keyCode) {
      throw new Error(`Unknown key code: ${keyNameOrCode}`);
    }

    logger.info(`[AndroidTV] Sending keycode: ${keyCode} (${keyNameOrCode})`);
    return this.remote.sendKey(keyCode, RemoteDirection.SHORT);
  }

  /**
   * Send application deep link or package name.
   *
   * @param {string} appUriOrPackage
   */
  async sendApp(appUriOrPackage) {
    if (!this.remote || !this.isConnected) {
      throw new Error('Android TV is not connected.');
    }

    logger.info(`[AndroidTV] Opening app: ${appUriOrPackage}`);
    if (typeof this.remote.sendApp === 'function') {
      return this.remote.sendApp(appUriOrPackage);
    }
    if (typeof this.remote.sendAppLink === 'function') {
      return this.remote.sendAppLink(appUriOrPackage);
    }
    throw new Error('Application launcher is not supported by current client library version.');
  }

  /**
   * Close connection.
   */
  disconnect() {
    if (this.remote) {
      try {
        if (typeof this.remote.stop === 'function') {
          this.remote.stop();
        } else if (typeof this.remote.close === 'function') {
          this.remote.close();
        }
      } catch (err) {
        logger.warn('[AndroidTV] Error during disconnect:', err.message);
      }
      this.remote = null;
    }
    this.isConnected = false;
  }
}
