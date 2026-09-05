/**
 * Error types raised when talking to findbolig.nu. Kept apart from the
 * findbolig service so the app and its tests can refer to them without
 * importing the service itself (which pulls in dotenv and the LLM client).
 */
export class TimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs / 1000}s`);
    this.name = "TimeoutError";
  }
}

/** findbolig.nu could not be reached at all (DNS, connection refused, TLS, ...). */
export class UnreachableError extends Error {
  constructor(url: string, cause: unknown) {
    super(`Request to ${url} failed: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    this.name = "UnreachableError";
  }
}

export class UpstreamHttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "UpstreamHttpError";
    this.status = status;
  }
}

export function isUpstreamStatus(error: unknown, status: number): boolean {
  return error instanceof UpstreamHttpError && error.status === status;
}
