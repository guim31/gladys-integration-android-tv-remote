/**
 * Normalize and set default fallback values for Android TV Remote integration config.
 *
 * @param {Record<string, unknown>} rawConfig
 * @returns {Object} Normalized configuration object.
 */
export function normalizeConfig(rawConfig = {}) {
  let tvs;

  if (Array.isArray(rawConfig.tvs)) {
    tvs = rawConfig.tvs.map((tv, idx) => ({
      ip: (typeof tv?.ip === 'string' && tv.ip.trim()) || `192.168.1.${50 + idx}`,
      name: (typeof tv?.name === 'string' && tv.name.trim()) || `Android TV ${tv?.ip || idx + 1}`,
      certificate_key: (typeof tv?.certificate_key === 'string' && tv.certificate_key.trim()) || '',
      certificate_cert: (typeof tv?.certificate_cert === 'string' && tv.certificate_cert.trim()) || '',
    }));
  } else if (typeof rawConfig.tv_ip === 'string' && rawConfig.tv_ip.trim()) {
    tvs = [
      {
        ip: rawConfig.tv_ip.trim(),
        name: `Android TV (${rawConfig.tv_ip.trim()})`,
        certificate_key: (typeof rawConfig.certificate_key === 'string' && rawConfig.certificate_key.trim()) || '',
        certificate_cert: (typeof rawConfig.certificate_cert === 'string' && rawConfig.certificate_cert.trim()) || '',
      },
    ];
  } else {
    // Default fallback: 1 default TV
    tvs = [
      {
        ip: '192.168.1.50',
        name: 'Android TV (192.168.1.50)',
        certificate_key: '',
        certificate_cert: '',
      },
    ];
  }

  const enableAppShortcuts =
    typeof rawConfig.enable_app_shortcuts === 'boolean'
      ? rawConfig.enable_app_shortcuts
      : rawConfig.enable_app_shortcuts === 'true' ||
        rawConfig.enable_app_shortcuts === undefined ||
        rawConfig.enable_app_shortcuts === true;

  return {
    tvs,
    enable_app_shortcuts: Boolean(enableAppShortcuts),
  };
}
