import { canUseCapability } from '../license/pro';
import { exportLocalBackup, importLocalBackup } from '../db/bookmarkRepository';
import {
  decryptCloudSnapshot,
  getCloudSnapshotById,
  encryptLocalBackup,
  fingerprintLocalBackup,
  getLatestCloudSnapshot,
  uploadCloudSnapshot,
  type CloudSyncClientConfig
} from './client';
import {
  getCloudSyncStatus,
  getLicenseData,
  getSettings,
  markLocalDataChanged,
  setCloudSyncStatus,
  setLastBackupStatus
} from '../storage/localStorage';
import type { CloudSyncStatus, LastBackupStatus, MessageResponse } from '../../shared/types';

const MIN_CLOUD_BACKUP_WRITE_INTERVAL_MS = 60_000;

function getDefaultDeviceName() {
  const userAgentData = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = userAgentData.userAgentData?.platform || navigator.platform || 'This device';
  return `Chrome on ${platform}`;
}

function backupFilename(timestamp: number) {
  const compactTimestamp = new Date(timestamp).toISOString().slice(0, 16).replaceAll('-', '').replaceAll(':', '').replace('T', '-');
  return `bookmarknest-cloud-${compactTimestamp}.json`;
}

function nextRunAt(intervalMinutes: number) {
  return Date.now() + intervalMinutes * 60 * 1000;
}

function getBackupBookmarkCounts(backup: Awaited<ReturnType<typeof exportLocalBackup>>) {
  const visibleBookmarkCount = backup.bookmarks.filter((bookmark) => !bookmark.deleted && !bookmark.archived).length;
  const archivedBookmarkCount = backup.bookmarks.filter((bookmark) => !bookmark.deleted && bookmark.archived).length;
  const deletedBookmarkCount = backup.bookmarks.filter((bookmark) => bookmark.deleted).length;
  return {
    bookmarkCount: backup.bookmarks.length,
    visibleBookmarkCount,
    archivedBookmarkCount,
    deletedBookmarkCount,
    retainedBookmarkCount: archivedBookmarkCount + deletedBookmarkCount
  };
}

async function setAttention(error: unknown, enabled: boolean): Promise<CloudSyncStatus> {
  const status: CloudSyncStatus = {
    phase: 'attention',
    enabled,
    lastRunAt: Date.now(),
    lastError: error instanceof Error ? error.message : typeof error === 'string' ? error : 'Cloud Sync failed.'
  };
  await setCloudSyncStatus(status);
  return status;
}

export async function runCloudBackup(config?: CloudSyncClientConfig): Promise<MessageResponse<CloudSyncStatus>> {
  const [license, settings, previousStatus] = await Promise.all([getLicenseData(), getSettings(), getCloudSyncStatus()]);
  const enabled = settings.cloudSyncEnabled;

  if (!canUseCapability(license, 'cloud-sync')) {
    const status = await setAttention('Cloud Sync requires Pro.', enabled);
    return { ok: false, error: status.lastError };
  }

  if (!enabled) {
    const status: CloudSyncStatus = { phase: 'idle', enabled: false };
    await setCloudSyncStatus(status);
    return { ok: false, error: 'Cloud Sync is turned off.' };
  }

  await setCloudSyncStatus({ phase: 'syncing', enabled: true, lastRunAt: Date.now() });

  try {
    const backup = await exportLocalBackup();
    const backupCounts = getBackupBookmarkCounts(backup);
    const contentHash = await fingerprintLocalBackup(backup, license.licenseKey);
    const now = Date.now();
    const lastSuccessAt = previousStatus?.lastSuccessAt ?? 0;

    if (previousStatus?.remoteSnapshotId && previousStatus.lastSnapshotHash === contentHash) {
      const status: CloudSyncStatus = {
        phase: 'protected',
        enabled: true,
        lastRunAt: now,
        lastSuccessAt: previousStatus.lastSuccessAt,
        remoteSnapshotId: previousStatus.remoteSnapshotId,
        lastSnapshotHash: contentHash,
        lastUploadResult: 'unchanged',
        ...backupCounts,
        savedViewCount: backup.savedViews.length,
        nextRunAt: nextRunAt(settings.cloudSyncIntervalMinutes)
      };
      await setCloudSyncStatus(status);
      return { ok: true, data: status };
    }

    if (lastSuccessAt > 0 && now - lastSuccessAt < MIN_CLOUD_BACKUP_WRITE_INTERVAL_MS) {
      const error = 'Cloud Sync was just updated. Try again in a minute.';
      const status: CloudSyncStatus = {
        ...previousStatus,
        phase: 'attention',
        enabled: true,
        lastRunAt: now,
        lastSuccessAt: previousStatus?.lastSuccessAt,
        lastError: error,
        remoteSnapshotId: previousStatus?.remoteSnapshotId,
        lastSnapshotHash: previousStatus?.lastSnapshotHash,
        lastUploadResult: 'rate-limited',
        bookmarkCount: previousStatus?.bookmarkCount,
        visibleBookmarkCount: previousStatus?.visibleBookmarkCount,
        archivedBookmarkCount: previousStatus?.archivedBookmarkCount,
        deletedBookmarkCount: previousStatus?.deletedBookmarkCount,
        retainedBookmarkCount: previousStatus?.retainedBookmarkCount,
        savedViewCount: previousStatus?.savedViewCount,
        nextRunAt: nextRunAt(settings.cloudSyncIntervalMinutes)
      };
      await setCloudSyncStatus(status);
      return { ok: false, error, data: status };
    }

    const snapshot = await encryptLocalBackup(backup, license.licenseKey, contentHash);
    const deviceName = settings.cloudSyncDeviceName?.trim() || getDefaultDeviceName();
    const uploaded = await uploadCloudSnapshot(license, snapshot, deviceName, config);
    const lastBackup: LastBackupStatus = {
      at: backup.exportedAt,
      bookmarkCount: backupCounts.bookmarkCount,
      savedViewCount: backup.savedViews.length,
      filename: backupFilename(backup.exportedAt)
    };
    await setLastBackupStatus(lastBackup);

    const status: CloudSyncStatus = {
      phase: 'protected',
      enabled: true,
      lastRunAt: Date.now(),
      lastSuccessAt: Date.now(),
      remoteSnapshotId: uploaded.snapshotId,
      lastSnapshotHash: contentHash,
      lastUploadResult: uploaded.unchanged ? 'unchanged' : 'uploaded',
      ...backupCounts,
      savedViewCount: backup.savedViews.length,
      nextRunAt: nextRunAt(settings.cloudSyncIntervalMinutes)
    };
    await setCloudSyncStatus(status);
    return { ok: true, data: status };
  } catch (error) {
    const status = await setAttention(error, enabled);
    return { ok: false, error: status.lastError };
  }
}

