/**
 * Normalize and set default fallback values for Android TV Remote integration config.
 *
 * @param {Record<string, unknown>} rawConfig
 * @returns {Object} Normalized configuration object.
 */
export function normalizeConfig(rawConfig = {}) {
  const tvIp = (typeof rawConfig.tv_ip === 'string' && rawConfig.tv_ip.trim()) || '192.168.1.50';
  const pairingPin = (typeof rawConfig.pairing_pin === 'string' && rawConfig.pairing_pin.trim()) || '';
  const certificateKey = (typeof rawConfig.certificate_key === 'string' && rawConfig.certificate_key.trim()) || '';
  const certificateCert = (typeof rawConfig.certificate_cert === 'string' && rawConfig.certificate_cert.trim()) || '';

  const enableAppShortcuts =
    typeof rawConfig.enable_app_shortcuts === 'boolean'
      ? rawConfig.enable_app_shortcuts
      : rawConfig.enable_app_shortcuts === 'true' ||
        rawConfig.enable_app_shortcuts === undefined ||
        rawConfig.enable_app_shortcuts === true;

  return {
    tv_ip: tvIp,
    pairing_pin: pairingPin,
    certificate_key: certificateKey,
    certificate_cert: certificateCert,
    enable_app_shortcuts: Boolean(enableAppShortcuts),
  };
}
