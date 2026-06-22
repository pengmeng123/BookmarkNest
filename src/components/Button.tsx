import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '../lib/utils/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'xs' | 'sm' | 'md' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'border border-primary bg-primary text-primary-foreground shadow-sm hover:opacity-95',
  secondary: 'border border-border bg-surface text-foreground shadow-sm hover:border-primary/30 hover:bg-muted/70',
  ghost: 'text-foreground hover:bg-muted',
  danger: 'border border-danger/20 bg-danger text-white shadow-sm hover:opacity-95'
};

const sizes: Record<ButtonSize, string> = {
  xs: 'h-7 px-2 text-xs',
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  icon: 'h-8 w-8 p-0'
};

export function Button({ children, className, variant = 'secondary', size = 'md', ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-app font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
