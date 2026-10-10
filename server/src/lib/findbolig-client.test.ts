import { test } from "node:test";
import assert from "node:assert/strict";
import { FindboligClient } from "./findbolig-client";
import { FakeFindbolig } from "./fake-findbolig";
import { ConnectionEnded, CredentialsRejected, FindboligUnavailable } from "./errors";

const TENANT = { email: "tenant@example.com", password: "pw", fullName: "Test Tenant" };

function findboligWithTenant() {
  return new FakeFindbolig().addAccount(TENANT.email, TENANT.password, TENANT.fullName);
}

test("connecting keeps the real auth ticket and drops findbolig's same-name deletion", async () => {
  const fake = findboligWithTenant();

  const client = await FindboligClient.connect(fake, TENANT.email, TENANT.password);

  assert.equal(client.session.fbCookies, "__Secure-SID=sid-fake; .AspNet.Cookies=ticket-1");
  assert.equal(client.session.fullName, TENANT.fullName);
  assert.equal(client.session.email, TENANT.email);
  assert.equal(client.session.fbPassword, TENANT.password);
});

test("connecting with a wrong password is CredentialsRejected", async () => {
  const fake = findboligWithTenant();

  await assert.rejects(FindboligClient.connect(fake, TENANT.email, "wrong"), CredentialsRejected);
});

/** findbolig.nu's `/api/users/me` for TENANT. */
function servesWhoAmI(fake: FakeFindbolig) {
  return fake.on("GET /api/users/me", () => ({
    json: { email: TENANT.email, notifications: { fullName: TENANT.fullName } },
  }));
}

/** A client restored from a sealed Connection, as a route would get it. */
async function restoredClient(fake: FakeFindbolig) {
  const sealed = (await FindboligClient.connect(fake, TENANT.email, TENANT.password)).session;
  return FindboligClient.fromSession(fake, sealed);
}

test("a client restored from a sealed Connection reaches findbolig.nu with its findbolig session", async () => {
  const fake = servesWhoAmI(findboligWithTenant());
  const client = await restoredClient(fake);

  assert.deepEqual(await client.whoAmI(), { email: TENANT.email, fullName: TENANT.fullName });
  assert.equal(fake.loginCount, 1, "a live findbolig session needs no re-login");
});

test("an expired findbolig session is renewed silently and the call retried", async () => {
  const fake = servesWhoAmI(findboligWithTenant());
  const client = await restoredClient(fake);
  fake.expireSessions();

  assert.deepEqual(await client.whoAmI(), { email: TENANT.email, fullName: TENANT.fullName });
  assert.equal(fake.loginCount, 2, "exactly one re-login");
  assert.match(client.session.fbCookies, /\.AspNet\.Cookies=ticket-2/, "the renewed findbolig session is sealed");
});

/** Asserts that `promise` ends the Connection with `reason`. */
async function assertEndsConnection(promise: Promise<unknown>, reason: string) {
  await assert.rejects(promise, (error) => error instanceof ConnectionEnded && error.reason === reason);
}

test("renewal where findbolig.nu rejects the stored password ends the Connection with credentials_rejected", async () => {
  const fake = servesWhoAmI(findboligWithTenant());
  const client = await restoredClient(fake);
  fake.expireSessions();
  fake.changePassword(TENANT.email, "changed-on-findbolig");

  await assertEndsConnection(client.whoAmI(), "credentials_rejected");
});

test("renewal where the re-login grants no findbolig session ends the Connection with findbolig_session_lost", async () => {
  const fake = servesWhoAmI(findboligWithTenant());
  const client = await restoredClient(fake);
  fake.expireSessions();
  fake.loginWithoutSession = true;

  await assertEndsConnection(client.whoAmI(), "findbolig_session_lost");
});

test("a 401 straight after a fresh re-login ends the Connection with findbolig_session_lost instead of looping", async () => {
  const fake = findboligWithTenant().on("GET /api/users/me", () => ({ status: 401 }));
  const client = await restoredClient(fake);

  await assertEndsConnection(client.whoAmI(), "findbolig_session_lost");
  assert.equal(fake.loginCount, 2, "only one re-login is attempted");
});

test("parallel calls that all find the findbolig session expired share one re-login", async () => {
  const fake = servesWhoAmI(findboligWithTenant());
  const client = await restoredClient(fake);
  fake.expireSessions();

  const users = await Promise.all([client.whoAmI(), client.whoAmI(), client.whoAmI()]);

  assert.equal(users.length, 3);
  assert.equal(fake.loginCount, 2, "the initial connect plus a single shared re-login");
});

test("findbolig.nu answering 5xx is FindboligUnavailable and does not trigger a re-login", async () => {
  const fake = findboligWithTenant().on("GET /api/users/me", () => ({ status: 503 }));
  const client = await restoredClient(fake);

  await assert.rejects(client.whoAmI(), (error) => error instanceof FindboligUnavailable && error.status === 503);
  assert.equal(fake.loginCount, 1, "no re-login for a findbolig.nu outage");
});

test("renewal while findbolig.nu is down propagates FindboligUnavailable and keeps the Connection", async () => {
  const fake = servesWhoAmI(findboligWithTenant());
  const client = await restoredClient(fake);
  const before = client.session;
  fake.expireSessions();
  fake.loginOutage = "timeout";

  await assert.rejects(client.whoAmI(), FindboligUnavailable);
  assert.equal(fake.loginCount, 1, "the re-login never reached findbolig.nu's login");
  assert.deepEqual(client.session, before, "the sealed Connection is unchanged");
});

test("cookies findbolig.nu sets on a data call are merged into the findbolig session, not swapped for it", async () => {
  const fake = findboligWithTenant().on("GET /api/users/me", () => ({
    json: { email: TENANT.email, notifications: { fullName: TENANT.fullName } },
    setCookie: ["shell#lang=da; path=/; secure; samesite=lax"],
  }));
  const client = await restoredClient(fake);

  await client.whoAmI();

  assert.equal(client.session.fbCookies, "__Secure-SID=sid-fake; .AspNet.Cookies=ticket-1; shell#lang=da");
});

test("answering an offer returns the recipient state findbolig.nu reports, or the answer given when it reports none", async () => {
  const fake = findboligWithTenant()
    .on("POST /api/data/offers/o1/accept", () => ({ json: { id: "o1", recipients: [{ state: "OfferAccepted" }] } }))
    .on("POST /api/data/offers/o2/decline", () => ({ json: { id: "o2", recipients: [] } }));
  const client = await restoredClient(fake);

  assert.deepEqual(await client.acceptOffer("o1"), { recipientState: "OfferAccepted" });
  assert.deepEqual(await client.declineOffer("o2"), { recipientState: "OfferDeclined" });
});

test("within one response a set beats a same-name deletion in either order; a deletion alone removes the cookie", async () => {
  const fake = findboligWithTenant().on("GET /api/users/me", () => ({
    json: { email: TENANT.email, notifications: { fullName: TENANT.fullName } },
    setCookie: [
      ".AspNet.Cookies=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/",
      ".AspNet.Cookies=ticket-1; path=/",
      "__Secure-SID=; max-age=0; path=/",
    ],
  }));
  const client = await restoredClient(fake);

  await client.whoAmI();

  assert.equal(client.session.fbCookies, ".AspNet.Cookies=ticket-1");
});
