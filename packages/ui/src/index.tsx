import type { ReactNode, ButtonHTMLAttributes } from "react";

export function Button({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md bg-[var(--bd-accent)] px-4 py-2 text-sm font-medium text-[var(--bd-accent-fg)] transition hover:opacity-90 disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function CardShell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-[var(--bd-border)] bg-[var(--bd-surface)] p-4 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-[var(--bd-muted)]">{label}</div>
      <div className="text-lg font-semibold text-[var(--bd-fg)]">{value}</div>
    </div>
  );
}
