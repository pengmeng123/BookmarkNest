import { afterEach, describe, expect, it, vi } from 'vitest';

import { emptyLicenseData } from '../storage/localStorage';
import { activateLicense, deactivateLicense, LicenseClientError, validateLicense } from './client';

describe('license client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps activation responses to license data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            pro: true,
            licenseKey: 'key',
            instanceId: 'instance',
            email: 'user@example.com',
            expiresAt: null
          })
      })
    );

    const license = await activateLicense('key', 'instance', { baseUrl: 'https://worker.example.com' });

    expect(license.pro).toBe(true);
    expect(license.validationStatus).toBe('valid');
  });

  it('maps device limit errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 409 }));

    await expect(activateLicense('key', 'instance', { baseUrl: 'https://worker.example.com' })).rejects.toMatchObject({
      code: 'device-limit'
    });
  });

  it('maps network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(validateLicense({ ...emptyLicenseData, licenseKey: 'key', instanceId: 'instance' }, { baseUrl: 'https://worker.example.com' })).rejects.toBeInstanceOf(
      LicenseClientError
    );
  });

  it('calls deactivate endpoint', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ pro: false, licenseKey: 'key', instanceId: 'instance', email: '', expiresAt: null })
    });
    vi.stubGlobal('fetch', fetch);

    await deactivateLicense({ ...emptyLicenseData, licenseKey: 'key', instanceId: 'instance' }, { baseUrl: 'https://worker.example.com' });

    expect(fetch).toHaveBeenCalledWith('https://worker.example.com/license/deactivate', expect.any(Object));
  });
});
