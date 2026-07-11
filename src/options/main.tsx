import '../lib/utils/translateGuard';
import { AlertTriangle, Cloud, CloudOff, Download, KeyRound, LoaderCircle, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Field, SelectInput, TextInput } from '../components/Field';
import { PageShell } from '../components/PageShell';
import { useTheme } from '../hooks/useTheme';
import { applyAutoOrganizeRules, exportLocalBackup, importLocalBackup, listBookmarkItems, resetDomainData } from '../lib/db/bookmarkRepository';
import { downloadText } from '../lib/export/download';
import { canUseCapability } from '../lib/license/pro';
import { listCloudSnapshots } from '../lib/cloudSync/client';
import { deactivateStoredLicense, validateStoredLicenseIfNeeded } from '../lib/license/service';
import { sendRuntimeMessage } from '../lib/messaging/runtime';
import {
  emptyLicenseData,
  getCloudSyncStatus,
  getLastBackupStatus,
  getLastSyncStatus,
  getSettings,
  markLocalDataChanged,
  saveSettings,
  setLastBackupStatus,
  subscribeToLocalStateChanges
} from '../lib/storage/localStorage';
import type { AutoOrganizeRule, AutoSyncStatus, CloudSyncSnapshotSummary, CloudSyncStatus, ImportDiagnostics, LastBackupStatus, LastSyncStatus, LicenseData } from '../shared/types';
import '../styles/globals.css';

type Status = { type: 'success' | 'error'; message: string } | null;
type BusyAction = 'export' | 'import' | 'clear' | 'diagnostics' | 'x-sync' | 'cloud-backup' | 'cloud-restore' | null;
type RuleDialogState = { ruleId?: string; kind: AutoOrganizeRule['kind'] } | null;

function formatDate(value: string | null) {
  if (!value) {
    return undefined;
  }

  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value));
}

function formatBackupDate(timestamp?: number) {
  if (!timestamp) {
    return 'Never backed up';
  }

  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);
}

