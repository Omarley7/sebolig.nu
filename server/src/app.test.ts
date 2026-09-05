import { test } from "node:test";
import assert from "node:assert/strict";
import type { FindboligService } from "./app";

// session.ts throws at import time unless COOKIE_SECRET is set.
process.env.COOKIE_SECRET ||= "x".repeat(32);
const { createApp } = await import("./app");

/** A findbolig.nu that must never be reached by these tests. */
function unreachableFindbolig(): FindboligService {
  const fail = () => {
    throw new Error("findbolig.nu must not be contacted in this test");
  };
  return new Proxy({} as FindboligService, { get: () => fail });
}

test("a request with no cookie is not connected: 401 and no reason", async () => {
  const app = createApp({ findbolig: unreachableFindbolig() });

  const res = await app.request("/api/appointments/upcoming");

  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error, "Authentication required");
  assert.equal("reason" in body, false, `unexpected reason in ${JSON.stringify(body)}`);
});
