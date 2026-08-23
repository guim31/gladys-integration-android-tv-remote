/**
 * Standard app shortcuts registry for Android TV / Google TV.
 *
 * `uri` is what is sent as remoteAppLinkLaunchRequest: an https App Link or a
 * custom scheme the app registered. `package` is only used to recognize the
 * app the TV reports as foreground.
 */
export const SUPPORTED_APPS = [
  {
    id: 'youtube',
    name: 'YouTube',
    uri: 'https://www.youtube.com',
    package: 'com.google.android.youtube.tv',
  },
  {
    id: 'netflix',
    name: 'Netflix',
    uri: 'https://www.netflix.com/title',
    package: 'com.netflix.ninja',
  },
  {
    id: 'primevideo',
    name: 'Prime Video',
    uri: 'https://atv-ps.amazon.com',
    package: 'com.amazon.amazonvideo.livingroom',
  },
  {
    id: 'disneyplus',
    name: 'Disney+',
    uri: 'https://www.disneyplus.com',
    package: 'com.disney.disneyplus',
  },
  {
    id: 'spotify',
    name: 'Spotify',
    uri: 'spotify://',
    package: 'com.spotify.tv.android',
  },
  {
    id: 'plex',
    name: 'Plex',
    uri: 'plex://',
    package: 'com.plexapp.android',
  },
  {
    id: 'arte',
    name: 'Arte',
    uri: 'https://www.arte.tv',
    package: 'tv.arte.plus',
  },
  {
    id: 'molotov',
    name: 'Molotov TV',
    uri: 'https://www.molotov.tv',
    package: 'tv.molotov.app',
  },
  {
    id: 'mycanal',
    name: 'myCANAL',
    uri: 'https://www.canalplus.com',
    package: 'com.canal.android.canal',
  },
  {
    id: 'twitch',
    name: 'Twitch',
    uri: 'https://www.twitch.tv',
    package: 'tv.twitch.android.app',
  },
  {
    id: 'crunchyroll',
    name: 'Crunchyroll',
    uri: 'crunchyroll://',
    package: 'com.crunchyroll.crunchyroid',
  },
  {
    id: 'youtubemusic',
    name: 'YouTube Music',
    uri: 'https://music.youtube.com',
    package: 'com.google.android.youtube.tvmusic',
  },
  {
    id: 'appletv',
    name: 'Apple TV',
    uri: 'https://tv.apple.com',
    package: 'com.apple.atve.androidtv.appletv',
  },
];

/**
 * Derive the app id of a name typed by the user: "France TV" -> "francetv".
 *
 * A custom app whose slug matches a catalog id replaces the catalog entry on
 * purpose — that is how a user fixes a link that does not work on their TV.
 *
 * @param {string} name App name.
 * @returns {string} The slug, or an empty string when nothing remains.
 */
export function slugifyAppName(name) {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Build the app list actually offered to the user.
 *
 * Every TV has its own set of installed applications: the configuration hides
 * the catalog apps the user does not have, and declares the ones the catalog
 * misses.
 *
 * @param {Object} config Normalized configuration ({ hidden_apps, custom_apps }).
 * @returns {Array<Object>} Apps to offer, catalog order first, custom apps after.
 */
export function resolveApps(config = {}) {
  const hidden = new Set(config.hidden_apps || []);
  const customs = config.custom_apps || [];
  const customIds = new Set(customs.map((app) => app.id));

  return [
    // A custom app with the same id replaces the catalog entry: its link is
    // the one the user typed, never hide it.
    ...SUPPORTED_APPS.filter((app) => !customIds.has(app.id) && !hidden.has(app.id)),
    // The catalog package is kept on an overridden entry, so the foreground
    // app reported by the TV still selects it.
    ...customs.map((app) => ({
      package: SUPPORTED_APPS.find((supported) => supported.id === app.id)?.package || '',
      ...app,
    })),
  ];
}