export async function restoreLatestCloudBackup(config?: CloudSyncClientConfig): Promise<MessageResponse<CloudSyncStatus>> {
  const [license, settings] = await Promise.all([getLicenseData(), getSettings()]);
  const enabled = settings.cloudSyncEnabled;

  if (!canUseCapability(license, 'cloud-sync')) {
    const status = await setAttention('Cloud Sync requires Pro.', enabled);
    return { ok: false, error: status.lastError };
  }

  await setCloudSyncStatus({ phase: 'syncing', enabled, lastRunAt: Date.now() });

  try {
    const remote = await getLatestCloudSnapshot(license, config);
    const backup = await decryptCloudSnapshot(remote.snapshot, license.licenseKey);
    const backupCounts = getBackupBookmarkCounts(backup);
    await importLocalBackup(backup);
    await markLocalDataChanged('backup-imported');

    const lastBackup: LastBackupStatus = {
      at: backup.exportedAt,
      bookmarkCount: backupCounts.bookmarkCount,
      savedViewCount: backup.savedViews.length,
      filename: backupFilename(backup.exportedAt)
    };
    await setLastBackupStatus(lastBackup);

    const status: CloudSyncStatus = {
      phase: 'protected',
      enabled,
      lastRunAt: Date.now(),
      lastSuccessAt: Date.now(),
      remoteSnapshotId: remote.snapshotId,
      ...backupCounts,
      savedViewCount: backup.savedViews.length,
      nextRunAt: enabled ? nextRunAt(settings.cloudSyncIntervalMinutes) : undefined
    };
    await setCloudSyncStatus(status);
    return { ok: true, data: status };
  } catch (error) {
    const status = await setAttention(error, enabled);
    return { ok: false, error: status.lastError };
  }
}

export async function restoreCloudSnapshot(snapshotId: string, config?: CloudSyncClientConfig): Promise<MessageResponse<CloudSyncStatus>> {
  const [license, settings] = await Promise.all([getLicenseData(), getSettings()]);
  const enabled = settings.cloudSyncEnabled;
  if (!canUseCapability(license, 'cloud-sync')) {
    const status = await setAttention('Cloud Sync requires Pro.', enabled);
    return { ok: false, error: status.lastError };
  }
  await setCloudSyncStatus({ phase: 'syncing', enabled, lastRunAt: Date.now() });
  try {
    const remote = await getCloudSnapshotById(license, snapshotId, config);
    const backup = await decryptCloudSnapshot(remote.snapshot, license.licenseKey);
    const backupCounts = getBackupBookmarkCounts(backup);
    await importLocalBackup(backup);
    await markLocalDataChanged('backup-imported');
    const status: CloudSyncStatus = { phase: 'protected', enabled, lastRunAt: Date.now(), lastSuccessAt: Date.now(), remoteSnapshotId: remote.snapshotId, ...backupCounts, savedViewCount: backup.savedViews.length };
    await setCloudSyncStatus(status);
    return { ok: true, data: status };
  } catch (error) {
    const status = await setAttention(error, enabled);
    return { ok: false, error: status.lastError };
  }
}
