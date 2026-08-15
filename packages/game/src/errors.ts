import type { DomainErrorCode } from "@bunnydex/types";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: DomainErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}

export function assertFound<T>(value: T | null | undefined, message: string): T {
  if (value == null) {
    throw new DomainError("NOT_FOUND", message);
  }
  return value as T;
}
