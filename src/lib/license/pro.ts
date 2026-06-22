import { FREE_BOOKMARK_LIMIT } from '../../shared/constants';
import type { LicenseData } from '../../shared/types';

export type ProCapability = 'unlimited-bookmarks' | 'markdown-export' | 'csv-export' | 'bulk-actions' | 'advanced-filters';

export function isProActive(license: LicenseData) {
  return license.pro && (license.validationStatus === 'valid' || license.validationStatus === 'offline');
}

export function canUseCapability(license: LicenseData, capability: ProCapability) {
  if (capability === 'unlimited-bookmarks') {
    return isProActive(license);
  }

  return isProActive(license);
}

export function getFreeLimitMessage(totalUndeleted: number) {
  if (totalUndeleted <= FREE_BOOKMARK_LIMIT) {
    return null;
  }

  return `Free users can manage the recent ${FREE_BOOKMARK_LIMIT} bookmarks. Your older local bookmarks are kept and unlock after Pro activation.`;
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
