import type { CloudSyncStatus, LastBackupStatus, LastSyncStatus, LicenseData, Settings } from '../../shared/types';

const SETTINGS_KEY = 'settings';
const LICENSE_KEY = 'license';
const LAST_SYNC_STATUS_KEY = 'bookmarknest:last-sync-status';
const LAST_BACKUP_STATUS_KEY = 'bookmarknest:last-backup-status';
const LOCAL_DATA_STATUS_KEY = 'bookmarknest:local-data-status';
const CLOUD_SYNC_STATUS_KEY = 'bookmarknest:cloud-sync-status';

export const defaultSettings: Settings = {
  theme: 'system',
  defaultExportFormat: 'json',
  language: 'en',
  autoSync: false,
  syncIntervalMinutes: 60,
  cloudSyncEnabled: false,
  cloudSyncIntervalMinutes: 360,
  autoOrganizeRules: [],
  mirrorRemovals: false
};

export const emptyLicenseData: LicenseData = {
  pro: false,
  licenseKey: '',
  instanceId: '',
  email: '',
  plan: 'unknown',
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
  const settings = { ...defaultSettings, ...(result[SETTINGS_KEY] as Partial<Settings> | undefined) };
  return {
    ...settings,
    // Older development builds allowed a 2-minute interval. Keep existing
    // users on the shortest supported production interval instead.
    syncIntervalMinutes: settings.syncIntervalMinutes < 30 ? 30 : settings.syncIntervalMinutes
  };
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

export async function getLastSyncStatus(): Promise<LastSyncStatus | null> {
  if (!hasChromeStorage()) {
    return null;
  }

  const result = await chrome.storage.local.get(LAST_SYNC_STATUS_KEY);
  return (result[LAST_SYNC_STATUS_KEY] as LastSyncStatus | undefined) ?? null;
}

export async function setLastSyncStatus(status: LastSyncStatus) {
  if (!hasChromeStorage()) {
    return;
  }

  await chrome.storage.local.set({ [LAST_SYNC_STATUS_KEY]: status });
}

export async function getLastBackupStatus(): Promise<LastBackupStatus | null> {
  if (!hasChromeStorage()) {
    return null;
  }

  const result = await chrome.storage.local.get(LAST_BACKUP_STATUS_KEY);
  return (result[LAST_BACKUP_STATUS_KEY] as LastBackupStatus | undefined) ?? null;
}

export async function setLastBackupStatus(status: LastBackupStatus) {
  if (!hasChromeStorage()) {
    return;
  }

  await chrome.storage.local.set({ [LAST_BACKUP_STATUS_KEY]: status });
}

export async function getCloudSyncStatus(): Promise<CloudSyncStatus | null> {
  if (!hasChromeStorage()) {
    return null;
  }

  const result = await chrome.storage.local.get(CLOUD_SYNC_STATUS_KEY);
  return (result[CLOUD_SYNC_STATUS_KEY] as CloudSyncStatus | undefined) ?? null;
}

export async function setCloudSyncStatus(status: CloudSyncStatus) {
  if (!hasChromeStorage()) {
    return;
  }

  await chrome.storage.local.set({ [CLOUD_SYNC_STATUS_KEY]: status });
}

export async function markLocalDataChanged(reason: 'backup-imported' | 'local-data-cleared' | 'library-updated') {
  if (!hasChromeStorage()) {
    return;
  }

  await chrome.storage.local.set({ [LOCAL_DATA_STATUS_KEY]: { at: Date.now(), reason } });
}

export async function getLocalDataStatus(): Promise<{ at: number; reason: string } | null> {
  if (!hasChromeStorage()) {
    return null;
  }

  const result = await chrome.storage.local.get(LOCAL_DATA_STATUS_KEY);
  return (result[LOCAL_DATA_STATUS_KEY] as { at: number; reason: string } | undefined) ?? null;
}

export function subscribeToLocalStateChanges(handlers: {
  onLicenseChange?: (license: LicenseData) => void;
  onLocalDataChange?: (status: { at: number; reason: string }) => void;
  onLastSyncChange?: (status: LastSyncStatus | null) => void;
  onLastBackupChange?: (status: LastBackupStatus | null) => void;
  onCloudSyncChange?: (status: CloudSyncStatus | null) => void;
}) {
  if (!hasChromeStorage() || !chrome.storage?.onChanged) {
    return () => undefined;
  }

  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName !== 'local') {
      return;
    }

    if (changes[LICENSE_KEY] && handlers.onLicenseChange) {
      handlers.onLicenseChange({ ...emptyLicenseData, ...((changes[LICENSE_KEY].newValue as Partial<LicenseData> | undefined) ?? {}) });
    }

    if (changes[LOCAL_DATA_STATUS_KEY] && handlers.onLocalDataChange) {
      const status = changes[LOCAL_DATA_STATUS_KEY].newValue as { at: number; reason: string } | undefined;
      if (status) {
        handlers.onLocalDataChange(status);
      }
    }

    if (changes[LAST_SYNC_STATUS_KEY] && handlers.onLastSyncChange) {
      handlers.onLastSyncChange((changes[LAST_SYNC_STATUS_KEY].newValue as LastSyncStatus | undefined) ?? null);
    }

    if (changes[LAST_BACKUP_STATUS_KEY] && handlers.onLastBackupChange) {
      handlers.onLastBackupChange((changes[LAST_BACKUP_STATUS_KEY].newValue as LastBackupStatus | undefined) ?? null);
    }

    if (changes[CLOUD_SYNC_STATUS_KEY] && handlers.onCloudSyncChange) {
      handlers.onCloudSyncChange((changes[CLOUD_SYNC_STATUS_KEY].newValue as CloudSyncStatus | undefined) ?? null);
    }
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
