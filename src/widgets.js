// -----------------------------------------------------------------------------
// Dashboard widgets (Gladys 5.1+), content builders — pure functions.
//
//   - remote : one TV as a remote: power state, volume, mute and foreground
//              app in a status list, then power / home / back / OK;
//   - media  : the foreground app and the playback keys;
//   - apps   : up to four application shortcuts, named in the widget settings
//              (the first visible apps of the launcher otherwise), the
//              foreground one ticked;
//   - volume : a live tile bound to the volume feature of the TV, the mute
//              state, and volume − / volume + / mute.
//
// A widget shows the TV picked in its settings (`tv`, a `source: "devices"`
// select whose value is the device external_id), else the first paired TV.
// The buttons are widget actions carrying the TV IP address in their params:
// onWidgetAction only accepts the commands listed in widgetCommand().
//
// Gladys renders at most 8 components, 2 of them texts (1 body) and 4 of them
// buttons, and drops a button whose action key another one already uses. A
// current choice is shown by its icon (`check-circle`), never by the
// `primary` style: in dark mode Gladys paints a primary button like the others.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { slugifyAppName } from './devices/apps.js';
import { findTvByExternalId } from './devices/index.js';

/** Widget keys, declared in the manifest `widgets` (forever: never rename). */
export const WIDGET = {
  REMOTE: 'remote',
  MEDIA: 'media',
  APPS: 'apps',
  VOLUME: 'volume',
};

/** The widget settings naming the buttons of the apps widget. */
export const APP_SETTINGS = ['app_1', 'app_2', 'app_3', 'app_4'];

/** Freshness of each content, in seconds (10–3600 for the core). */
export const WIDGET_TTL_SECONDS = {
  [WIDGET.REMOTE]: 30,
  [WIDGET.MEDIA]: 60,
  [WIDGET.APPS]: 60,
  [WIDGET.VOLUME]: 30,
  // Nothing to show: the next pairing will nudge nothing, so re-pull often.
  empty: 300,
};

const MAX_BUTTONS = 4;
// The icon of the active choice (foreground app, mute on).
const CURRENT_ICON = 'check-circle';

/**
 * The remote keys a widget button may send, by action key, with the key name
 * understood by AndroidTVClient.sendKey().
 */
const KEY_BUTTONS = {
  home: 'home',
  back: 'back',
  ok: 'select',
  play_pause: 'play_pause',
  stop: 'stop',
  previous: 'previous',
  next: 'next',
  vol_down: 'volume_down',
  vol_up: 'volume_up',
  mute: 'mute',
};

const TEXTS = {
  noTv: {
    en: 'No TV is paired yet. Run step 1 and step 2 in the configuration of the integration, then pick the TV here.',
    fr: "Aucune TV n'est appairée. Lancez les étapes 1 et 2 dans la configuration de l'intégration, puis choisissez la TV ici.",
  },
  unknownTv: {
    en: 'The TV picked in the settings of this widget is no longer paired. Pick another one, or leave the field empty.',
    fr: "La TV choisie dans les réglages de ce widget n'est plus appairée. Choisissez-en une autre, ou laissez le champ vide.",
  },
  noApp: {
    en: 'No application to show: every application of the launcher is hidden in the configuration.',
    fr: 'Aucune application à afficher : toutes les applications du lanceur sont masquées dans la configuration.',
  },
  power: { en: 'Power', fr: 'Alimentation' },
  on: { en: 'On', fr: 'Allumée' },
  off: { en: 'Off', fr: 'Éteinte' },
  unreachable: { en: 'Unreachable', fr: 'Injoignable' },
  volume: { en: 'Volume', fr: 'Volume' },
  mute: { en: 'Mute', fr: 'Sourdine' },
  yes: { en: 'Yes', fr: 'Oui' },
  no: { en: 'No', fr: 'Non' },
  app: { en: 'Application', fr: 'Application' },
  turnOn: { en: 'Turn on', fr: 'Allumer' },
  turnOff: { en: 'Turn off', fr: 'Éteindre' },
  home: { en: 'Home', fr: 'Accueil' },
  back: { en: 'Back', fr: 'Retour' },
  ok: { en: 'OK', fr: 'OK' },
  playPause: { en: 'Play / Pause', fr: 'Lecture / Pause' },
  stop: { en: 'Stop', fr: 'Stop' },
  previous: { en: 'Previous', fr: 'Précédent' },
  next: { en: 'Next', fr: 'Suivant' },
  volDown: { en: 'Vol −', fr: 'Vol −' },
  volUp: { en: 'Vol +', fr: 'Vol +' },
  unknownApps: {
    en: (unknown, known) => `Unknown: ${unknown}. Known: ${known}`,
    fr: (unknown, known) => `Inconnu : ${unknown}. Connus : ${known}`,
  },
  toast: {
    power: {
      on: { en: 'Turning the TV on…', fr: 'Allumage de la TV…' },
      off: { en: 'Turning the TV off…', fr: 'Extinction de la TV…' },
    },
    key: { en: 'Key sent to the TV.', fr: 'Touche envoyée à la TV.' },
    app: {
      en: (name) => `Opening ${name}…`,
      fr: (name) => `Ouverture de ${name}…`,
    },
  },
};

