import type { Context } from "hono";
import {
  getSessionFromCookie,
  setSessionCookie,
  clearSessionCookie,
  parseCookies,
  type SealedSession,
} from "./session";
import { UpstreamHttpError } from "./errors";

export class AuthError extends Error {
  constructor(message: string = "Authentication required") {
    super(message);
    this.name = "AuthError";
  }
}

/** The only thing silent re-authentication needs from findbolig.nu: a login that yields cookies, or nothing. */
export interface Reauthenticator {
  login(email: string, password: string): Promise<{ cookies: string[] } | null>;
}

/**
 * Builds the wrapper that gives every data route automatic findbolig session handling:
 * 1. Unseals the session cookie
 * 2. Calls fn with findbolig cookies
 * 3. On upstream 401: silently re-authenticates with the stored credentials and retries
 * 4. Re-seals the (possibly updated) session cookie
 *
 * The findbolig service is injected (and read lazily, per call) so the app can be
 * exercised against a fake findbolig.nu whose behaviour changes between requests.
 */
export function createWithReauth(findbolig: Reauthenticator) {
  async function reauth(session: SealedSession): Promise<SealedSession | null> {
    const result = await findbolig.login(session.fbEmail, session.fbPassword);
    if (!result?.cookies?.length) return null;
    return { ...session, fbCookies: parseCookies(result.cookies) };
  }

  return async function withReauth<T>(
    c: Context,
    fn: (cookies: string) => Promise<T>,
  ): Promise<T> {
    const session = await getSessionFromCookie(c);
    if (!session) throw new AuthError();

    try {
      const result = await fn(session.fbCookies);
      await setSessionCookie(c, session);
      return result;
    } catch (error) {
      if (isUpstream401(error)) {
        const refreshed = await reauth(session);
        if (!refreshed) {
          await clearSessionCookie(c);
          throw new AuthError("Session expired, please log in again");
        }
        await setSessionCookie(c, refreshed);
        return await fn(refreshed.fbCookies);
      }
      throw error;
    }
  };
}

function isUpstream401(error: unknown): boolean {
  return error instanceof UpstreamHttpError && error.status === 401;
}
