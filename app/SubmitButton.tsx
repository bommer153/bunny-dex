"use client";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

/** Form button that shows a spinner and blocks double-clicks while the server action runs. */
export function SubmitButton({ className, disabled, pending: pendingText, children }: { className: string; disabled?: boolean; pending?: string; children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={disabled || pending} aria-busy={pending}>
      {pending ? <><span className="spinner" aria-hidden /> {pendingText ?? "Working…"}</> : children}
    </button>
  );
}
