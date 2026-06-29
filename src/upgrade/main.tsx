import '../lib/utils/translateGuard';
import { BadgeDollarSign, CalendarClock, Check, ExternalLink, KeyRound, Mail, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { Button } from '../components/Button';
import { useTheme } from '../hooks/useTheme';
import { activateAndStoreLicense, deactivateStoredLicense, validateStoredLicenseIfNeeded } from '../lib/license/service';
import { emptyLicenseData } from '../lib/storage/localStorage';
import type { LicenseData } from '../shared/types';
import '../styles/globals.css';

const MONTHLY_CHECKOUT_URL = import.meta.env.VITE_CREEM_MONTHLY_CHECKOUT_URL as string | undefined;
const ANNUAL_CHECKOUT_URL = (import.meta.env.VITE_CREEM_ANNUAL_CHECKOUT_URL ?? import.meta.env.VITE_CREEM_CHECKOUT_URL) as string | undefined;
const SUPPORT_EMAIL = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) ?? 'pp12111@outlook.com';

const freeFeatures = [
  { text: 'Search and read your full bookmark library', included: true },
  { text: 'Organize up to 200 bookmarks with folders & tags', included: true },
  { text: 'Export JSON backups', included: true },
  { text: 'Markdown and CSV exports', included: false },
  { text: 'Bulk actions across the full library', included: false }
];

const proFeatures = [
  'Unlimited local bookmark management',
  'Markdown and CSV export',
  'Bulk select, move, tag, and delete',
  'All imported bookmarks stay searchable',
  'Future Pro feature updates'
];

const workflows = [
  {
    title: 'Keep a searchable research library',
    description: 'Turn saved X posts into a local archive you can search by text, author, handle, folder, and tag.'
  },
  {
    title: 'Organize large bookmark sets',
    description: 'Use folders, tags, archive, and bulk actions when the native X bookmarks page becomes hard to manage.'
  },
  {
    title: 'Export without lock-in',
    description: 'Move useful bookmarks into Markdown, CSV, or JSON backups when you need to work outside X.'
  },
  {
    title: 'Local-first by default',
    description: 'Bookmark content is stored in your browser extension storage unless you export it yourself.'
  }
];

function formatDate(value: string | null) {
  if (!value) {
    return undefined;
  }

  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value));
}

