import type { ReactNode } from 'react';
import { X } from 'lucide-react';

import { cn } from '../lib/utils/cn';

interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  className?: string;
}

export function Dialog({ open, title, description, children, footer, onClose, className }: DialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-[3px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={cn(
          'w-full max-w-md overflow-hidden rounded-app border border-border bg-surface shadow-2xl ring-1 ring-black/5',
          className
        )}
      >
        <div className="border-b border-border bg-background/70 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="dialog-title" className="text-base font-semibold tracking-normal">
                {title}
              </h2>
              {description ? <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p> : null}
            </div>
            <button
              className="rounded-app p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Close dialog"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-border bg-background/80 px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}
