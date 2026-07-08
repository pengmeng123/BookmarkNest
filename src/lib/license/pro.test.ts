import { describe, expect, it } from 'vitest';

import { emptyLicenseData } from '../storage/localStorage';
import { canUseCapability, isProActive, shouldValidateLicense } from './pro';

describe('license pro rules', () => {
  it('treats valid and offline Pro licenses as active', () => {
    expect(isProActive({ ...emptyLicenseData, pro: true, validationStatus: 'valid' })).toBe(true);
    expect(isProActive({ ...emptyLicenseData, pro: true, validationStatus: 'offline' })).toBe(true);
    expect(isProActive({ ...emptyLicenseData, pro: true, validationStatus: 'invalid' })).toBe(false);
  });

  it('gates advanced capabilities behind an active Pro license', () => {
    expect(canUseCapability({ ...emptyLicenseData, pro: false }, 'saved-views')).toBe(false);
    expect(canUseCapability({ ...emptyLicenseData, pro: true, validationStatus: 'valid' }, 'saved-views')).toBe(true);
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