function openCheckout(url: string | undefined, setStatus: (status: string) => void) {
  if (!url) {
    setStatus('Checkout URL is not configured.');
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}

function Upgrade() {
  useTheme();
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
      setLicenseKey('');
      setStatus('License deactivated. Local bookmarks were kept.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Deactivation failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-6 lg:px-8">
        <header className="grid gap-6 border-b border-border pb-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-app border border-border bg-surface px-3 py-1 text-xs font-semibold text-muted-foreground">
              <ShieldCheck size={14} className="text-primary" />
              Local-first X bookmark management
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
              Upgrade BookmarkNest when your X bookmarks become a real library.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              Free is enough to try the workflow. Pro removes the 200-bookmark management limit and unlocks exports and bulk actions for serious X research.
            </p>
          </div>
          <div className="rounded-app border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-app bg-primary text-primary-foreground">
                <KeyRound size={19} />
              </div>
              <div>
                <p className="text-sm font-semibold">{license.pro ? 'Pro active' : 'Free plan active'}</p>
                <p className="text-xs text-muted-foreground">Validation: {license.validationStatus}</p>
              </div>
            </div>
            {license.email ? <StatusRow label="Email" value={license.email} /> : null}
            {license.activatedAt ? <StatusRow label="Activated" value={formatDate(license.activatedAt)} /> : null}
          </div>
        </header>

        <section className="mt-8 grid gap-4 lg:grid-cols-3">
          <PlanCard
            title="Free"
            price="$0"
            caption="Try the core organizer"
            badge={!license.pro ? 'Current plan' : undefined}
            features={freeFeatures}
          />
          <PlanCard
            title="Monthly Pro"
            price="$2"
            suffix="/ month"
            caption="Low-cost access for active X users"
            badge={license.pro ? 'Pro enabled' : 'Most flexible'}
            features={proFeatures.map((text) => ({ text, included: true }))}
            action={
              <Button variant="secondary" className="w-full" onClick={() => openCheckout(MONTHLY_CHECKOUT_URL, setStatus)}>
                Start monthly
                <ExternalLink size={16} />
              </Button>
            }
            note="Subscription billing. Cancel from the payment provider account portal."
          />
          <PlanCard
            title="Annual Pro"
            price="$20"
            suffix="/ year"
            caption="Two months free vs. monthly"
            badge="Best value"
            highlighted
            features={proFeatures.map((text) => ({ text, included: true }))}
            action={
              <Button variant="primary" className="w-full" onClick={() => openCheckout(ANNUAL_CHECKOUT_URL, setStatus)}>
                Start annual
                <ExternalLink size={16} />
              </Button>
            }
            note="Billed once per year (~$1.67 / month). Cancel anytime from the payment provider portal."
          />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="rounded-app border border-border bg-surface p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Built for these Pro workflows</h2>
              <div className="flex flex-wrap gap-2">
                <PromisePill icon={<ShieldCheck size={14} />} text="Local-first" />
                <PromisePill icon={<Sparkles size={14} />} text="Future Pro updates" />
                <PromisePill icon={<CalendarClock size={14} />} text="Cancel anytime" />
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {workflows.map((item) => (
                <div key={item.title} className="rounded-app border border-border bg-background p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                      <Check size={15} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">{item.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-app border border-border bg-surface p-5 shadow-sm">
            <h2 className="text-lg font-semibold">{license.pro ? 'License active' : 'Activate license'}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              After payment, copy your License Key from the Creem success page or order email, then activate it here.
            </p>
            {license.pro ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-app border border-primary/20 bg-primary/5 p-3 text-sm">
                  <div className="font-semibold text-primary">Pro activated</div>
                  {license.email ? <div className="mt-1 text-muted-foreground">Email: {license.email}</div> : null}
                  {license.activatedAt ? <div className="mt-1 text-muted-foreground">Activated: {formatDate(license.activatedAt)}</div> : null}
                  <div className="mt-1 text-muted-foreground">Validation: {license.validationStatus}</div>
                </div>
                <Button variant="ghost" onClick={() => void handleDeactivate()} disabled={busy}>
                  Deactivate device
                </Button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <label className="block text-sm">
                  <span className="font-medium">License key</span>
                  <input
                    className="mt-2 h-11 w-full rounded-app border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    value={licenseKey}
                    onChange={(event) => setLicenseKey(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        void handleActivate();
                      }
                    }}
                    placeholder="XXXX-XXXX-XXXX"
                  />
                </label>
                <Button variant="primary" className="w-full" onClick={() => void handleActivate()} disabled={busy || !licenseKey.trim()}>
                  <KeyRound size={16} />
                  {busy ? 'Verifying...' : 'Activate Pro'}
                </Button>
                <p className="text-xs leading-5 text-muted-foreground">
                  One License Key can activate up to 3 devices. Deactivate here before switching devices to free a slot.
                </p>
              </div>
            )}
            {status ? <p className="mt-3 text-sm text-muted-foreground">{status}</p> : null}
            <div className="mt-5 rounded-app border border-border bg-background p-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <Mail size={15} className="text-primary" />
                Purchase or activation issue?
              </div>
              <a className="mt-1 block text-primary hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
                {SUPPORT_EMAIL}
              </a>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusRow({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return null;
  }

  return (
    <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-medium">{value}</span>
    </div>
  );
}

function PromisePill({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-app border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
      <span className="text-primary">{icon}</span>
      {text}
    </span>
  );
}

interface PlanCardProps {
  title: string;
  price: string;
  suffix?: string;
  caption: string;
  badge?: string;
  highlighted?: boolean;
  features: Array<{ text: string; included: boolean }>;
  action?: ReactNode;
  note?: string;
}

function PlanCard({ title, price, suffix, caption, badge, highlighted, features, action, note }: PlanCardProps) {
  return (
    <div className={highlighted ? 'relative rounded-app border-2 border-primary bg-surface p-5 shadow-md' : 'relative rounded-app border border-border bg-surface p-5 shadow-sm'}>
      {badge ? (
        <span className={highlighted ? 'absolute -top-3 left-5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground' : 'absolute -top-3 left-5 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-muted-foreground'}>
          {badge}
        </span>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{caption}</p>
        </div>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-app bg-muted text-primary">
          {title === 'Free' ? <BadgeDollarSign size={19} /> : <CalendarClock size={19} />}
        </div>
      </div>
      <div className="mt-5 flex items-end gap-1">
        <span className="text-4xl font-semibold">{price}</span>
        {suffix ? <span className="pb-1 text-sm text-muted-foreground">{suffix}</span> : null}
      </div>
      <ul className="mt-5 space-y-3">
        {features.map((feature) => (
          <li key={feature.text} className="flex items-start gap-2 text-sm leading-5">
            {feature.included ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            ) : (
              <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
            )}
            <span className={feature.included ? 'text-foreground' : 'text-muted-foreground'}>{feature.text}</span>
          </li>
        ))}
      </ul>
      {action ? <div className="mt-6">{action}</div> : null}
      {note ? <p className="mt-3 text-xs leading-5 text-muted-foreground">{note}</p> : null}
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Upgrade />
  </StrictMode>
);
