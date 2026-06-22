import { ExternalLink, Upload } from 'lucide-react';
import { useState } from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Button } from '../components/Button';
import { sendRuntimeMessage } from '../lib/messaging/runtime';
import '../styles/globals.css';

function Popup() {
  const [status, setStatus] = useState<string | null>(null);

  async function handleImport() {
    setStatus('Looking for an open X bookmarks tab...');
    const response = await sendRuntimeMessage<{ session?: { insertedCount: number; duplicateCount: number; failedCount: number } }>({
      type: 'START_X_IMPORT'
    });

    if (!response.ok) {
      setStatus(response.error ?? 'Import failed.');
      return;
    }

    const session = response.data?.session;
    setStatus(
      session
        ? `Imported ${session.insertedCount} new, ${session.duplicateCount} duplicate, ${session.failedCount} failed.`
        : 'Import started.'
    );
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
        <Button onClick={() => void handleImport()}>
          <Upload size={16} />
          Import from X
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
