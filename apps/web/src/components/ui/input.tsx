import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-md border border-[var(--gain-border)] bg-[var(--gain-bg)] px-3 py-2 text-sm text-[var(--gain-text)] outline-none focus:border-[var(--gain-accent)] focus:ring-2 focus:ring-[rgba(61,139,253,0.25)] placeholder:text-[var(--gain-text-muted)]',
        className,
      )}
      {...props}
    />
  );
}
