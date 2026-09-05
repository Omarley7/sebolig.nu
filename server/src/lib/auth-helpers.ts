import type { Context } from "hono";
import {
  getSessionFromCookie,
  setSessionCookie,
  clearSessionCookie,
  parseCookies,
  type SealedSession,
} from "./session";
import { UpstreamHttpError } from "./errors";
import type { FindboligService } from "~/app";

export class AuthError extends Error {
  constructor(message: string = "Authentication required") {
    super(message);
    this.name = "AuthError";
  }
}

export type WithReauth = <T>(c: Context, fn: (cookies: string) => Promise<T>) => Promise<T>;

/**
 * Builds the wrapper that gives every data route automatic session handling:
 * 1. Unseals the session cookie
 * 2. Calls fn with findbolig cookies
 * 3. On upstream 401: silently re-authenticates with the stored credentials and retries
 * 4. Re-seals the (possibly updated) session cookie
 *
 * `login` is injected so the app can be exercised against a fake findbolig.nu.
 */
export function createWithReauth(login: FindboligService["login"]): WithReauth {
  async function reauth(session: SealedSession): Promise<SealedSession | null> {
    const result = await login(session.fbEmail, session.fbPassword);
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
