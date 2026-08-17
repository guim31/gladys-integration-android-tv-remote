/**
 * Normalize the Android TV Remote integration configuration.
 *
 * `tvs` is the list of TVs already paired. It is written by the integration
 * itself through `gladys.setConfig()` once a PIN exchange succeeded, and holds
 * the TLS certificates.
 *
 * Everything the user types to pair a TV (IP address, name, PIN code) lives in
 * the fields of the pairing actions, not here: an action receives its field
 * values with the click, so what the user sees is what the handler gets — no
 * save in between, and no chance of running on a stale value.
 *
 * @param {Record<string, unknown>} rawConfig Raw configuration from Gladys.
 * @returns {Object} Normalized configuration object.
 */
export function normalizeConfig(rawConfig = {}) {
  const source = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};

  const tvs = [];

  if (Array.isArray(source.tvs)) {
    source.tvs.forEach((tv) => {
      const ip = readString(tv?.ip);
      if (!ip || tvs.some((existing) => existing.ip === ip)) {
        return;
      }
      tvs.push({
        ip,
        name: readString(tv?.name) || `Android TV (${ip})`,
        mac: normalizeMac(tv?.mac),
        certificate_key: readString(tv?.certificate_key),
        certificate_cert: readString(tv?.certificate_cert),
      });
    });
  }

  return {
    tvs,
    enable_app_shortcuts: readBoolean(source.enable_app_shortcuts, true),
  };
}

/**
 * @param {unknown} value Value to read.
 * @returns {string} The trimmed string, or an empty string.
 */
function readString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Normalize a MAC address to the canonical aa:bb:cc:dd:ee:ff form.
 *
 * TVs display their MAC with colons, dashes or nothing depending on the
 * brand; all three forms are accepted. Anything else is not a MAC.
 *
 * @param {unknown} value MAC address as typed by the user.
 * @returns {string} The normalized MAC address, or an empty string.
 */
export function normalizeMac(value) {
  const raw = readString(value).replace(/[:\-\s]/g, '');
  if (!/^[0-9a-fA-F]{12}$/.test(raw)) {
    return '';
  }
  return raw.toLowerCase().match(/.{2}/g).join(':');
}

/**
 * @param {unknown} value Value to read (booleans and their string form).
 * @param {boolean} defaultValue Value used when nothing is configured.
 * @returns {boolean} The resolved boolean.
 */
function readBoolean(value, defaultValue) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return defaultValue;
}
