import '../lib/utils/translateGuard';
import { BadgeCheck, BadgeDollarSign, CalendarClock, Check, ExternalLink, KeyRound, Mail, Power, ShieldCheck, Sparkles, X } from 'lucide-react';
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
  { text: 'Organize bookmarks with folders, tags, archive, and delete', included: true },
  { text: 'Export JSON backups', included: true },
  { text: 'Markdown and CSV exports', included: false },
  { text: 'Saved views, research notes, and background sync', included: false }
];

const proFeatures = [
  'Saved views for repeat research lanes',
  'Bookmark notes inside the research desk',
  'Markdown and CSV export',
  'Bulk select, move, tag, and delete',
  'Background sync and mirror removals',
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
              Upgrade BookmarkNest when your X bookmarks become working research.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              Free keeps the full library readable and organized. Pro adds saved views, notes, exports, and sync for serious X research.
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
            price="$2.99"
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
            price="$24.99"
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
            note="Billed once per year. Cancel anytime from the payment provider portal."
          />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="rounded-app border border-border bg-surface p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Built for these Pro workflows</h2>
              <div className="flex flex-wrap gap-2">
                <PromisePill icon={<ShieldCheck size={14} />} text="Local-first" />
                <PromisePill icon={<Sparkles size={14} />} text="Future Pro updates" />
                <PromisePill icon={<CalendarClock size={14} />} text="Cancel anytime" />
              </div>
            </div>
            <div className="mt-5 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {workflows.map((item) => (
                <div key={item.title} className="flex items-start gap-3 border-t border-border/70 py-4">
                  <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <Check size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{item.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <LicensePanel
            license={license}
            licenseKey={licenseKey}
            setLicenseKey={setLicenseKey}
            busy={busy}
            status={status}
            onActivate={handleActivate}
            onDeactivate={handleDeactivate}
          />
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

interface LicensePanelProps {
  license: LicenseData;
  licenseKey: string;
  setLicenseKey: (value: string) => void;
  busy: boolean;
  status: string | null;
  onActivate: () => Promise<void>;
  onDeactivate: () => Promise<void>;
}

function LicensePanel({ license, licenseKey, setLicenseKey, busy, status, onActivate, onDeactivate }: LicensePanelProps) {
  const planLabel = getLicensePlanLabel(license);

  return (
    <div className="rounded-app border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{license.pro ? 'License active' : 'Activate license'}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {license.pro
              ? `This browser is using one activation slot for ${planLabel}.`
              : 'Paste the License Key from your Creem success page or order email.'}
          </p>
        </div>
        <span
          className={
            license.pro
              ? 'inline-flex items-center gap-1.5 rounded-app border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary'
              : 'inline-flex items-center gap-1.5 rounded-app border border-border bg-background px-2.5 py-1 text-xs font-semibold text-muted-foreground'
          }
        >
          {license.pro ? <BadgeCheck size={14} /> : <KeyRound size={14} />}
          {license.pro ? 'Active' : 'Inactive'}
        </span>
      </div>

      {license.pro ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-app border border-primary/25 bg-primary/[0.06] p-4 text-sm">
            <LicenseMetaRow label="Plan" value={planLabel} strong />
            <LicenseMetaRow label="Status" value="Pro enabled" />
            {license.email ? <LicenseMetaRow label="Email" value={license.email} /> : null}
            {license.activatedAt ? <LicenseMetaRow label="Activated" value={formatDate(license.activatedAt)} /> : null}
            <LicenseMetaRow label="Expires" value={license.expiresAt ? formatDate(license.expiresAt) : 'Never'} />
            <LicenseMetaRow label="Validation" value={license.validationStatus} />
          </div>
          <div className="rounded-app border border-border bg-background p-4">
            <h3 className="text-sm font-semibold">Device activation</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              One License Key can activate up to 3 devices. Deactivate this device before switching to free a slot.
            </p>
            <Button variant="danger" className="mt-4 w-full" onClick={() => void onDeactivate()} disabled={busy}>
              <Power size={16} />
              {busy ? 'Deactivating...' : 'Deactivate device'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <label className="block text-sm">
            <span className="font-medium">License key</span>
            <input
              className="mt-2 h-11 w-full rounded-app border border-border bg-background px-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15"
              value={licenseKey}
              onChange={(event) => setLicenseKey(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void onActivate();
                }
              }}
              placeholder="XXXX-XXXX-XXXX"
            />
          </label>
          <Button variant="primary" className="w-full" onClick={() => void onActivate()} disabled={busy || !licenseKey.trim()}>
            <KeyRound size={16} />
            {busy ? 'Verifying...' : 'Activate Pro'}
          </Button>
          <p className="text-xs leading-5 text-muted-foreground">
            One License Key can activate up to 3 devices. Deactivate a device before switching to free a slot.
          </p>
        </div>
      )}

      {status ? <p className="mt-4 rounded-app border border-border bg-background px-3 py-2 text-sm text-muted-foreground">{status}</p> : null}

      <div className="mt-5 border-t border-border pt-4 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <Mail size={15} className="text-primary" />
          Purchase or activation issue?
        </div>
        <a className="mt-1 block text-primary hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </a>
      </div>
    </div>
  );
}

function LicenseMetaRow({ label, value, strong = false }: { label: string; value?: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-primary/10 py-2 first:pt-0 last:border-b-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? 'font-semibold text-primary' : 'min-w-0 truncate font-medium text-foreground'}>{value}</span>
    </div>
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
