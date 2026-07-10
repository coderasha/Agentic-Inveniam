import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variants: Record<Variant, string> = {
  primary:
    'bg-[var(--gain-accent)] hover:bg-[var(--gain-accent-strong)] text-white',
  secondary:
    'bg-[var(--gain-bg-soft)] hover:bg-[var(--gain-border)] text-[var(--gain-text)] border border-[var(--gain-border)]',
  ghost: 'bg-transparent hover:bg-[var(--gain-bg-soft)] text-[var(--gain-text)]',
  danger: 'bg-[var(--gain-danger)] hover:opacity-90 text-white',
};

export function Button({
  className,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
