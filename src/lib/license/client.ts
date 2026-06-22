import type { LicenseData } from '../../shared/types';

export interface LicenseClientConfig {
  baseUrl?: string;
}

export interface LicenseResponse {
  pro: boolean;
  licenseKey: string;
  instanceId: string;
  email: string;
  expiresAt: string | null;
}

export type LicenseErrorCode = 'missing-config' | 'invalid-key' | 'device-limit' | 'network-error' | 'server-error';

export class LicenseClientError extends Error {
  constructor(
    message: string,
    public code: LicenseErrorCode
  ) {
    super(message);
  }
}

const DEFAULT_BASE_URL = import.meta.env.VITE_LICENSE_WORKER_URL as string | undefined;

function getBaseUrl(config: LicenseClientConfig = {}) {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  if (!baseUrl) {
    throw new LicenseClientError('License service is not configured.', 'missing-config');
  }
  return baseUrl.replace(/\/$/, '');
}

async function requestLicense(path: string, body: unknown, config?: LicenseClientConfig): Promise<LicenseResponse> {
  const baseUrl = getBaseUrl(config);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch {
    throw new LicenseClientError('Unable to reach license service.', 'network-error');
  }

  if (!response.ok) {
    if (response.status === 409) {
      throw new LicenseClientError('Device limit reached.', 'device-limit');
    }
    if (response.status === 400 || response.status === 404) {
      throw new LicenseClientError('Invalid license key.', 'invalid-key');
    }
    throw new LicenseClientError('License service error.', 'server-error');
  }

  return response.json();
}

function toLicenseData(response: LicenseResponse): LicenseData {
  const now = new Date().toISOString();
  return {
    pro: response.pro,
    licenseKey: response.licenseKey,
    instanceId: response.instanceId,
    email: response.email,
    activatedAt: now,
    expiresAt: response.expiresAt,
    lastValidatedAt: now,
    validationStatus: response.pro ? 'valid' : 'invalid'
  };
}

export async function activateLicense(licenseKey: string, instanceId: string, config?: LicenseClientConfig) {
  return toLicenseData(await requestLicense('/license/activate', { licenseKey, instanceId }, config));
}

export async function validateLicense(license: LicenseData, config?: LicenseClientConfig) {
  return toLicenseData(
    await requestLicense(
      '/license/validate',
      {
        licenseKey: license.licenseKey,
        instanceId: license.instanceId
      },
      config
    )
  );
}

export async function deactivateLicense(license: LicenseData, config?: LicenseClientConfig) {
  await requestLicense(
    '/license/deactivate',
    {
      licenseKey: license.licenseKey,
      instanceId: license.instanceId
    },
    config
  );
}
