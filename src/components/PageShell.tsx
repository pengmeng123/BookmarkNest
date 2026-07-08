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
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 px-5 py-5 md:px-6 md:py-6">
        <header className="flex flex-col gap-2 border-b border-border/70 pb-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">Local X research desk</p>
            <h1 className="mt-1 text-[28px] font-semibold tracking-normal text-foreground md:text-[34px]">{title}</h1>
          </div>
          <div className="flex items-center gap-3 md:max-w-xl md:justify-end">
            {description ? <p className="max-w-xl text-sm leading-6 text-muted-foreground md:text-right">{description}</p> : null}
            {actions}
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}