/**
 * The language of a widget: Gladys sends the user's, the texts exist in two.
 *
 * @param {unknown} language The user's language (ISO 639-1).
 * @returns {string} `fr` or `en`.
 */
export function widgetLanguage(language) {
  return language === 'fr' ? 'fr' : 'en';
}

/**
 * A text cut to a bound (the core would cut it, and say so in its logs).
 *
 * @param {unknown} text The text.
 * @param {number} max The bound, in characters.
 * @returns {string} The text, with an ellipsis when cut.
 */
export function fit(text, max) {
  const value = String(text ?? '').trim();
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Resolve the TV a widget shows: the device picked in its `tv` setting, else
 * the first paired TV.
 *
 * @param {Object} settings The widget settings ({ tv }).
 * @param {Object} config Normalized configuration ({ tvs }).
 * @returns {{ tv: Object|undefined, reason: string|null }} The TV, or why there
 * is none (`none`: nothing paired, `unknown`: the picked device matches no
 * paired TV).
 */
export function resolveWidgetTv(settings, config) {
  const paired = (config?.tvs || []).filter((tv) => tv.certificate_key && tv.certificate_cert);
  const picked = typeof settings?.tv === 'string' ? settings.tv.trim() : '';
  if (picked) {
    const tv = findTvByExternalId(picked, paired);
    return tv ? { tv, reason: null } : { tv: undefined, reason: 'unknown' };
  }
  return paired.length > 0 ? { tv: paired[0], reason: null } : { tv: undefined, reason: 'none' };
}

/**
 * A widget with nothing to show but a sentence — never an error.
 *
 * @param {string} reason `none` or `unknown`, see resolveWidgetTv().
 * @returns {Object} The widget content.
 */
export function emptyContent(reason) {
  const text = reason === 'unknown' ? TEXTS.unknownTv : TEXTS.noTv;
  return {
    version: 1,
    ttl_seconds: WIDGET_TTL_SECONDS.empty,
    components: [{ type: 'text', variant: 'body', text }],
  };
}

/**
 * The app the TV reports in the foreground, when it is a known one.
 *
 * @param {Object} view The TV, see remoteContent().
 * @returns {Object|undefined} The app ({ id, name, package }) when known.
 */
export function foregroundApp(view) {
  const appPackage = view.state?.appPackage;
  if (!appPackage) {
    return undefined;
  }
  return (view.apps || []).find((app) => app.package && app.package === appPackage);
}

function heading(name) {
  return { type: 'text', variant: 'heading', text: fit(name, 40) };
}

function actionButton(label, key, params, icon) {
  return { type: 'button', label, icon, action: { key, params } };
}

/**
 * The power row of a status list: on, off, or unreachable with its color.
 *
 * @param {Object} state The TV state ({ connected, powered }).
 * @returns {Object} The status item.
 */
export function powerStatus(state) {
  if (!state?.connected) {
    return { label: TEXTS.power, value: TEXTS.unreachable, color: WIDGET_COLORS.WARNING };
  }
  // A TV in standby says so as soon as the session opens; one that reports
  // nothing is awake (it answered the connection), as the client assumes.
  if (state.powered === false) {
    return { label: TEXTS.power, value: TEXTS.off, color: WIDGET_COLORS.NEUTRAL };
  }
  return { label: TEXTS.power, value: TEXTS.on, color: WIDGET_COLORS.SUCCESS };
}

function isOn(state) {
  return Boolean(state?.connected) && state.powered !== false;
}

function muteStatus(state) {
  return { label: TEXTS.mute, value: state.muted ? TEXTS.yes : TEXTS.no };
}

function appStatus(view) {
  const app = foregroundApp(view);
  return app ? { label: TEXTS.app, value: fit(app.name, 40) } : null;
}

/**
 * The "remote" widget.
 *
 * @param {Object} view What the integration knows of the TV.
 * @param {string} view.ip Its IP address (the action param of the buttons).
 * @param {string} view.name Its display name.
 * @param {string} view.deviceExternalId The external_id of its Gladys device.
 * @param {Object} view.state Its last known state, see AndroidTVClientManager.getTvState().
 * @param {Array<Object>} view.apps The apps offered by the launcher (resolveApps()).
 * @param {boolean} [view.deviceAdded] Whether the TV was added as a Gladys device.
 * @returns {Object} The widget content.
 */
export function remoteContent(view) {
  const { state } = view;
  const items = [powerStatus(state)];
  if (typeof state.volume === 'number') {
    items.push({ label: TEXTS.volume, value: `${state.volume} %` });
  }
  if (typeof state.muted === 'boolean') {
    items.push(muteStatus(state));
  }
  const app = appStatus(view);
  if (app) {
    items.push(app);
  }
  const params = { ip: view.ip };
  return {
    version: 1,
    ttl_seconds: WIDGET_TTL_SECONDS[WIDGET.REMOTE],
    components: [
      heading(view.name),
      { type: 'status', items },
      actionButton(isOn(state) ? TEXTS.turnOff : TEXTS.turnOn, 'power', params, 'power'),
      actionButton(TEXTS.home, 'home', params, 'home'),
      actionButton(TEXTS.back, 'back', params, 'corner-up-left'),
      actionButton(TEXTS.ok, 'ok', params, 'check'),
    ],
  };
}

/**
 * The "media" widget: the foreground app and the playback keys. An
 * unreachable TV says so, as the keys would fail.
 *
 * @param {Object} view The TV, see remoteContent().
 * @returns {Object} The widget content.
 */
export function mediaContent(view) {
  const components = [heading(view.name)];
  const items = [];
  if (!view.state.connected) {
    items.push(powerStatus(view.state));
  }
  const app = appStatus(view);
  if (app) {
    items.push(app);
  }
  if (items.length > 0) {
    components.push({ type: 'status', items });
  }
  const params = { ip: view.ip };
  components.push(
    actionButton(TEXTS.playPause, 'play_pause', params, 'play'),
    actionButton(TEXTS.stop, 'stop', params, 'square'),
    actionButton(TEXTS.previous, 'previous', params, 'skip-back'),
    actionButton(TEXTS.next, 'next', params, 'skip-forward'),
  );
  return { version: 1, ttl_seconds: WIDGET_TTL_SECONDS[WIDGET.MEDIA], components };
}

/**
 * The buttons of the "apps" widget: the names typed in its settings, each
 * matched against the launcher apps (case and accents do not matter, the id
 * works too); without any name, the first visible apps of the launcher.
 *
 * @param {Object} view The TV, see remoteContent().
 * @param {Object} settings The widget settings (app_1 … app_4).
 * @returns {{ apps: Array<Object>, unknown: Array<string> }} The apps to show,
 * in setting order, and the names matched to nothing.
 */
export function appButtons(view, settings) {
  const apps = view.apps || [];
  const names = APP_SETTINGS.map((key) => settings?.[key])
    .filter((name) => typeof name === 'string' && name.trim())
    .map((name) => name.trim());
  if (names.length === 0) {
    return { apps: apps.slice(0, MAX_BUTTONS), unknown: [] };
  }
  const found = [];
  const unknown = [];
  for (const name of names) {
    const key = slugifyAppName(name);
    const app = apps.find((candidate) => candidate.id === key || slugifyAppName(candidate.name) === key);
    if (!app) {
      unknown.push(name);
    } else if (!found.includes(app)) {
      found.push(app);
    }
  }
  return { apps: found.slice(0, MAX_BUTTONS), unknown };
}

/**
 * The "apps" widget.
 *
 * @param {Object} view The TV, see remoteContent().
 * @param {Object} settings The widget settings (app_1 … app_4).
 * @param {string} language `fr` or `en`.
 * @returns {Object} The widget content.
 */
export function appsContent(view, settings, language) {
  const lang = widgetLanguage(language);
  const components = [heading(view.name)];
  const { apps, unknown } = appButtons(view, settings);
  if (unknown.length > 0) {
    // With the names that work, so a typo is fixed without leaving the page.
    const known = (view.apps || []).map((app) => app.name).join(', ');
    components.push({
      type: 'text',
      variant: 'caption',
      text: fit(TEXTS.unknownApps[lang](unknown.join(', '), known), 80),
    });
  } else if (apps.length === 0) {
    components.push({ type: 'text', variant: 'body', text: TEXTS.noApp });
  }
  const current = foregroundApp(view);
  apps.forEach((app, index) => {
    // Numbered keys: Gladys drops a button whose key another one uses.
    components.push(
      actionButton(
        fit(app.name, 24),
        APP_SETTINGS[index],
        { ip: view.ip, app: app.id },
        current && current.id === app.id ? CURRENT_ICON : 'external-link',
      ),
    );
  });
  return { version: 1, ttl_seconds: WIDGET_TTL_SECONDS[WIDGET.APPS], components };
}

/**
 * The "volume" widget: a tile bound to the volume feature of the TV (live,
 * it follows the published states), the mute state, and the volume keys.
 *
 * A TV paired but not added as a device has no feature to bind: the tile
 * then shows the last level known, refreshed with the content.
 *
 * @param {Object} view The TV, see remoteContent().
 * @returns {Object} The widget content.
 */
export function volumeContent(view) {
  const { state } = view;
  const components = [heading(view.name)];
  if (view.deviceAdded === false) {
    components.push({
      type: 'value',
      label: TEXTS.volume,
      icon: 'volume-2',
      value: typeof state.volume === 'number' ? state.volume : '—',
      ...(typeof state.volume === 'number' ? { unit: '%' } : {}),
    });
  } else {
    components.push({
      type: 'value',
      label: TEXTS.volume,
      icon: 'volume-2',
      device_feature: `${view.deviceExternalId}:volume`,
    });
  }
  const items = [];
  if (!state.connected) {
    items.push(powerStatus(state));
  }
  if (typeof state.muted === 'boolean') {
    items.push(muteStatus(state));
  }
  if (items.length > 0) {
    components.push({ type: 'status', items });
  }
  const params = { ip: view.ip };
  components.push(
    actionButton(TEXTS.volDown, 'vol_down', params, 'volume-1'),
    actionButton(TEXTS.volUp, 'vol_up', params, 'volume-2'),
    actionButton(TEXTS.mute, 'mute', params, state.muted === true ? CURRENT_ICON : 'volume-x'),
  );
  return { version: 1, ttl_seconds: WIDGET_TTL_SECONDS[WIDGET.VOLUME], components };
}

/**
 * The content of a widget, from what the integration knows of the TV.
 *
 * @param {string} key The widget key.
 * @param {Object} view The TV, see remoteContent().
 * @param {Object} settings The widget settings.
 * @param {string} language The user's language.
 * @returns {Object} The widget content.
 */
export function widgetContent(key, view, settings = {}, language = 'en') {
  if (key === WIDGET.REMOTE) {
    return remoteContent(view);
  }
  if (key === WIDGET.MEDIA) {
    return mediaContent(view);
  }
  if (key === WIDGET.APPS) {
    return appsContent(view, settings, language);
  }
  if (key === WIDGET.VOLUME) {
    return volumeContent(view);
  }
  throw new Error(`Unknown widget: ${key}`);
}

/**
 * What a widget button stands for — and only what a widget button may do.
 *
 * The params come back exactly as the content declared them (never user
 * input), but the handler still trusts nothing: the action key must be one of
 * the buttons above, the IP a string, the app an id.
 *
 * @param {string} actionKey The key of the button.
 * @param {Object} params Its params ({ ip, app? }).
 * @returns {{ kind: 'power'|'key'|'app', ip: string, key?: string, app?: string }|null}
 * The command, null for an unknown button.
 */
export function widgetCommand(actionKey, params = {}) {
  const ip = typeof params?.ip === 'string' ? params.ip.trim() : '';
  if (!ip) {
    return null;
  }
  if (actionKey === 'power') {
    return { kind: 'power', ip };
  }
  if (KEY_BUTTONS[actionKey]) {
    return { kind: 'key', ip, key: KEY_BUTTONS[actionKey] };
  }
  if (APP_SETTINGS.includes(actionKey) && typeof params.app === 'string' && params.app.trim()) {
    return { kind: 'app', ip, app: params.app.trim() };
  }
  return null;
}

/**
 * The toast shown once a widget button did its job.
 *
 * @param {Object} command The command, see widgetCommand().
 * @param {Object} [details] `turnOn` for a power command, `appName` for an app.
 * @returns {Object} The message, in both languages (≤ 200 characters).
 */
export function widgetToast(command, { turnOn = true, appName = '' } = {}) {
  if (command.kind === 'power') {
    return turnOn ? TEXTS.toast.power.on : TEXTS.toast.power.off;
  }
  if (command.kind === 'app') {
    const name = fit(appName || command.app, 40);
    return { en: TEXTS.toast.app.en(name), fr: TEXTS.toast.app.fr(name) };
  }
  return TEXTS.toast.key;
}
