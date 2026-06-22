import { describe, expect, it } from 'vitest';

import { emptyLicenseData } from '../storage/localStorage';
import { getFreeLimitMessage, isProActive, shouldValidateLicense } from './pro';

describe('license pro rules', () => {
  it('treats valid and offline Pro licenses as active', () => {
    expect(isProActive({ ...emptyLicenseData, pro: true, validationStatus: 'valid' })).toBe(true);
    expect(isProActive({ ...emptyLicenseData, pro: true, validationStatus: 'offline' })).toBe(true);
    expect(isProActive({ ...emptyLicenseData, pro: true, validationStatus: 'invalid' })).toBe(false);
  });

  it('explains free bookmark limits without deleting data', () => {
    expect(getFreeLimitMessage(201)).toContain('older local bookmarks are kept');
    expect(getFreeLimitMessage(200)).toBeNull();
  });

  it('validates stale active licenses after seven days', () => {
    expect(
      shouldValidateLicense(
        {
          ...emptyLicenseData,
          pro: true,
          licenseKey: 'key',
          lastValidatedAt: '2026-06-01T00:00:00.000Z'
        },
        Date.parse('2026-06-10T00:00:00.000Z')
      )
    ).toBe(true);
  });
});
