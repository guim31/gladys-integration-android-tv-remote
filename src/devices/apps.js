/**
 * Standard app shortcuts registry for Android TV / Google TV.
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
];
