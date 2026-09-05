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

export class UpstreamHttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "UpstreamHttpError";
    this.status = status;
  }
}
