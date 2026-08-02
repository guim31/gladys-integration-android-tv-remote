/**
 * Normalize the Android TV Remote integration configuration.
 *
 * Two sources of truth coexist:
 *  - `tvs`: the TVs already paired. This list is written by the integration
 *    itself through `gladys.setConfig()` once a PIN exchange succeeded, and
 *    holds the TLS certificates.
 *  - `tv_name` / `tv_ip` / `pairing_pin`: the form fields the user fills in to
 *    pair a NEW TV.
 *
 * No fallback IP address is invented here: an empty configuration yields an
 * empty TV list, so the integration never tries to reach a random LAN host.
 *
 * @param {Record<string, unknown>} rawConfig Raw configuration from Gladys.
 * @returns {Object} Normalized configuration object.
 */
export function normalizeConfig(rawConfig = {}) {
  const source = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};

  const tvName = readString(source.tv_name);
  const tvIp = readString(source.tv_ip);
  const pairingPin = readString(source.pairing_pin);

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
        certificate_key: readString(tv?.certificate_key),
        certificate_cert: readString(tv?.certificate_cert),
      });
    });
  }

  if (tvIp) {
    const existing = tvs.find((tv) => tv.ip === tvIp);
    if (existing) {
      // The form is also how an already paired TV gets renamed.
      if (tvName) {
        existing.name = tvName;
      }
    } else {
      // The TV being configured belongs to the list right away, so a client
      // exists for it before the pairing sequence starts.
      tvs.push({
        ip: tvIp,
        name: tvName || `Android TV (${tvIp})`,
        certificate_key: '',
        certificate_cert: '',
      });
    }
  }

  return {
    tv_name: tvName,
    tv_ip: tvIp,
    pairing_pin: pairingPin,
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
