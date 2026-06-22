import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Button } from '../components/Button';
import { PageShell } from '../components/PageShell';
import { sendRuntimeMessage } from '../lib/messaging/runtime';
import '../styles/globals.css';

function Options() {
  return (
    <PageShell title="Options" description="Manage preferences, local data, license, and privacy controls.">
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-app border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">Appearance</h2>
          <p className="mt-2 text-sm text-muted-foreground">Theme: system</p>
        </div>
        <div className="rounded-app border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">Data</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm">Export backup</Button>
            <Button size="sm">Import backup</Button>
            <Button size="sm" variant="ghost">
              Clear local data
            </Button>
          </div>
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
      </section>
    </PageShell>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Options />
  </StrictMode>
);
