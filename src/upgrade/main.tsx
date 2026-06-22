import { KeyRound } from 'lucide-react';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { Button } from '../components/Button';
import { PageShell } from '../components/PageShell';
import { activateAndStoreLicense, deactivateStoredLicense, validateStoredLicenseIfNeeded } from '../lib/license/service';
import { emptyLicenseData } from '../lib/storage/localStorage';
import type { LicenseData } from '../shared/types';
import '../styles/globals.css';

const CHECKOUT_URL = import.meta.env.VITE_CREEM_CHECKOUT_URL as string | undefined;

function Upgrade() {
  const [license, setLicense] = useState<LicenseData>(emptyLicenseData);
  const [licenseKey, setLicenseKey] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void validateStoredLicenseIfNeeded().then(setLicense);
  }, []);

  async function handleActivate() {
    if (!licenseKey.trim()) {
      setStatus('Enter a license key.');
      return;
    }

    setBusy(true);
    setStatus(null);
    try {
      const nextLicense = await activateAndStoreLicense(licenseKey.trim());
      setLicense(nextLicense);
      setStatus('Pro activated.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Activation failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivate() {
    setBusy(true);
    setStatus(null);
    try {
      const nextLicense = await deactivateStoredLicense();
      setLicense(nextLicense);
      setStatus('License deactivated. Local bookmarks were kept.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Deactivation failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell title="BookmarkNest Pro" description="Unlock unlimited local bookmark management and exports.">
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-app border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">Free</h2>
          <p className="mt-2 text-sm text-muted-foreground">Manage the recent 200 local bookmarks.</p>
        </div>
        <div className="rounded-app border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">Pro</h2>
          <p className="mt-2 text-sm text-muted-foreground">Unlimited bookmarks, Markdown/CSV export, and bulk actions.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => (CHECKOUT_URL ? window.open(CHECKOUT_URL, '_blank', 'noopener,noreferrer') : setStatus('Checkout URL is not configured.'))}>
              Buy once
            </Button>
            <Button onClick={() => void handleActivate()} disabled={busy}>
              <KeyRound size={16} />
              Activate key
            </Button>
          </div>
          <label className="mt-4 block text-sm">
            <span className="text-muted-foreground">License key</span>
            <input
              className="mt-1 h-10 w-full rounded-app border border-border bg-background px-3 outline-none"
              value={licenseKey}
              onChange={(event) => setLicenseKey(event.target.value)}
              placeholder="XXXX-XXXX-XXXX"
            />
          </label>
          <div className="mt-4 rounded-app bg-muted p-3 text-sm">
            <div className="font-medium">Status: {license.pro ? 'Pro active' : 'Free'}</div>
            <div className="mt-1 text-muted-foreground">Validation: {license.validationStatus}</div>
            {license.email ? <div className="mt-1 text-muted-foreground">Email: {license.email}</div> : null}
            {license.pro ? (
              <Button className="mt-3" size="sm" variant="ghost" onClick={() => void handleDeactivate()} disabled={busy}>
                Deactivate device
              </Button>
            ) : null}
          </div>
          {status ? <p className="mt-3 text-sm text-muted-foreground">{status}</p> : null}
        </div>
      </section>
    </PageShell>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Upgrade />
  </StrictMode>
);
