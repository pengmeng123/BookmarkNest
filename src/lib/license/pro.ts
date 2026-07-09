import type { LicenseData } from '../../shared/types';

export type ProCapability =
  | 'saved-views'
  | 'bookmark-notes'
  | 'markdown-export'
  | 'csv-export'
  | 'bulk-actions'
  | 'auto-sync'
  | 'mirror-removals'
  | 'cloud-sync';

export function isProActive(license: LicenseData) {
  return license.pro && (license.validationStatus === 'valid' || license.validationStatus === 'offline');
}

export function canUseCapability(license: LicenseData, _capability: ProCapability) {
  void _capability;
  return isProActive(license);
}

export function shouldValidateLicense(license: LicenseData, now = Date.now()) {
  if (!license.pro || !license.licenseKey) {
    return false;
  }

  if (!license.lastValidatedAt) {
    return true;
  }

  return now - Date.parse(license.lastValidatedAt) > 7 * 24 * 60 * 60 * 1000;
}
