import '../lib/utils/translateGuard';
import { ExternalLink, LoaderCircle, Settings, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Button } from '../components/Button';
import { useTheme } from '../hooks/useTheme';
import { getBookmarkCounts } from '../lib/db/bookmarkRepository';
import { sendRuntimeMessage } from '../lib/messaging/runtime';
import { getLastSyncStatus, subscribeToLocalStateChanges } from '../lib/storage/localStorage';
import type { ImportSession, LastSyncStatus } from '../shared/types';
import '../styles/globals.css';

function formatImportError(error?: string) {
  if (!error) {
    return 'Import failed. Open your X bookmarks page and wait for bookmarks to load.';
  }

  if (error.includes('Open your X bookmarks page') || error.includes('No active tab')) {
    return 'No loaded X bookmarks page detected. Open x.com/i/bookmarks, wait for the list to appear, then try Import again.';
  }

  return error;
}

function formatSyncTime(at: number) {
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function describeLastSync(sync: LastSyncStatus) {
  if (!sync.ok) {
    return `Last sync failed (${formatSyncTime(sync.at)}): ${formatImportError(sync.error)}`;
  }

  const libraryCount = sync.visibleBookmarkCount ?? sync.totalStoredBookmarkCount;
  const parts = libraryCount != null ? [`${libraryCount} in library`] : [];
  parts.push(`${sync.inserted ?? 0} new`);
  if (sync.duplicate != null) {
    parts.push(`${sync.duplicate} duplicate`);
  }
  if (sync.failed) {
    parts.push(`${sync.failed} failed`);
  }
  if (sync.removed) {
    parts.push(`${sync.removed} removed`);
  }
  parts.push(`${sync.found ?? 0} fetched`);
  return `Last sync ${formatSyncTime(sync.at)}: ${parts.join(', ')}`;
}

function Popup() {
  useTheme();
  const [status, setStatus] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'visible' | 'auto-scroll' | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [lastSync, setLastSync] = useState<LastSyncStatus | null>(null);

  useEffect(() => {
    void getBookmarkCounts().then((c) => setTotalCount(c.total));
    void getLastSyncStatus().then(setLastSync);
    void chrome.action?.setBadgeText?.({ text: '' });
  }, []);

  useEffect(
    () =>
      subscribeToLocalStateChanges({
        onLocalDataChange: () => {
          void getBookmarkCounts().then((c) => setTotalCount(c.total));
          void getLastSyncStatus().then(setLastSync);
        },
        onLastSyncChange: setLastSync
      }),
    []
  );

  async function handleImport(mode: 'visible' | 'auto-scroll' = 'auto-scroll') {
    if (importMode) {
      return;
    }

    setImportMode(mode);
    setStatus(mode === 'auto-scroll' ? 'Importing X bookmarks and scanning the X page for avatars...' : 'Looking for an open X bookmarks tab...');
    try {
      const response = await sendRuntimeMessage<{ session?: ImportSession }>({
        type: 'START_X_IMPORT',
        mode
      });

      if (!response.ok) {
        setStatus(formatImportError(response.error));
        return;
      }

      const session = response.data?.session;
      setStatus(
        session
          ? `Import complete: ${session.insertedCount} new, ${session.duplicateCount} duplicate, ${session.failedCount} failed, ${session.foundCount} fetched.`
          : 'Import started.'
      );
      void getBookmarkCounts().then((c) => setTotalCount(c.total));
      void getLastSyncStatus().then(setLastSync);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Import failed. Please try again.');
    } finally {
      setImportMode(null);
    }
  }

  return (
    <main className="w-[340px] bg-background p-4 text-foreground">
      <header className="mb-4">
        <h1 className="text-lg font-semibold">BookmarkNest</h1>
        <p className="text-xs text-muted-foreground">
          {totalCount === null ? ' ' : totalCount === 0 ? 'No bookmarks imported yet' : `${totalCount} bookmarks saved`}
        </p>
      </header>
      <div className="grid gap-2">
        <Button variant="primary" onClick={() => void sendRuntimeMessage({ type: 'OPEN_APP' })}>
          <ExternalLink size={16} />
          Open BookmarkNest
        </Button>
        <Button onClick={() => void handleImport('auto-scroll')} disabled={Boolean(importMode)}>
          {importMode === 'auto-scroll' ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />}
          {importMode === 'auto-scroll' ? 'Loading...' : 'Import more'}
        </Button>
        <Button variant="ghost" onClick={() => void chrome.runtime?.openOptionsPage?.()}>
          <Settings size={16} />
          Settings
        </Button>
        <Button variant="ghost" onClick={() => void sendRuntimeMessage({ type: 'OPEN_UPGRADE' })}>
          Upgrade / Manage License
        </Button>
      </div>
      {status ? <p className="mt-3 text-xs text-muted-foreground">{status}</p> : null}
      {!status && lastSync ? (
        <p className={`mt-3 text-xs ${lastSync.ok ? 'text-muted-foreground' : 'text-danger'}`}>{describeLastSync(lastSync)}</p>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Popup />
  </StrictMode>
);
