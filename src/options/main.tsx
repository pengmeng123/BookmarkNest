import { AlertTriangle, Download, LoaderCircle, Trash2, Upload } from 'lucide-react';
import { StrictMode, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { PageShell } from '../components/PageShell';
import { exportLocalBackup, importLocalBackup, resetDomainData } from '../lib/db/bookmarkRepository';
import { downloadText } from '../lib/export/download';
import { sendRuntimeMessage } from '../lib/messaging/runtime';
import type { ImportDiagnostics } from '../shared/types';
import '../styles/globals.css';

type Status = { type: 'success' | 'error'; message: string } | null;

function Options() {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busyAction, setBusyAction] = useState<'export' | 'import' | 'clear' | 'diagnostics' | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [versionClicks, setVersionClicks] = useState(0);
  const showDiagnostics = versionClicks >= 5;
  const extensionVersion = useMemo(() => {
    if (typeof chrome === 'undefined') {
      return '0.1.0';
    }
    return chrome.runtime?.getManifest?.().version ?? '0.1.0';
  }, []);

  async function handleExportBackup() {
    if (busyAction) {
      return;
    }

    setBusyAction('export');
    setStatus(null);
    try {
      const backup = await exportLocalBackup();
      const date = new Date(backup.exportedAt).toISOString().slice(0, 10);
      await downloadText(`bookmarknest-backup-${date}.json`, JSON.stringify(backup, null, 2), 'application/json;charset=utf-8');
      setStatus({ type: 'success', message: 'Backup exported.' });
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
      setStatus({ type: 'success', message: 'Backup imported. Reopen BookmarkNest to see the restored library.' });
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

  return (
    <PageShell title="Options" description="Manage preferences, local data, license, and privacy controls.">
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-app border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">Appearance</h2>
          <p className="mt-2 text-sm text-muted-foreground">Theme: system</p>
        </div>
        <div className="rounded-app border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">Data</h2>
          <p className="mt-2 text-sm text-muted-foreground">Export, restore, or clear the local BookmarkNest library.</p>
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
          <p className="mt-2 text-sm text-muted-foreground">Activate or manage your local Pro license.</p>
          <Button className="mt-3" size="sm" onClick={() => void sendRuntimeMessage({ type: 'OPEN_UPGRADE' })}>
            Manage license
          </Button>
        </div>
        <div className="rounded-app border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">Privacy</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Bookmark content stays in local browser storage unless you export it.
          </p>
        </div>
        {showDiagnostics ? (
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
        description="This removes all local bookmarks, folders, tags, and import history from this browser."
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
          Export a backup first if you may need to restore this library later.
        </div>
      </Dialog>
    </PageShell>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Options />
  </StrictMode>
);
