import type { LicenseData, Settings } from '../../shared/types';

const SETTINGS_KEY = 'settings';
const LICENSE_KEY = 'license';

export const defaultSettings: Settings = {
  theme: 'system',
  defaultExportFormat: 'json',
  language: 'en',
  autoSync: false,
  syncIntervalMinutes: 60
};

export const emptyLicenseData: LicenseData = {
  pro: false,
  licenseKey: '',
  instanceId: '',
  email: '',
  activatedAt: null,
  expiresAt: null,
  lastValidatedAt: null,
  validationStatus: 'unknown'
};

function hasChromeStorage() {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

export async function getSettings(): Promise<Settings> {
  if (!hasChromeStorage()) {
    return defaultSettings;
  }

  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...defaultSettings, ...(result[SETTINGS_KEY] as Partial<Settings> | undefined) };
}

export async function saveSettings(settings: Partial<Settings>) {
  const current = await getSettings();
  await chrome.storage.local.set({ [SETTINGS_KEY]: { ...current, ...settings } });
}

export async function getLicenseData(): Promise<LicenseData> {
  if (!hasChromeStorage()) {
    return emptyLicenseData;
  }

  const result = await chrome.storage.local.get(LICENSE_KEY);
  return { ...emptyLicenseData, ...(result[LICENSE_KEY] as Partial<LicenseData> | undefined) };
}

export async function saveLicenseData(license: LicenseData) {
  await chrome.storage.local.set({ [LICENSE_KEY]: license });
}

export async function clearLicenseData() {
  await chrome.storage.local.set({ [LICENSE_KEY]: emptyLicenseData });
}
