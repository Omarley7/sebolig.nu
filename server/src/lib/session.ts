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
