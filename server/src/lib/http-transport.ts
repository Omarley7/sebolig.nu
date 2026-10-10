import { TimeoutError, UnreachableError } from "./errors";
import type { FindboligRequest, FindboligResponse, FindboligTransport } from "./findbolig-client";

const BASE_URL = "https://findbolig.nu";

/** The real findbolig.nu, over HTTPS. */
export const httpTransport: FindboligTransport = {
  async send({ method, path, body, cookie, timeoutMs }: FindboligRequest): Promise<FindboligResponse> {
    const url = `${BASE_URL}${path}`;
    const headers: Record<string, string> = {};
    // Only the API speaks JSON; the landing page that hands out __Secure-SID is plain HTML.
    if (path.startsWith("/api/")) {
      headers["Content-Type"] = "application/json";
      headers.Accept = "application/json";
    }
    if (cookie) headers.Cookie = cookie;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      return { status: res.status, setCookie: res.headers.getSetCookie(), json: parseJson(await res.text()) };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new TimeoutError(url, timeoutMs);
      }
      throw new UnreachableError(url, error);
    } finally {
      clearTimeout(timer);
    }
  },
};

/** findbolig.nu answers some calls with an empty body (e.g. "no thread") or HTML; both read as null. */
function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
