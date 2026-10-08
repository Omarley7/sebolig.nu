import type { Context } from "hono";
import type { ConnectionEndedReason, UserData } from "@/types";
import {
  getSessionFromCookie,
  setSessionCookie,
  clearSessionCookie,
  parseCookies,
  type SealedSession,
} from "./session";
import { isUpstreamStatus } from "./errors";

export class AuthError extends Error {
  /** Set when the server ended a Connection; absent when there was none to begin with. */
  readonly reason?: ConnectionEndedReason;
  constructor(message: string = "Authentication required", reason?: ConnectionEndedReason) {
    super(message);
    this.name = "AuthError";
    this.reason = reason;
  }
}

/**
 * What silent re-authentication needs from findbolig.nu: a login that yields the
 * user and the findbolig session cookies, throws UpstreamHttpError(403) when the
 * credentials are rejected, and throws when findbolig.nu is not responding.
 */
export interface Reauthenticator {
  login(email: string, password: string): Promise<UserData & { cookies: string[] }>;
}

/**
 * Silent re-authentication, shared by the refresh route and the data-route wrapper
 * so the rejected-versus-unreachable split has exactly one implementation:
 * - findbolig.nu answers 403 (password changed): the Connection ends, the cookie is
 *   cleared, and the 401 carries `credentials_rejected`.
 * - the re-login yields no findbolig session for any other reason: the Connection ends with
 *   `findbolig_session_lost`.
 * - findbolig.nu is unreachable or times out: the error propagates and the Connection
 *   is kept; the cookie is left untouched.
 *
 * Returns the renewed session, already re-sealed into the cookie.
 */
export function createReauthenticate(findbolig: Reauthenticator) {
  return async function reauthenticate(c: Context, session: SealedSession): Promise<SealedSession> {
    let fresh;
    try {
      fresh = await findbolig.login(session.fbEmail, session.fbPassword);
    } catch (error) {
      if (isUpstreamStatus(error, 403)) {
        await clearSessionCookie(c);
        throw new AuthError("findbolig.nu rejected the stored password", "credentials_rejected");
      }
      throw error;
    }
    if (!fresh.cookies.length) {
      await clearSessionCookie(c);
      throw new AuthError("findbolig session expired", "findbolig_session_lost");
    }
    const renewed: SealedSession = {
      ...session,
      fbCookies: parseCookies(fresh.cookies),
      fullName: fresh.fullName,
      email: fresh.email,
    };
    await setSessionCookie(c, renewed);
    return renewed;
  };
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
  const reauthenticate = createReauthenticate(findbolig);

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
      if (isUpstreamStatus(error, 401)) {
        const renewed = await reauthenticate(c, session);
        return await fn(renewed.fbCookies);
      }
      throw error;
    }
  };
}