function formatRelativeTime(timestamp: number) {
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function formatFutureTime(timestamp?: number) {
  if (!timestamp) {
    return 'Not scheduled';
  }

  const minutes = Math.max(0, Math.round((timestamp - Date.now()) / 60000));
  if (minutes < 1) return 'due now';
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} h`;
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);
}

function describeLastSync(sync: LastSyncStatus | null) {
  if (!sync) {
    return 'No API sync has run yet.';
  }

  if (!sync.ok) {
    return `Last sync failed ${formatRelativeTime(sync.at)}: ${sync.error ?? 'Unknown error.'}`;
  }

  const visibleCount = sync.visibleBookmarkCount ?? sync.totalStoredBookmarkCount;
  const archivedCount = sync.archivedBookmarkCount ?? 0;
  const deletedCount = sync.deletedBookmarkCount ?? 0;
  const hasRecordBreakdown = sync.archivedBookmarkCount != null || sync.deletedBookmarkCount != null;
  const totalLocalRecords = visibleCount != null ? visibleCount + archivedCount + deletedCount : undefined;
  const parts = visibleCount != null
    ? [
        hasRecordBreakdown
          ? `${totalLocalRecords} local records (${visibleCount} visible, ${archivedCount} archived, ${deletedCount} in Trash)`
          : `${visibleCount} visible bookmarks`
      ]
    : [];
  parts.push(`${sync.inserted ?? 0} new`);
  if (sync.duplicate != null) {
    parts.push(`${sync.duplicate} already saved`);
  }
  if (sync.failed) {
    parts.push(`${sync.failed} failed`);
  }
  if (sync.removed) {
    parts.push(`${sync.removed} moved to Trash`);
  }
  parts.push(`${sync.found ?? 0} fetched from X`);
  return `Last sync ${formatRelativeTime(sync.at)}: ${parts.join(', ')}.`;
}

function backupFilename(timestamp: number) {
  const compactTimestamp = new Date(timestamp).toISOString().slice(0, 16).replaceAll('-', '').replaceAll(':', '').replace('T', '-');
  return `bookmarknest-backup-${compactTimestamp}.json`;
}

function getLicensePlanLabel(license: LicenseData) {
  if (license.plan === 'monthly') {
    return 'Monthly Pro';
  }
  if (license.plan === 'annual') {
    return 'Annual Pro';
  }
  if (license.plan === 'lifetime') {
    return 'Lifetime Pro';
  }

  if (!license.expiresAt) {
    return 'Pro';
  }

  const activatedAt = license.activatedAt ? Date.parse(license.activatedAt) : Date.now();
  const expiresAt = Date.parse(license.expiresAt);
  const durationDays = Math.round((expiresAt - activatedAt) / (24 * 60 * 60 * 1000));

  if (durationDays > 330) {
    return 'Annual Pro';
  }
  if (durationDays > 20) {
    return 'Monthly Pro';
  }

  return 'Pro';
}

function Options() {
  const { theme, setTheme } = useTheme();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const [syncInterval, setSyncInterval] = useState(60);
  const [lastSync, setLastSync] = useState<LastSyncStatus | null>(null);
  const [autoSyncStatus, setAutoSyncStatus] = useState<AutoSyncStatus | null>(null);
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(false);
  const [cloudSyncInterval, setCloudSyncInterval] = useState(360);
  const [cloudSyncDeviceName, setCloudSyncDeviceName] = useState('');
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus | null>(null);
  const [cloudSnapshots, setCloudSnapshots] = useState<CloudSyncSnapshotSummary[]>([]);
  const [cloudHistoryLoading, setCloudHistoryLoading] = useState(false);
  const [cloudRestoreTarget, setCloudRestoreTarget] = useState<CloudSyncSnapshotSummary | 'latest' | null>(null);
  const [mirrorRemovals, setMirrorRemovals] = useState(false);
  const [autoOrganizeRules, setAutoOrganizeRules] = useState<AutoOrganizeRule[]>([]);
  const [ruleDialog, setRuleDialog] = useState<RuleDialogState>(null);
  const [ruleDraftKind, setRuleDraftKind] = useState<AutoOrganizeRule['kind']>('domain');
  const [ruleDraftValue, setRuleDraftValue] = useState('');
  const [ruleDraftTagName, setRuleDraftTagName] = useState('');
  const [ruleDraftMarkForExport, setRuleDraftMarkForExport] = useState(false);
  const [ruleDraftError, setRuleDraftError] = useState<string | null>(null);
  const [license, setLicense] = useState<LicenseData>(emptyLicenseData);
  const [lastBackup, setLastBackup] = useState<LastBackupStatus | null>(null);
  const [licenseBusy, setLicenseBusy] = useState(false);
  const [versionClicks, setVersionClicks] = useState(0);
  const showDiagnostics = versionClicks >= 5;
  const extensionVersion = useMemo(() => {
    if (typeof chrome === 'undefined') {
      return '0.1.0';
    }
    return chrome.runtime?.getManifest?.().version ?? '0.1.0';
  }, []);

  const canUseAutoSync = canUseCapability(license, 'auto-sync');
  const canUseMirrorRemovals = canUseCapability(license, 'mirror-removals');
  const canUseCloudSync = canUseCapability(license, 'cloud-sync');

  function openUpgrade() {
    void sendRuntimeMessage({ type: 'OPEN_UPGRADE' });
  }

  useEffect(() => {
    void getSettings().then((s) => {
      setAutoSync(s.autoSync);
      setSyncInterval(s.syncIntervalMinutes);
      setCloudSyncEnabled(s.cloudSyncEnabled);
      setCloudSyncInterval(s.cloudSyncIntervalMinutes);
      setCloudSyncDeviceName(s.cloudSyncDeviceName ?? '');
      setMirrorRemovals(s.mirrorRemovals);
      setAutoOrganizeRules(s.autoOrganizeRules ?? []);
    });
    void validateStoredLicenseIfNeeded().then(setLicense);
    void getLastSyncStatus().then(setLastSync);
    void getLastBackupStatus().then(setLastBackup);
    void getCloudSyncStatus().then(setCloudSyncStatus);
  }, []);

  const refreshAutoSyncStatus = useCallback(async () => {
    const response = await sendRuntimeMessage<AutoSyncStatus>({ type: 'GET_AUTO_SYNC_STATUS' });
    if (response.ok && response.data) {
      setAutoSyncStatus(response.data);
    }
  }, []);

  useEffect(() => {
    void refreshAutoSyncStatus();
  }, [autoSync, syncInterval, refreshAutoSyncStatus]);

  const refreshCloudHistory = useCallback(async () => {
    if (!canUseCapability(license, 'cloud-sync')) {
      setCloudSnapshots([]);
      return;
    }
    setCloudHistoryLoading(true);
    try {
      const response = await listCloudSnapshots(license);
      setCloudSnapshots(response.snapshots);
    } catch {
      setCloudSnapshots([]);
    } finally {
      setCloudHistoryLoading(false);
    }
  }, [license]);

  useEffect(() => {
    void refreshCloudHistory();
  }, [refreshCloudHistory]);

  useEffect(
    () =>
      subscribeToLocalStateChanges({
        onLicenseChange: setLicense,
        onLastSyncChange: setLastSync,
        onLastBackupChange: setLastBackup,
        onCloudSyncChange: setCloudSyncStatus
      }),
    []
  );

  async function handleRunXSyncNow() {
    if (busyAction) {
      return;
    }

    setBusyAction('x-sync');
    setStatus(null);
    try {
      const response = await sendRuntimeMessage<{ session?: { insertedCount: number; duplicateCount: number; failedCount: number; foundCount: number }; removedCount?: number }>({ type: 'RUN_X_API_IMPORT' });
      await getLastSyncStatus().then(setLastSync);
      await refreshAutoSyncStatus();
      if (!response.ok) {
        setStatus({ type: 'error', message: response.error ?? 'X API sync failed.' });
        return;
      }

      const session = response.data?.session;
      setStatus({
        type: 'success',
        message: session
          ? `X API sync complete: ${session.insertedCount} new, ${session.duplicateCount} already saved, ${session.failedCount} failed, ${session.foundCount} fetched from X.`
          : 'X API sync complete.'
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCloudBackup() {
    if (busyAction) {
      return;
    }

    setBusyAction('cloud-backup');
    setStatus(null);
    try {
      const response = await sendRuntimeMessage<CloudSyncStatus>({ type: 'RUN_CLOUD_BACKUP' });
      if (!response.ok || !response.data) {
        setStatus({ type: 'error', message: response.error ?? 'Cloud Sync failed.' });
        return;
      }
      setCloudSyncStatus(response.data);
      await refreshCloudHistory();
      setStatus({
        type: 'success',
        message: response.data.lastUploadResult === 'unchanged' ? 'Cloud backup already up to date.' : 'Cloud backup protected.'
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCloudRestore() {
    if (busyAction) {
      return;
    }

    setCloudRestoreTarget(null);
    setBusyAction('cloud-restore');
    setStatus(null);
    try {
      const safetyBackup = await exportLocalBackup();
      await downloadText(`bookmarknest-before-cloud-restore-${safetyBackup.exportedAt}.json`, JSON.stringify(safetyBackup, null, 2), 'application/json;charset=utf-8');
      const response = await sendRuntimeMessage<CloudSyncStatus>({ type: 'RESTORE_CLOUD_BACKUP' });
      if (!response.ok || !response.data) {
        setStatus({ type: 'error', message: response.error ?? 'Cloud restore failed.' });
        return;
      }
      setCloudSyncStatus(response.data);
      await refreshCloudHistory();
      setStatus({ type: 'success', message: 'Cloud backup restored. A local safety backup was downloaded first.' });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCloudSnapshotRestore(snapshot: CloudSyncSnapshotSummary) {
    if (busyAction) {
      return;
    }
    setCloudRestoreTarget(null);
    setBusyAction('cloud-restore');
    setStatus(null);
    try {
      const safetyBackup = await exportLocalBackup();
      await downloadText(`bookmarknest-before-cloud-restore-${safetyBackup.exportedAt}.json`, JSON.stringify(safetyBackup, null, 2), 'application/json;charset=utf-8');
      const response = await sendRuntimeMessage<CloudSyncStatus>({ type: 'RESTORE_CLOUD_SNAPSHOT', snapshotId: snapshot.id });
      if (!response.ok || !response.data) {
        setStatus({ type: 'error', message: response.error ?? 'Cloud restore failed.' });
        return;
      }
      setCloudSyncStatus(response.data);
      setStatus({ type: 'success', message: 'Selected cloud backup restored. A local safety backup was downloaded first.' });
    } finally {
      setBusyAction(null);
    }
  }

  function openRuleDialog(kind: AutoOrganizeRule['kind'], rule?: AutoOrganizeRule) {
    setRuleDialog({ kind, ruleId: rule?.id });
    setRuleDraftKind(rule?.kind ?? kind);
    setRuleDraftValue(rule?.value ?? '');
    setRuleDraftTagName(rule?.tagName ?? '');
    setRuleDraftMarkForExport(rule?.markForExport ?? false);
    setRuleDraftError(null);
  }

  function closeRuleDialog() {
    setRuleDialog(null);
    setRuleDraftError(null);
  }

  function saveAutoOrganizeRule() {
    if (!ruleDialog) return;

    const value = ruleDraftValue.trim();
    if (!value) {
      setRuleDraftError(ruleDraftKind === 'domain' ? 'Enter a domain to match.' : 'Enter an author handle to match.');
      return;
    }

    const nextRule: AutoOrganizeRule = {
      id: ruleDialog.ruleId ?? crypto.randomUUID(),
      kind: ruleDraftKind,
      value,
      tagName: ruleDraftTagName.trim() || undefined,
      markForExport: ruleDraftMarkForExport
    };
    const next = ruleDialog.ruleId
      ? autoOrganizeRules.map((rule) => rule.id === ruleDialog.ruleId ? nextRule : rule)
      : [...autoOrganizeRules, nextRule];

    setAutoOrganizeRules(next);
    void saveSettings({ autoOrganizeRules: next });
    closeRuleDialog();
  }

  function removeAutoOrganizeRule(ruleId: string) {
    const next = autoOrganizeRules.filter((rule) => rule.id !== ruleId);
    setAutoOrganizeRules(next);
    void saveSettings({ autoOrganizeRules: next });
  }

  async function applyRulesToExistingBookmarks() {
    if (!autoOrganizeRules.length || busyAction) return;
    setBusyAction('x-sync');
    setStatus(null);
    try {
      const bookmarks = await listBookmarkItems();
      await applyAutoOrganizeRules(bookmarks, autoOrganizeRules);
      await markLocalDataChanged('library-updated');
      setStatus({ type: 'success', message: `Applied ${autoOrganizeRules.length} rules to ${bookmarks.length} bookmarks.` });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to apply rules.' });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleExportBackup() {
    if (busyAction) {
      return;
    }

    setBusyAction('export');
    setStatus(null);
    try {
      const backup = await exportLocalBackup();
      const filename = backupFilename(backup.exportedAt);
      await downloadText(filename, JSON.stringify(backup, null, 2), 'application/json;charset=utf-8');
      const nextBackupStatus: LastBackupStatus = {
        at: backup.exportedAt,
        bookmarkCount: backup.bookmarks.length,
        savedViewCount: backup.savedViews.length,
        filename
      };
      await setLastBackupStatus(nextBackupStatus);
      setLastBackup(nextBackupStatus);
      setStatus({ type: 'success', message: `Backup exported: ${filename}` });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Backup export failed.' });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleImportBackup(file?: File) {
    if (!file || busyAction) {
      return;
    }

    setBusyAction('import');
    setStatus(null);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      await importLocalBackup(parsed);
      await markLocalDataChanged('backup-imported');
      setStatus({ type: 'success', message: 'Backup imported. Open BookmarkNest pages will refresh automatically.' });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Backup import failed.' });
    } finally {
      setBusyAction(null);
      if (importInputRef.current) {
        importInputRef.current.value = '';
      }
    }
  }

  async function handleClearLocalData() {
    if (busyAction) {
      return;
    }

    setBusyAction('clear');
    setStatus(null);
    try {
      await resetDomainData();
      await markLocalDataChanged('local-data-cleared');
      setConfirmClearOpen(false);
      setStatus({ type: 'success', message: 'Local data cleared.' });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to clear local data.' });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleExportDiagnostics() {
    if (busyAction) {
      return;
    }

    setBusyAction('diagnostics');
    setStatus(null);
    try {
      const response = await sendRuntimeMessage<{ diagnostics: ImportDiagnostics }>({ type: 'GET_IMPORT_DIAGNOSTICS' });
      if (!response.ok || !response.data?.diagnostics) {
        setStatus({ type: 'error', message: response.error ?? 'No import diagnostics are available yet.' });
        return;
      }

      const date = new Date().toISOString().slice(0, 10);
      await downloadText(
        `bookmarknest-import-diagnostics-${date}.json`,
        JSON.stringify(response.data.diagnostics, null, 2),
        'application/json;charset=utf-8'
      );
      setStatus({ type: 'success', message: 'Import diagnostics exported.' });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to export diagnostics.' });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeactivateLicense() {
    if (licenseBusy) {
      return;
    }

    setLicenseBusy(true);
    setStatus(null);
    try {
      const nextLicense = await deactivateStoredLicense();
      setLicense(nextLicense);
      setStatus({ type: 'success', message: 'License deactivated. You can activate another License Key from the Pro page.' });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to deactivate license.' });
    } finally {
      setLicenseBusy(false);
    }
  }

  return (
    <PageShell title="Options" description="Manage preferences, local data, license, and privacy controls.">
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-app border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">Appearance</h2>
          <Field label="Theme">
            <SelectInput value={theme} onChange={(e) => void setTheme(e.target.value as 'light' | 'dark' | 'system')}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </SelectInput>
          </Field>
        </div>
        <div className="rounded-app border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">Auto-sync</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Periodically fetch new X bookmarks in the background via the API.
          </p>
          <div className="mt-3 space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoSync}
                disabled={!canUseAutoSync}
                onChange={(e) => {
                  const next = e.target.checked;
                  setAutoSync(next);
                  void saveSettings({ autoSync: next }).then(refreshAutoSyncStatus);
                }}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              Enable auto-sync
            </label>
            {!canUseAutoSync ? (
              <button className="inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline" onClick={openUpgrade}>
                <KeyRound size={12} />
                Upgrade to unlock background sync
              </button>
            ) : null}
            <div className="border border-border/70 bg-background/60 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={lastSync?.ok === false ? 'font-medium text-danger' : 'font-medium text-foreground'}>
                  {describeLastSync(lastSync)}
                </span>
                <span className="text-xs text-muted-foreground">
                  Next: {autoSyncStatus?.enabled ? formatFutureTime(autoSyncStatus.nextRunAt) : 'Off'}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Auto-sync runs only while Chrome can run extension alarms and your X session is still signed in.
              </p>
            </div>
            {autoSync ? (
              <Field label="Sync interval">
                <SelectInput
                  value={String(syncInterval)}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setSyncInterval(next);
                    void saveSettings({ syncIntervalMinutes: next }).then(refreshAutoSyncStatus);
                  }}
                >
                  <option value="30">Every 30 minutes</option>
                  <option value="60">Every hour</option>
                  <option value="180">Every 3 hours</option>
                  <option value="360">Every 6 hours</option>
                  <option value="720">Every 12 hours</option>
                  <option value="1440">Every 24 hours</option>
                </SelectInput>
              </Field>
            ) : null}
            <Button size="sm" onClick={() => void handleRunXSyncNow()} disabled={!canUseAutoSync || Boolean(busyAction)}>
              {busyAction === 'x-sync' ? <LoaderCircle size={14} className="animate-spin" /> : <Upload size={14} />}
              {busyAction === 'x-sync' ? 'Syncing...' : 'Sync now'}
            </Button>
          </div>
        </div>
        <div className="rounded-app border border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Cloud Sync</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Protect the local research desk with encrypted cloud backups, then restore it after reinstalling or switching devices.
              </p>
            </div>
            <span className="inline-flex h-7 shrink-0 items-center gap-1.5 border border-primary/20 bg-primary/5 px-2 text-xs font-medium text-primary">
              {cloudSyncEnabled && canUseCloudSync ? <Cloud size={13} /> : <CloudOff size={13} />}
              {cloudSyncEnabled && canUseCloudSync ? 'On' : 'Off'}
            </span>
          </div>
          <div className="mt-3 border border-border/70 bg-background/60 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <ShieldCheck size={15} className={cloudSyncStatus?.phase === 'attention' ? 'text-danger' : 'text-primary'} />
              <span className="font-medium">
                {cloudSyncStatus?.phase === 'attention'
                  ? 'Needs attention'
                  : cloudSyncStatus?.lastSuccessAt
                    ? `Last protected ${formatBackupDate(cloudSyncStatus.lastSuccessAt)}`
                    : 'Not protected yet'}
              </span>
            </div>
            {cloudSyncStatus?.lastError ? <p className="mt-1 text-xs text-danger">{cloudSyncStatus.lastError}</p> : null}
            {cloudSyncStatus?.bookmarkCount != null ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {cloudSyncStatus.bookmarkCount} total records protected ({cloudSyncStatus.visibleBookmarkCount ?? cloudSyncStatus.bookmarkCount} visible
                {cloudSyncStatus.archivedBookmarkCount != null ? `, ${cloudSyncStatus.archivedBookmarkCount} archived` : ''}
                {cloudSyncStatus.deletedBookmarkCount != null ? `, ${cloudSyncStatus.deletedBookmarkCount} in Trash` : cloudSyncStatus.retainedBookmarkCount ? `, ${cloudSyncStatus.retainedBookmarkCount} archived or in Trash` : ''}), {cloudSyncStatus.savedViewCount ?? 0} saved views.
              </p>
            ) : null}
          </div>
          <div className="mt-3 space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={cloudSyncEnabled}
                disabled={!canUseCloudSync}
                onChange={(e) => {
                  const next = e.target.checked;
                  setCloudSyncEnabled(next);
                  void saveSettings({ cloudSyncEnabled: next });
                }}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              Enable Cloud Sync
            </label>
            {!canUseCloudSync ? (
              <button className="inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline" onClick={openUpgrade}>
                <KeyRound size={12} />
                Upgrade to protect data in cloud
              </button>
            ) : null}
            <Field label="Device name">
              <TextInput
                value={cloudSyncDeviceName}
                disabled={!canUseCloudSync}
                placeholder="MacBook Pro"
                onChange={(event) => {
                  const next = event.target.value;
                  setCloudSyncDeviceName(next);
                  void saveSettings({ cloudSyncDeviceName: next });
                }}
              />
            </Field>
            <Field label="Auto-protect interval">
              <SelectInput
                value={String(cloudSyncInterval)}
                disabled={!canUseCloudSync || !cloudSyncEnabled}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setCloudSyncInterval(next);
                  void saveSettings({ cloudSyncIntervalMinutes: next });
                }}
              >
                <option value="60">Every hour</option>
                <option value="180">Every 3 hours</option>
                <option value="360">Every 6 hours</option>
                <option value="720">Every 12 hours</option>
                <option value="1440">Every day</option>
              </SelectInput>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void handleCloudBackup()} disabled={!canUseCloudSync || !cloudSyncEnabled || Boolean(busyAction)}>
                {busyAction === 'cloud-backup' ? <LoaderCircle size={14} className="animate-spin" /> : <Cloud size={14} />}
                Protect now
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setCloudRestoreTarget('latest')} disabled={!canUseCloudSync || Boolean(busyAction)}>
                {busyAction === 'cloud-restore' ? <LoaderCircle size={14} className="animate-spin" /> : <Upload size={14} />}
                Restore from cloud
              </Button>
            </div>
            <div className="border-t border-border/70 pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Backup history</span>
                <Button size="sm" variant="ghost" onClick={() => void refreshCloudHistory()} disabled={!canUseCloudSync || cloudHistoryLoading || Boolean(busyAction)}>
                  {cloudHistoryLoading ? <LoaderCircle size={14} className="animate-spin" /> : <Cloud size={14} />}
                  Refresh
                </Button>
              </div>
              {cloudSnapshots.length ? (
                <div className="mt-2 divide-y divide-border border border-border/70 bg-background/50">
                  {cloudSnapshots.map((snapshot) => (
                    <div key={snapshot.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                      <span>{formatBackupDate(snapshot.createdAt)} · {snapshot.bookmarkCount} total protected records · {snapshot.deviceName ?? 'This device'}</span>
                      <Button size="xs" variant="ghost" onClick={() => setCloudRestoreTarget(snapshot)} disabled={Boolean(busyAction)}>
                        Restore
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">No cloud backup history yet.</p>
              )}
            </div>
          </div>
        </div>
        <div className="rounded-app border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">Mirror removals</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Keep BookmarkNest in lockstep with X. When you un-bookmark a post on X, a full import (manual or
            auto-sync) moves it to Trash here too. Off by default.
          </p>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={mirrorRemovals}
              disabled={!canUseMirrorRemovals}
              onChange={(e) => {
                const next = e.target.checked;
                setMirrorRemovals(next);
                void saveSettings({ mirrorRemovals: next });
              }}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            Remove posts I un-bookmarked on X
          </label>
          {!canUseMirrorRemovals ? (
            <button className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline" onClick={openUpgrade}>
              <KeyRound size={12} />
              Upgrade to mirror removals
            </button>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            Only acts on complete imports, never on partial or cancelled ones. Removals are recoverable from Trash.
          </p>
        </div>
        <div className="rounded-app border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">Auto-organize rules</h2>
          <p className="mt-2 text-sm text-muted-foreground">Apply local tags and export picks to new imports by author or linked domain.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => openRuleDialog('domain')}>Add domain rule</Button>
            <Button size="sm" variant="secondary" onClick={() => openRuleDialog('author')}>Add author rule</Button>
            <Button size="sm" variant="ghost" onClick={() => void applyRulesToExistingBookmarks()} disabled={!autoOrganizeRules.length || Boolean(busyAction)}>Apply to existing</Button>
          </div>
          {autoOrganizeRules.length ? (
            <div className="mt-3 divide-y divide-border border border-border/70 bg-background/50">
              {autoOrganizeRules.map((rule) => (
                <div key={rule.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                  <span>{rule.kind === 'domain' ? 'Domain' : 'Author'}: {rule.value}{rule.tagName ? ` -> ${rule.tagName}` : ''}{rule.markForExport ? ' -> Export picks' : ''}</span>
                  <div className="flex items-center gap-1">
                    <Button size="xs" variant="ghost" onClick={() => openRuleDialog(rule.kind, rule)}>Edit</Button>
                    <Button size="xs" variant="ghost" onClick={() => removeAutoOrganizeRule(rule.id)}>Remove</Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="rounded-app border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">Data</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Export, restore, or clear the local BookmarkNest library. Chrome removes extension data from this browser when the extension is uninstalled.
          </p>
          <div className="mt-3 border border-accent/25 bg-accent/10 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2 font-medium text-foreground">
              <ShieldCheck size={15} className="text-accent" />
              <span>Safety backup</span>
              <span className="text-xs font-normal text-muted-foreground">{formatBackupDate(lastBackup?.at)}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Keep the downloaded backup file before reinstalling, switching browsers, or clearing local data. It includes bookmarks, folders, tags, notes, saved views, and import history.
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void handleExportBackup()} disabled={Boolean(busyAction)}>
              {busyAction === 'export' ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />}
              Export backup
            </Button>
            <Button size="sm" onClick={() => importInputRef.current?.click()} disabled={Boolean(busyAction)}>
              {busyAction === 'import' ? <LoaderCircle size={14} className="animate-spin" /> : <Upload size={14} />}
              Import backup
            </Button>
            <Button size="sm" variant="danger" onClick={() => setConfirmClearOpen(true)} disabled={Boolean(busyAction)}>
              <Trash2 size={14} />
              Clear local data
            </Button>
          </div>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void handleImportBackup(event.target.files?.[0])}
          />
          {status ? (
            <p className={status.type === 'error' ? 'mt-3 text-sm text-danger' : 'mt-3 text-sm text-primary'}>{status.message}</p>
          ) : null}
        </div>
        <div className="rounded-app border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">License</h2>
          <p className="mt-2 text-sm text-muted-foreground">Activate Pro for saved views, notes, bulk actions, and sync controls.</p>
          {license.pro ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-app border border-primary/20 bg-primary/5 p-3 text-sm">
                <div className="flex items-center gap-2 font-semibold text-primary">
                  <KeyRound size={15} />
                  {getLicensePlanLabel(license)}
                </div>
                {license.email ? <div className="mt-1 text-muted-foreground">Email: {license.email}</div> : null}
                {license.activatedAt ? <div className="mt-1 text-muted-foreground">Activated: {formatDate(license.activatedAt)}</div> : null}
                <div className="mt-1 text-muted-foreground">Expires: {license.expiresAt ? formatDate(license.expiresAt) : 'Never'}</div>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                One License Key can activate up to 3 devices. Deactivate this device before switching to free a slot.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="danger" onClick={() => void handleDeactivateLicense()} disabled={licenseBusy}>
                  {licenseBusy ? <LoaderCircle size={14} className="animate-spin" /> : <KeyRound size={14} />}
                  {licenseBusy ? 'Deactivating...' : 'Deactivate device'}
                </Button>
                <Button size="sm" onClick={openUpgrade}>
                  Pro page
                </Button>
              </div>
            </div>
          ) : (
            <Button className="mt-3" size="sm" onClick={openUpgrade}>
              Activate license
            </Button>
          )}
        </div>
        <div className="rounded-app border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">Privacy</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Bookmark content stays in local browser storage unless you export it or enable encrypted Cloud Sync.
          </p>
        </div>
        {showDiagnostics || lastSync?.ok === false ? (
          <div className="rounded-app border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold">Import diagnostics</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Export the latest import counters and error details. Bookmark text is not included.
            </p>
            <Button className="mt-3" size="sm" onClick={() => void handleExportDiagnostics()} disabled={Boolean(busyAction)}>
              {busyAction === 'diagnostics' ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />}
              Export diagnostics
            </Button>
          </div>
        ) : null}
      </section>
      <button
        className="mt-6 text-xs text-muted-foreground"
        aria-label="Extension version"
        onClick={() => setVersionClicks((current) => current + 1)}
      >
        Version {extensionVersion}
      </button>
      <Dialog
        open={confirmClearOpen}
        title="Clear local data?"
        description="This removes all local bookmarks, folders, tags, notes, saved views, and import history from this browser."
        onClose={() => {
          if (!busyAction) {
            setConfirmClearOpen(false);
          }
        }}
        closeOnOverlayClick={!busyAction}
        footer={
          <>
            <Button onClick={() => setConfirmClearOpen(false)} disabled={Boolean(busyAction)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void handleClearLocalData()} disabled={Boolean(busyAction)}>
              {busyAction === 'clear' ? <LoaderCircle size={16} className="animate-spin" /> : <AlertTriangle size={16} />}
              {busyAction === 'clear' ? 'Clearing...' : 'Clear data'}
            </Button>
          </>
        }
      >
        <div className="rounded-app border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-muted-foreground">
          Export a backup first if you may need to restore this library later. Uninstalling the extension has the same local data risk.
        </div>
      </Dialog>
      <Dialog
        open={Boolean(ruleDialog)}
        title={ruleDialog?.ruleId ? 'Edit auto-organize rule' : 'Add auto-organize rule'}
        description="Rules run locally after a complete import. They never change your bookmarks on X."
        onClose={closeRuleDialog}
        footer={
          <>
            <Button onClick={closeRuleDialog}>Cancel</Button>
            <Button onClick={saveAutoOrganizeRule}>Save rule</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Match">
            <SelectInput value={ruleDraftKind} onChange={(event) => setRuleDraftKind(event.target.value as AutoOrganizeRule['kind'])}>
              <option value="domain">Linked domain</option>
              <option value="author">Author handle</option>
            </SelectInput>
          </Field>
          <Field
            label={ruleDraftKind === 'domain' ? 'Domain' : 'Author handle'}
            hint={ruleDraftKind === 'domain' ? 'For example: arxiv.org or github.com' : 'For example: karpathy'}
          >
            <TextInput
              value={ruleDraftValue}
              onChange={(event) => {
                setRuleDraftValue(event.target.value);
                setRuleDraftError(null);
              }}
              placeholder={ruleDraftKind === 'domain' ? 'arxiv.org' : 'Author handle'}
              aria-invalid={Boolean(ruleDraftError)}
            />
          </Field>
          {ruleDraftError ? <p className="text-sm text-danger" role="alert">{ruleDraftError}</p> : null}
          <Field label="Tag" hint="Optional. Create or add this tag whenever the rule matches.">
            <TextInput value={ruleDraftTagName} onChange={(event) => setRuleDraftTagName(event.target.value)} placeholder="Paper" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ruleDraftMarkForExport}
              onChange={(event) => setRuleDraftMarkForExport(event.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            Add matching bookmarks to Export picks
          </label>
        </div>
      </Dialog>
      <Dialog
        open={Boolean(cloudRestoreTarget)}
        title="Restore cloud backup?"
        description={
          cloudRestoreTarget === 'latest'
            ? "Your latest encrypted cloud backup will replace this browser's local library."
            : cloudRestoreTarget
              ? `The cloud backup from ${formatBackupDate(cloudRestoreTarget.createdAt)} will replace this browser's local library.`
              : undefined
        }
        onClose={() => {
          if (!busyAction) {
            setCloudRestoreTarget(null);
          }
        }}
        closeOnOverlayClick={!busyAction}
        footer={
          <>
            <Button onClick={() => setCloudRestoreTarget(null)} disabled={Boolean(busyAction)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (cloudRestoreTarget === 'latest') {
                  void handleCloudRestore();
                } else if (cloudRestoreTarget) {
                  void handleCloudSnapshotRestore(cloudRestoreTarget);
                }
              }}
              disabled={Boolean(busyAction)}
            >
              {busyAction === 'cloud-restore' ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />}
              {busyAction === 'cloud-restore' ? 'Restoring...' : 'Restore backup'}
            </Button>
          </>
        }
      >
        <div className="rounded-app border border-accent/25 bg-accent/10 px-3 py-2 text-sm text-muted-foreground">
          BookmarkNest will download a local safety backup before replacing any data.
        </div>
      </Dialog>
    </PageShell>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ErrorBoundary>
      <Options />
    </ErrorBoundary>
  </StrictMode>
);
