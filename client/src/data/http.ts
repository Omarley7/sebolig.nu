import type { ConnectionEndedReason } from "@/types";
import config from "~/config";
import type { Cursor } from "./cursor";

export class HttpError extends Error {
  readonly status: number;
  /** Why the server ended the Connection, when a 401 body says so. */
  readonly reason?: ConnectionEndedReason;
  constructor(message: string, status: number, reason?: ConnectionEndedReason) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.reason = reason;
  }

  /** Builds the error from a failed response, keeping the reason a 401 body carries. */
  static async fromResponse(res: Response, failureMessage: string): Promise<HttpError> {
    const reason = res.status === 401 ? await readEndedReason(res) : undefined;
    return new HttpError(`${failureMessage}: ${res.status}`, res.status, reason);
  }
}

/** The reason a 401 body carries, if it is one the client knows how to react to. */
export async function readEndedReason(res: Response): Promise<ConnectionEndedReason | undefined> {
  const body = await res.json().catch(() => null);
  const reason = body?.reason;
  return reason === "credentials_rejected" || reason === "findbolig_session_lost" ? reason : undefined;
}

export function isTimeoutError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof HttpError && error.status === 504) return true;
  return false;
}

export async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/** The query string a delta route takes for a cursor. */
export function deltaQuery({ latestUpdated, latestUpdatedIds }: Cursor): string {
  const ids = latestUpdatedIds.length > 0 ? `&sinceIds=${encodeURIComponent(latestUpdatedIds.join(","))}` : "";
  return `since=${encodeURIComponent(latestUpdated)}${ids}`;
}

/**
 * A request to our own backend, carrying the sealed session cookie (see ADR-0001). Answers the parsed JSON body,
 * or throws an HttpError (keeping a 401's reason) for any non-2xx answer.
 */
export async function api<T>(
  path: string,
  init: RequestInit & { timeoutMs: number; failureMessage: string },
): Promise<T> {
  const { timeoutMs, failureMessage, ...options } = init;
  const res = await fetchWithTimeout(`${config.backendDomain}${path}`, { credentials: "include", ...options }, timeoutMs);
  if (!res.ok) throw await HttpError.fromResponse(res, failureMessage);
  return (await res.json().catch(() => null)) as T;
}
