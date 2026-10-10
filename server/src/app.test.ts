import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeFindbolig } from "./lib/fake-findbolig";
import { FindboligClient } from "./lib/findbolig-client";
import { FakeExtractor } from "./lib/llm/fake-extractor";
import { apiResidence } from "./lib/test-fixtures";

// session.ts throws at import time unless COOKIE_SECRET is set.
process.env.COOKIE_SECRET ||= "x".repeat(32);
const { createApp } = await import("./app");
const { sealSession, unsealSession } = await import("./lib/session");

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

const TENANT = { email: "tenant@example.com", password: "pw", fullName: "Test Tenant" };

/** A fake findbolig.nu that knows TENANT and answers who they are. */
function findboligWithTenant() {
  return new FakeFindbolig()
    .addAccount(TENANT.email, TENANT.password, TENANT.fullName)
    .on("GET /api/users/me", () => ({
      json: { email: TENANT.email, notifications: { fullName: TENANT.fullName } },
    }));
}

function connect(app: ReturnType<typeof createApp>, credentials = { email: TENANT.email, password: TENANT.password }) {
  return app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
}

/** A request carrying a live Connection for TENANT, connected to `fake`. */
async function connectedHeaders(fake: FakeFindbolig): Promise<HeadersInit> {
  const client = await FindboligClient.connect(fake, TENANT.email, TENANT.password);
  return { Cookie: `session=${await sealSession(client.session)}` };
}

function sessionCookie(res: Response): string | null {
  return res.headers.getSetCookie().find((c) => c.startsWith("session=")) ?? null;
}

/** Cookie attributes of the `session` Set-Cookie header, lower-cased names. */
function sessionCookieAttrs(res: Response): Record<string, string | true> | null {
  const header = sessionCookie(res);
  if (!header) return null;
  const [, ...attrs] = header.split(";").map((s) => s.trim());
  return Object.fromEntries(
    attrs.map((a) => {
      const i = a.indexOf("=");
      return i === -1 ? [a.toLowerCase(), true] : [a.slice(0, i).toLowerCase(), a.slice(i + 1)];
    }),
  );
}

/** The Connection sealed into the response's `session` cookie. */
async function resealedSession(res: Response) {
  const header = sessionCookie(res);
  assert.ok(header, "the Connection cookie was not re-issued");
  return unsealSession(header.split(";")[0].slice("session=".length));
}

test("a request with no cookie is not connected: 401 and no reason", async () => {
  const fake = findboligWithTenant();
  const app = createApp({ transport: fake, extractor: new FakeExtractor() });

  const res = await app.request("/api/offers/active");

  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error, "Authentication required");
  assert.equal("reason" in body, false, `unexpected reason in ${JSON.stringify(body)}`);
  assert.equal(fake.requests.length, 0, "findbolig.nu must not be contacted");
});

test("connecting sets a Connection cookie that lives 30 days, HttpOnly, scoped to the API", async () => {
  const app = createApp({ transport: findboligWithTenant(), extractor: new FakeExtractor() });

  const res = await connect(app);

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { fullName: TENANT.fullName, email: TENANT.email });
  const attrs = sessionCookieAttrs(res);
  assert.ok(attrs, "no session cookie was set");
  assert.equal(attrs["max-age"], String(THIRTY_DAYS_SECONDS));
  assert.equal(attrs.httponly, true);
  assert.equal(attrs.path, "/api");
  assert.equal(attrs.samesite?.toString().toLowerCase(), "lax");
});

test("connecting with a wrong password is refused with 401 and no reason; nothing was ended", async () => {
  const app = createApp({ transport: findboligWithTenant(), extractor: new FakeExtractor() });

  const res = await connect(app, { email: TENANT.email, password: "wrong" });

  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error, "Invalid email or password");
  assert.equal("reason" in body, false, `unexpected reason in ${JSON.stringify(body)}`);
  assert.equal(sessionCookieAttrs(res), null);
});

test("checking a live Connection renews it for another 30 days", async () => {
  const fake = findboligWithTenant();
  const app = createApp({ transport: fake, extractor: new FakeExtractor() });

  const res = await app.request("/api/auth/refresh", { headers: await connectedHeaders(fake) });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { fullName: TENANT.fullName, email: TENANT.email });
  const attrs = sessionCookieAttrs(res);
  assert.ok(attrs, "refresh did not re-issue the Connection cookie");
  assert.equal(attrs["max-age"], String(THIRTY_DAYS_SECONDS));
});

test("checking a Connection whose findbolig session expired renews it silently and seals the new findbolig session", async () => {
  const fake = findboligWithTenant();
  const app = createApp({ transport: fake, extractor: new FakeExtractor() });
  const headers = await connectedHeaders(fake);
  fake.expireSessions();

  const res = await app.request("/api/auth/refresh", { headers });

  assert.equal(res.status, 200);
  assert.match((await resealedSession(res)).fbCookies, /\.AspNet\.Cookies=ticket-2/);
});

