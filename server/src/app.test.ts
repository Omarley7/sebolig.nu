import { test } from "node:test";
import assert from "node:assert/strict";
import type { FindboligService } from "./app";
import { TimeoutError, UnreachableError, UpstreamHttpError } from "./lib/errors";

// session.ts throws at import time unless COOKIE_SECRET is set.
process.env.COOKIE_SECRET ||= "x".repeat(32);
const { createApp } = await import("./app");
const { sealSession, parseCookies } = await import("./lib/session");

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

/**
 * A fake findbolig.nu. Only the methods given in `overrides` exist; touching
 * anything else fails the test, so a test can never reach the real site.
 */
function fakeFindbolig(overrides: Partial<FindboligService> = {}): FindboligService {
  return new Proxy(overrides as FindboligService, {
    get: (target, prop) => {
      if (prop in target) return target[prop as keyof FindboligService];
      return () => {
        throw new Error(`findbolig.nu must not be contacted in this test (called ${String(prop)})`);
      };
    },
  });
}

const unreachableFindbolig = () => fakeFindbolig();

const TENANT = { email: "tenant@example.com", fullName: "Test Tenant" };
const FB_LOGIN_COOKIES = [
  "__Secure-SID=sid123; path=/; secure; httponly",
  ".AspNet.Cookies=ticket456; path=/; secure; httponly; samesite=lax",
];

function connect(
  app: ReturnType<typeof createApp>,
  credentials = { email: TENANT.email, password: "pw" },
) {
  return app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
}

/** Cookie attributes of the `session` Set-Cookie header, lower-cased names. */
function sessionCookieAttrs(res: Response): Record<string, string | true> | null {
  const header = res.headers.getSetCookie().find((c) => c.startsWith("session="));
  if (!header) return null;
  const [, ...attrs] = header.split(";").map((s) => s.trim());
  return Object.fromEntries(
    attrs.map((a) => {
      const i = a.indexOf("=");
      return i === -1 ? [a.toLowerCase(), true] : [a.slice(0, i).toLowerCase(), a.slice(i + 1)];
    }),
  );
}

test("a request with no cookie is not connected: 401 and no reason", async () => {
  const app = createApp({ findbolig: unreachableFindbolig() });

  const res = await app.request("/api/appointments/upcoming");

  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error, "Authentication required");
  assert.equal("reason" in body, false, `unexpected reason in ${JSON.stringify(body)}`);
});

test("connecting sets a Connection cookie that lives 30 days, HttpOnly, scoped to the API", async () => {
  const app = createApp({
    findbolig: fakeFindbolig({
      login: async () => ({ ...TENANT, cookies: FB_LOGIN_COOKIES }),
    }),
  });

  const res = await connect(app);

  assert.equal(res.status, 200);
  const attrs = sessionCookieAttrs(res);
  assert.ok(attrs, "no session cookie was set");
  assert.equal(attrs["max-age"], String(THIRTY_DAYS_SECONDS));
  assert.equal(attrs.httponly, true);
  assert.equal(attrs.path, "/api");
  assert.equal(attrs.samesite?.toString().toLowerCase(), "lax");
});

/** A request carrying a live Connection for TENANT. */
async function connectedHeaders(): Promise<HeadersInit> {
  const sealed = await sealSession({
    fbCookies: parseCookies(FB_LOGIN_COOKIES),
    fbEmail: TENANT.email,
    fbPassword: "pw",
    fullName: TENANT.fullName,
    email: TENANT.email,
  });
  return { Cookie: `session=${sealed}` };
}

test("refreshing a live Connection renews it for another 30 days", async () => {
  const app = createApp({
    findbolig: fakeFindbolig({
      refreshSession: async () => ({ ...TENANT, cookies: [] }),
    }),
  });

  const res = await app.request("/api/auth/refresh", { headers: await connectedHeaders() });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), TENANT);
  const attrs = sessionCookieAttrs(res);
  assert.ok(attrs, "refresh did not re-issue the Connection cookie");
  assert.equal(attrs["max-age"], String(THIRTY_DAYS_SECONDS));
});

/** findbolig.nu's observed answer to a wrong email or password (2026-09-05). */
const rejectedCredentials = async () => {
  throw new UpstreamHttpError("Invalid username or password (errorCode 105)", 403);
};

test("refresh where findbolig.nu rejects the stored password ends the Connection with reason credentials_rejected", async () => {
  const app = createApp({
    findbolig: fakeFindbolig({
      refreshSession: async () => null,
      login: rejectedCredentials,
    }),
  });

  const res = await app.request("/api/auth/refresh", { headers: await connectedHeaders() });

  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.reason, "credentials_rejected");
  const attrs = sessionCookieAttrs(res);
  assert.ok(attrs, "the Connection cookie was not cleared");
  assert.equal(attrs["max-age"], "0");
});

const findboligTimesOut = async () => {
  throw new TimeoutError("https://findbolig.nu/api/authentication/login", 8000);
};

test("refresh where findbolig.nu times out keeps the Connection: 504 and no cookie change", async () => {
  const app = createApp({
    findbolig: fakeFindbolig({
      refreshSession: async () => null,
      login: findboligTimesOut,
    }),
  });

  const res = await app.request("/api/auth/refresh", { headers: await connectedHeaders() });

  assert.equal(res.status, 504);
  assert.equal((await res.json()).error, "timeout");
  assert.equal(sessionCookieAttrs(res), null, "the Connection cookie must not be touched");
});

test("a data route whose findbolig session expired and whose re-login is rejected behaves like refresh", async () => {
  const app = createApp({
    findbolig: fakeFindbolig({
      getUpcomingAppointments: async () => {
        throw new UpstreamHttpError("Failed to fetch appointments: 401", 401);
      },
      login: rejectedCredentials,
    }),
  });

  const res = await app.request("/api/appointments/upcoming", { headers: await connectedHeaders() });

  assert.equal(res.status, 401);
  assert.equal((await res.json()).reason, "credentials_rejected");
  assert.equal(sessionCookieAttrs(res)?.["max-age"], "0", "the Connection cookie was not cleared");
});

test("connecting with a wrong password is refused with 401 and no reason; nothing was ended", async () => {
  const app = createApp({ findbolig: fakeFindbolig({ login: rejectedCredentials }) });

  const res = await connect(app, { email: TENANT.email, password: "wrong" });

  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error, "Invalid email or password");
  assert.equal("reason" in body, false, `unexpected reason in ${JSON.stringify(body)}`);
  assert.equal(sessionCookieAttrs(res), null);
});

test("refresh where the re-login yields no findbolig session ends the Connection with reason session_expired", async () => {
  const app = createApp({
    findbolig: fakeFindbolig({
      refreshSession: async () => null,
      login: async () => ({ ...TENANT, cookies: [] }),
    }),
  });

  const res = await app.request("/api/auth/refresh", { headers: await connectedHeaders() });

  assert.equal(res.status, 401);
  assert.equal((await res.json()).reason, "session_expired");
  assert.equal(sessionCookieAttrs(res)?.["max-age"], "0", "the Connection cookie was not cleared");
});

test("refresh where findbolig.nu is unreachable keeps the Connection: 504 and no cookie change", async () => {
  const app = createApp({
    findbolig: fakeFindbolig({
      refreshSession: async () => null,
      login: async () => {
        throw new UnreachableError("https://findbolig.nu", new TypeError("fetch failed"));
      },
    }),
  });

  const res = await app.request("/api/auth/refresh", { headers: await connectedHeaders() });

  assert.equal(res.status, 504);
  assert.equal(sessionCookieAttrs(res), null, "the Connection cookie must not be touched");
});
