import { emptyLicenseData, getLicenseData, saveLicenseData, clearLicenseData } from '../storage/localStorage';
import { activateLicense, deactivateLicense, validateLicense, LicenseClientError } from './client';
import { shouldValidateLicense } from './pro';

function getInstanceId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `instance_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export async function activateAndStoreLicense(licenseKey: string) {
  const current = await getLicenseData();
  const instanceId = current.instanceId || getInstanceId();
  const license = await activateLicense(licenseKey, instanceId);
  await saveLicenseData(license);
  return license;
}

export async function validateStoredLicenseIfNeeded() {
  const current = await getLicenseData();
  if (!shouldValidateLicense(current)) {
    return current;
  }

  try {
    const license = await validateLicense(current);
    await saveLicenseData(license);
    return license;
  } catch (error) {
    if (error instanceof LicenseClientError && error.code === 'network-error') {
      const offline = { ...current, validationStatus: 'offline' as const };
      await saveLicenseData(offline);
      return offline;
    }

    const invalid = { ...current, pro: false, validationStatus: 'invalid' as const };
    await saveLicenseData(invalid);
    return invalid;
  }
}

export async function deactivateStoredLicense() {
  const current = await getLicenseData();
  if (current.licenseKey) {
    await deactivateLicense(current);
  }
  await clearLicenseData();
  return emptyLicenseData;
}