test("silent re-authentication where findbolig.nu rejects the stored password ends the Connection with reason credentials_rejected", async () => {
  const fake = findboligWithTenant();
  const app = createApp({ transport: fake, extractor: new FakeExtractor() });
  const headers = await connectedHeaders(fake);
  fake.expireSessions();
  fake.changePassword(TENANT.email, "changed-on-findbolig");

  const res = await app.request("/api/auth/refresh", { headers });

  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.reason, "credentials_rejected");
  const attrs = sessionCookieAttrs(res);
  assert.ok(attrs, "the Connection cookie was not cleared");
  assert.equal(attrs["max-age"], "0");
});

test("silent re-authentication where the re-login yields no findbolig session ends the Connection with reason findbolig_session_lost", async () => {
  const fake = findboligWithTenant();
  const app = createApp({ transport: fake, extractor: new FakeExtractor() });
  const headers = await connectedHeaders(fake);
  fake.expireSessions();
  fake.loginWithoutSession = true;

  const res = await app.request("/api/auth/refresh", { headers });

  assert.equal(res.status, 401);
  assert.equal((await res.json()).reason, "findbolig_session_lost");
  assert.equal(sessionCookieAttrs(res)?.["max-age"], "0", "the Connection cookie was not cleared");
});

for (const outage of ["timeout", "unreachable"] as const) {
  test(`silent re-authentication where findbolig.nu is ${outage} keeps the Connection: 504, Connection renewed`, async () => {
    const fake = findboligWithTenant();
    const app = createApp({ transport: fake, extractor: new FakeExtractor() });
    const headers = await connectedHeaders(fake);
    fake.expireSessions();
    fake.loginOutage = outage;

    const res = await app.request("/api/auth/refresh", { headers });

    assert.equal(res.status, 504);
    assert.equal((await res.json()).error, "timeout");
    assert.equal(sessionCookieAttrs(res)?.["max-age"], String(THIRTY_DAYS_SECONDS), "the Connection must be kept");
  });
}

/** A fake findbolig.nu with TENANT and no offers. */
function findboligWithNoOffers() {
  return findboligWithTenant().on("POST /api/search/offers", () => ({
    json: { facets: {}, totalResults: 0, page: 0, pageSize: 0, results: [] },
  }));
}

test("a data route on a live Connection answers and renews the Connection", async () => {
  const fake = findboligWithNoOffers();
  const app = createApp({ transport: fake, extractor: new FakeExtractor() });

  const res = await app.request("/api/offers/active", { headers: await connectedHeaders(fake) });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { offers: [], latestUpdated: null, latestUpdatedIds: [] });
  assert.equal(sessionCookieAttrs(res)?.["max-age"], String(THIRTY_DAYS_SECONDS));
});

test("a data route whose findbolig session expired and whose re-login is rejected behaves like the Connection check", async () => {
  const fake = findboligWithNoOffers();
  const app = createApp({ transport: fake, extractor: new FakeExtractor() });
  const headers = await connectedHeaders(fake);
  fake.expireSessions();
  fake.changePassword(TENANT.email, "changed-on-findbolig");

  const res = await app.request("/api/offers/active", { headers });

  assert.equal(res.status, 401);
  assert.equal((await res.json()).reason, "credentials_rejected");
  assert.equal(sessionCookieAttrs(res)?.["max-age"], "0", "the Connection cookie was not cleared");
});

test("findbolig.nu answering 5xx on a data route is 502 and keeps the Connection", async () => {
  const fake = findboligWithTenant().on("POST /api/search/offers", () => ({ status: 503 }));
  const app = createApp({ transport: fake, extractor: new FakeExtractor() });
  const headers = await connectedHeaders(fake);

  const res = await app.request("/api/offers/active", { headers });

  assert.equal(res.status, 502);
  assert.equal(sessionCookieAttrs(res)?.["max-age"], String(THIRTY_DAYS_SECONDS), "the Connection must be kept");
  assert.equal(fake.loginCount, 1, "a findbolig.nu outage is no reason to re-login");
});

test("a data route that fails after a successful silent re-authentication still seals the renewed findbolig session", async () => {
  const fake = findboligWithTenant().on("POST /api/search/offers", () => ({ status: 503 }));
  const app = createApp({ transport: fake, extractor: new FakeExtractor() });
  const headers = await connectedHeaders(fake);
  fake.expireSessions();

  const res = await app.request("/api/offers/active", { headers });

  assert.equal(res.status, 502);
  assert.match((await resealedSession(res)).fbCookies, /\.AspNet\.Cookies=ticket-2/);
});

test("findbolig.nu refusing a data call outright is a 500, not an ended Connection", async () => {
  const fake = findboligWithTenant().on("POST /api/data/offers/o1/accept", () => ({ status: 403 }));
  const app = createApp({ transport: fake, extractor: new FakeExtractor() });

  const res = await app.request("/api/offers/o1/accept", { method: "POST", headers: await connectedHeaders(fake) });

  assert.equal(res.status, 500);
  assert.equal("reason" in (await res.json()), false);
});

