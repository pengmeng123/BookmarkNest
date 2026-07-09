import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LocalBackup } from '../db/bookmarkRepository';
import type { CloudSyncStatus, LicenseData, Settings } from '../../shared/types';

const backup: LocalBackup = {
  schemaVersion: 3,
  exportedAt: 1710000000000,
  bookmarks: [],
  folders: [],
  tags: [],
  importSessions: [],
  savedViews: []
};

const license: LicenseData = {
  pro: true,
  licenseKey: 'license_test',
  instanceId: 'instance_1',
  email: 'user@example.com',
  plan: 'lifetime',
  activatedAt: null,
  expiresAt: null,
  lastValidatedAt: null,
  validationStatus: 'valid'
};

const settings: Settings = {
  theme: 'system',
  defaultExportFormat: 'json',
  language: 'en',
  autoSync: false,
  syncIntervalMinutes: 60,
  cloudSyncEnabled: true,
  cloudSyncIntervalMinutes: 360,
  mirrorRemovals: false
};

const mocks = vi.hoisted(() => ({
  exportLocalBackup: vi.fn(),
  getCloudSyncStatus: vi.fn(),
  getLicenseData: vi.fn(),
  getSettings: vi.fn(),
  setCloudSyncStatus: vi.fn(),
  setLastBackupStatus: vi.fn(),
  markLocalDataChanged: vi.fn(),
  uploadCloudSnapshot: vi.fn()
}));

vi.mock('../db/bookmarkRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../db/bookmarkRepository')>()),
  exportLocalBackup: mocks.exportLocalBackup
}));

vi.mock('../storage/localStorage', () => ({
  getCloudSyncStatus: mocks.getCloudSyncStatus,
  getLicenseData: mocks.getLicenseData,
  getSettings: mocks.getSettings,
  setCloudSyncStatus: mocks.setCloudSyncStatus,
  setLastBackupStatus: mocks.setLastBackupStatus,
  markLocalDataChanged: mocks.markLocalDataChanged
}));

vi.mock('./client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./client')>()),
  uploadCloudSnapshot: mocks.uploadCloudSnapshot
}));

describe('cloud sync service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exportLocalBackup.mockResolvedValue(backup);
    mocks.getLicenseData.mockResolvedValue(license);
    mocks.getSettings.mockResolvedValue(settings);
    mocks.getCloudSyncStatus.mockResolvedValue(null);
    mocks.setCloudSyncStatus.mockResolvedValue(undefined);
    mocks.setLastBackupStatus.mockResolvedValue(undefined);
    mocks.markLocalDataChanged.mockResolvedValue(undefined);
    mocks.uploadCloudSnapshot.mockResolvedValue({ snapshotId: 'snap_1', createdAt: 1710000000000 });
  });

  it('skips uploading when the current backup content is already protected', async () => {
    const { fingerprintLocalBackup } = await import('./client');
    const { runCloudBackup } = await import('./service');
    const contentHash = await fingerprintLocalBackup(backup, license.licenseKey);
    const previousStatus: CloudSyncStatus = {
      phase: 'protected',
      enabled: true,
      lastRunAt: 1710000000000,
      lastSuccessAt: 1710000000000,
      remoteSnapshotId: 'snap_existing',
      lastSnapshotHash: contentHash,
      bookmarkCount: 0,
      savedViewCount: 0
    };
    mocks.getCloudSyncStatus.mockResolvedValue(previousStatus);

    const response = await runCloudBackup({ baseUrl: 'https://api.example.com' });

    expect(response.ok).toBe(true);
    expect(response.data).toMatchObject({
      remoteSnapshotId: 'snap_existing',
      lastSnapshotHash: contentHash,
      lastUploadResult: 'unchanged'
    });
    expect(mocks.uploadCloudSnapshot).not.toHaveBeenCalled();
  });
});
