import * as Iron from "iron-webcrypto";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Context } from "hono";

export interface SealedSession {
  fbCookies: string;
  fbEmail: string;
  fbPassword: string;
  fullName: string;
  email: string;
}

const COOKIE_NAME = "session";
const COOKIE_SECRET = process.env.COOKIE_SECRET;

if (!COOKIE_SECRET || COOKIE_SECRET.length < 32) {
  throw new Error("COOKIE_SECRET must be set and at least 32 characters long");
}

/** A Connection lives this long without use; every authenticated request renews it. */
const CONNECTION_IDLE_SECONDS = 30 * 24 * 60 * 60;

const SEAL_OPTIONS: Iron.SealOptions = {
  ...Iron.defaults,
  ttl: CONNECTION_IDLE_SECONDS * 1000, // matches the cookie so a payload never outlives its cookie, or vice versa
};

export async function sealSession(session: SealedSession): Promise<string> {
  return Iron.seal(session, COOKIE_SECRET!, SEAL_OPTIONS);
}

export async function unsealSession(sealed: string): Promise<SealedSession> {
  return Iron.unseal(sealed, COOKIE_SECRET!, SEAL_OPTIONS) as Promise<SealedSession>;
}

export async function getSessionFromCookie(c: Context): Promise<SealedSession | null> {
  const sealed = getCookie(c, COOKIE_NAME);
  if (!sealed) return null;
  try {
    return await unsealSession(sealed);
  } catch {
    return null;
  }
}

export async function setSessionCookie(c: Context, session: SealedSession): Promise<void> {
  const sealed = await sealSession(session);
  const isProduction = process.env.NODE_ENV === "production";
  setCookie(c, COOKIE_NAME, sealed, {
    path: "/api",
    httpOnly: true,
    secure: isProduction,
    sameSite: "Lax",
    maxAge: CONNECTION_IDLE_SECONDS,
  });
}

export async function clearSessionCookie(c: Context): Promise<void> {
  deleteCookie(c, COOKIE_NAME, { path: "/api" });
}

/**
 * Parse raw Set-Cookie headers into a Cookie header string.
 *
 * Behaves like a minimal cookie jar rather than a blind concatenation:
 * - de-duplicates by name (a later non-deletion value overwrites an earlier one)
 * - drops deletion cookies (empty value, Max-Age<=0, or a past Expires)
 *
 * This matters because findbolig.nu (ASP.NET Core / Kestrel) emits the real
 * `.AspNet.Cookies` auth ticket *and* a same-name deletion in the same login
 * response. Concatenating both produced a `Cookie` header with a duplicate,
 * empty `.AspNet.Cookies` that the server read instead of the real ticket —
 * causing 401s on every authenticated request.
 *
 * e.g. [".AspNet.Cookies=val; HttpOnly", ".AspNet.Cookies=; Expires=...1970"]
 *      -> ".AspNet.Cookies=val"
 */
export function parseCookies(setCookieHeaders: string[]): string {
  const jar = new Map<string, string>(); // name -> "name=value" segment
  for (const header of setCookieHeaders) {
    if (typeof header !== "string" || header.length === 0) continue;
    const segment = header.match(/^([^;]+)/)?.[1]?.trim();
    if (!segment) continue;
    const eq = segment.indexOf("=");
    if (eq === -1) continue;
    const name = segment.slice(0, eq).trim();
    if (!name) continue;
    const value = segment.slice(eq + 1).trim();
    if (isDeletionCookie(header, value)) {
      // Honor a deletion only if no real value has been captured for this name,
      // so a same-response set+delete pair keeps the real value.
      if (!jar.has(name)) jar.delete(name);
      continue;
    }
    jar.set(name, segment);
  }
  return [...jar.values()].join("; ");
}

function isDeletionCookie(header: string, value: string): boolean {
  if (value === "") return true;
  const maxAge = header.match(/max-age\s*=\s*(-?\d+)/i);
  if (maxAge && Number(maxAge[1]) <= 0) return true;
  const expires = header.match(/expires\s*=\s*([^;]+)/i);
  if (expires) {
    const ts = Date.parse(expires[1].trim());
    if (!Number.isNaN(ts) && ts <= Date.now()) return true;
  }
  return false;
}