test("answering an offer reports the recipient state findbolig.nu now holds", async () => {
  const fake = findboligWithTenant().on("POST /api/data/offers/o1/accept", () => ({
    json: { id: "o1", recipients: [{ state: "OfferAccepted" }] },
  }));
  const app = createApp({ transport: fake, extractor: new FakeExtractor() });

  const res = await app.request("/api/offers/o1/accept", { method: "POST", headers: await connectedHeaders(fake) });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { recipientState: "OfferAccepted" });
});

test("disconnecting deletes the Connection cookie without contacting findbolig.nu", async () => {
  const fake = findboligWithTenant();
  const app = createApp({ transport: fake, extractor: new FakeExtractor() });
  const headers = await connectedHeaders(fake);
  const contactsBefore = fake.requests.length;

  const res = await app.request("/api/auth/logout", { method: "POST", headers });

  assert.equal(res.status, 200);
  const attrs = sessionCookieAttrs(res);
  assert.ok(attrs, "the Connection cookie was not cleared");
  assert.equal(attrs["max-age"], "0");
  assert.equal(attrs.path, "/api");
  assert.equal(fake.requests.length, contactsBefore, "findbolig.nu must not be contacted");
});

test("an ended Connection during offer enrichment ends the request and clears the Connection, instead of dropping the offer", async () => {
  const fake = findboligWithTenant()
    .on("POST /api/search/offers", () => ({
      json: { facets: {}, totalResults: 1, page: 0, pageSize: 25, results: [{ id: "o1", residenceId: "r1", state: "Published", updated: "2026-01-10T00:00:00.000Z" }] },
    }))
    .on("GET /api/models/residence/r1", () => ({ status: 401 }))
    .on("GET /api/search/waiting-lists/applicants/position-on-offer/o1", () => ({ status: 401 }));
  const app = createApp({ transport: fake, extractor: new FakeExtractor() });
  const headers = await connectedHeaders(fake);
  // findbolig.nu keeps refusing the residence, and silent re-authentication fails too.
  fake.changePassword(TENANT.email, "changed-on-findbolig");

  const res = await app.request("/api/offers/active", { headers });

  assert.equal(res.status, 401);
  assert.equal((await res.json()).reason, "credentials_rejected");
  assert.equal(sessionCookieAttrs(res)?.["max-age"], "0", "the Connection cookie was not cleared");
});

test("the appointments delta takes its cursor and the cached appointments in the body, and reuses an unchanged extraction", async () => {
  const T = "2026-01-10T00:00:00.000Z";
  const fake = findboligWithTenant()
    .on("POST /api/search/offers", () => ({
      json: { facets: {}, totalResults: 2, page: 0, pageSize: 25, results: [
        { id: "o1", residenceId: "r1", state: "Published", updated: T },
        { id: "o2", residenceId: "r2", state: "Published", updated: "2026-01-01T00:00:00.000Z" },
      ] },
    }))
    // A thread that was already extracted: it still has its 2 messages.
    .on("GET /api/communications/messages/thread/related-to/o1", () => ({ json: { messages: [{}, {}] } }))
    .on("GET /api/models/residence/r1", () => ({ json: apiResidence() }))
    .on("GET /api/search/waiting-lists/applicants/position-on-offer/o1", () => ({ json: 1 }));
  const extractor = new FakeExtractor();
  const app = createApp({ transport: fake, extractor });
  const cached = [{ offerId: "o1", messageCount: 2, date: "2099-01-01", appointment: { offerId: "o1", date: "2099-01-01", start: "16:00" } }];

  const res = await app.request("/api/appointments/delta", {
    method: "POST",
    headers: { ...(await connectedHeaders(fake)), "Content-Type": "application/json" },
    body: JSON.stringify({ since: "2026-01-05T00:00:00.000Z", sinceIds: [], cached }),
  });

  assert.equal(res.status, 200);
  const delta = await res.json();
  // o2 is older than the cursor and untouched; o1 keeps the details extracted before.
  assert.deepEqual(delta.items.map((a: { offerId: string; date: string; start: string }) => [a.offerId, a.date, a.start]), [["o1", "2099-01-01", "16:00"]]);
  assert.deepEqual([delta.removedIds, delta.latestUpdated, delta.latestUpdatedIds], [[], T, ["o1"]]);
  assert.equal(extractor.calls, 0, "an unchanged thread must not be extracted again");
});

test("the appointments delta without a valid since is a 400", async () => {
  const fake = findboligWithNoOffers();
  const app = createApp({ transport: fake, extractor: new FakeExtractor() });

  const res = await app.request("/api/appointments/delta", {
    method: "POST",
    headers: { ...(await connectedHeaders(fake)), "Content-Type": "application/json" },
    body: JSON.stringify({ since: "not a date", cached: [] }),
  });

  assert.equal(res.status, 400);
});
