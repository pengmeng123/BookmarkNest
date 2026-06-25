import type { ReactNode } from 'react';

interface PageShellProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function PageShell({ title, description, actions, children }: PageShellProps) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-5 py-5 md:px-6 md:py-6">
        <header className="flex flex-col gap-1 border-b border-border/70 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Local X library</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal">{title}</h1>
          </div>
          <div className="flex items-center gap-3">
            {description ? <p className="max-w-xl text-sm leading-6 text-muted-foreground md:text-right">{description}</p> : null}
            {actions}
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}
