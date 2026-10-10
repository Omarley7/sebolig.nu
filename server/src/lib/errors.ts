import type { ConnectionEndedReason } from "@/types";

/**
 * The outcomes of talking to findbolig.nu, in domain terms. The findbolig client
 * turns status codes and transport failures into these; routes only ever see them.
 * Kept apart from the client so the app and its tests can refer to them without
 * importing the findbolig service (which pulls in dotenv and the LLM client).
 */

/** findbolig.nu is down or not responding. The Connection is kept. */
export class FindboligUnavailable extends Error {
  /** The 5xx findbolig.nu answered with; absent when it did not answer at all. */
  readonly status?: number;
  constructor(message: string, options: { status?: number; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "FindboligUnavailable";
    this.status = options.status;
  }
}

export class TimeoutError extends FindboligUnavailable {
  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs / 1000}s`);
    this.name = "TimeoutError";
  }
}

/** findbolig.nu could not be reached at all (DNS, connection refused, TLS, ...). */
export class UnreachableError extends FindboligUnavailable {
  constructor(url: string, cause: unknown) {
    super(`Request to ${url} failed: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    this.name = "UnreachableError";
  }
}

/** findbolig.nu answered, but not with anything we expected (e.g. a 403 or 404 on a data call). */
export class UpstreamError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
  }
}

/** findbolig.nu refused the email or password when connecting. No Connection exists. */
export class CredentialsRejected extends Error {
  constructor() {
    super("Invalid email or password");
    this.name = "CredentialsRejected";
  }
}

/** The Connection can no longer reach findbolig.nu on the user's behalf and must end. */
export class ConnectionEnded extends Error {
  readonly reason: ConnectionEndedReason;
  constructor(reason: ConnectionEndedReason) {
    super(
      reason === "credentials_rejected"
        ? "findbolig.nu rejected the stored password"
        : "findbolig session expired",
    );
    this.name = "ConnectionEnded";
    this.reason = reason;
  }
}
