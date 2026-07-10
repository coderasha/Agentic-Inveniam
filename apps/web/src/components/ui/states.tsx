import { Button } from '@/components/ui/button';

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-[var(--gain-text-muted)]">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      className="rounded-lg border border-[var(--gain-border)] bg-[var(--gain-bg-elevated)] p-10 text-sm text-[var(--gain-text-muted)]"
      role="status"
      aria-live="polite"
    >
      <div className="h-1 w-32 animate-pulse rounded bg-[var(--gain-border)] mb-4" />
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--gain-border)] bg-[rgba(18,26,43,0.55)] p-10 text-center">
      <h2 className="text-base font-medium">{title}</h2>
      <p className="mt-2 text-sm text-[var(--gain-text-muted)]">{description}</p>
      {actionLabel && onAction ? (
        <Button className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="rounded-lg border border-[rgba(240,113,120,0.4)] bg-[rgba(240,113,120,0.08)] p-6"
      role="alert"
    >
      <h2 className="text-sm font-semibold text-[var(--gain-danger)]">
        Something went wrong
      </h2>
      <p className="mt-2 text-sm text-[var(--gain-text-muted)]">{message}</p>
      {onRetry ? (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function DataTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--gain-border)] bg-[rgba(18,26,43,0.7)]">
      <table className="w-full text-left text-sm">
        <thead className="bg-[var(--gain-bg-soft)] text-[var(--gain-text-muted)]">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-4 py-3 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={index}
              className="border-t border-[var(--gain-border)] hover:bg-[rgba(61,139,253,0.05)]"
            >
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-3 align-middle">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
