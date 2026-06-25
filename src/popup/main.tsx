import { ExternalLink, LoaderCircle, Upload } from 'lucide-react';
import { useState } from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Button } from '../components/Button';
import { useTheme } from '../hooks/useTheme';
import { sendRuntimeMessage } from '../lib/messaging/runtime';
import type { ImportSession } from '../shared/types';
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

function Popup() {
  useTheme();
  const [status, setStatus] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'visible' | 'auto-scroll' | null>(null);

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
          ? `Import complete: ${session.insertedCount} new, ${session.duplicateCount} duplicate, ${session.failedCount} failed, ${session.foundCount} found.`
          : 'Import started.'
      );
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
        <p className="text-xs text-muted-foreground">No bookmarks imported yet</p>
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
        <Button variant="ghost" onClick={() => void sendRuntimeMessage({ type: 'OPEN_UPGRADE' })}>
          Upgrade / Manage License
        </Button>
      </div>
      {status ? <p className="mt-3 text-xs text-muted-foreground">{status}</p> : null}
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Popup />
  </StrictMode>
);
