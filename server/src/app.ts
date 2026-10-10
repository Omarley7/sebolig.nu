import type { Context } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import type { SyncAppointmentsRequest } from "@/types";
import * as findbolig from "~/findbolig-service";
import {
  ConnectionEnded,
  CredentialsRejected,
  FindboligUnavailable,
} from "~/lib/errors";
import { FindboligClient, type FindboligTransport } from "~/lib/findbolig-client";
import { setSessionCookie, clearSessionCookie, getSessionFromCookie } from "~/lib/session";

export interface AppDeps {
  /** How to reach findbolig.nu: the HTTP transport in production, a fake findbolig.nu in tests. */
  transport: FindboligTransport;
}

/** Reads and validates the `since` query param shared by every delta endpoint. */
function parseSinceParam(c: Context): string | null {
  const since = c.req.query("since");
  if (!since || Number.isNaN(new Date(since).getTime())) return null;
  return since;
}

/** Reads the `sinceIds` query param shared by every delta endpoint — see `Delta.latestUpdatedIds`. */
function parseSinceIdsParam(c: Context): string[] {
  const sinceIds = c.req.query("sinceIds");
  if (!sinceIds) return [];
  return sinceIds.split(",").filter(Boolean);
}

function handleError(error: Error, c: Context) {
  if (error instanceof ConnectionEnded) {
    return c.json({ error: error.message, reason: error.reason }, 401);
  }
  console.error(error);
  if (error instanceof FindboligUnavailable) {
    return error.status
      ? c.json({ error: "upstream_unavailable", message: "findbolig.nu is not working right now" }, 502)
      : c.json({ error: "timeout", message: "findbolig.nu is not responding" }, 504);
  }
  return c.json({ error: "Internal server error" }, 500);
}

/**
 * Builds the API app. Listening and static file serving live in the entry
 * point, so importing this module has no side effects and tests can call
 * `createApp(...).request(...)` directly.
 */
export function createApp({ transport }: AppDeps) {
  /**
   * Gives a data route the Connection's findbolig client as `c.var.findbolig`. Afterwards it
   * clears the Connection cookie if the Connection ended, and otherwise always re-seals it, even
   * when the route failed: that renews the 30-day expiry and keeps any findbolig session renewed
   * on the way.
   */
  const withConnection = createMiddleware<{ Variables: { findbolig: FindboligClient } }>(async (c, next) => {
    const sealed = await getSessionFromCookie(c);
    if (!sealed) return c.json({ error: "Authentication required" }, 401);

    const client = FindboligClient.fromSession(transport, sealed);
    c.set("findbolig", client);
    await next();

    if (c.error instanceof ConnectionEnded) await clearSessionCookie(c);
    else await setSessionCookie(c, client.session);
  });

  const app = new Hono();

  app.notFound((c) => c.json({ error: "Not found", ok: false }, 404));
  app.onError(handleError);

  const api = new Hono();

  const auth = new Hono().basePath("/auth");
  const offers = new Hono().basePath("/offers").use(withConnection);
  const appointments = new Hono().basePath("/appointments").use(withConnection);
  const waitingLists = new Hono().basePath("/waiting-lists").use(withConnection);

  const ALLOWED_ORIGINS =
    process.env.NODE_ENV === "production"
      ? [] // same-origin in production — CORS not needed
      : [
          "http://localhost:5173",
          "http://0.0.0.0:5173",
          "http://localhost:3000",
          "http://0.0.0.0:3000",
        ];

  api.use(
    "/*",
    cors({
      origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? origin : ""),
      credentials: true,
    }),
    logger(),
    prettyJSON()
  );

  // ── Auth routes ──────────────────────────────────────────────

  auth.post("/login", async (c) => {
    const { email, password } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    const client = await FindboligClient.connect(transport, email, password).catch((error) => {
      // Nothing to end yet: a refused login and a login that grants no findbolig session read the same.
      if (error instanceof CredentialsRejected || error instanceof ConnectionEnded) return null;
      throw error;
    });
    if (!client) return c.json({ error: "Invalid email or password" }, 401);

    await setSessionCookie(c, client.session);
    return c.json({ fullName: client.session.fullName, email: client.session.email });
  });

  auth.post("/logout", async (c) => {
    await clearSessionCookie(c);
    return c.json({ ok: true });
  });

  auth.get("/refresh", withConnection, async (c) => c.json(await c.var.findbolig.whoAmI()));

  // ── Data routes ──────────────────────────────────────────────

  appointments.post("/sync", async (c) => {
    const body = await c.req.json<SyncAppointmentsRequest>();
    const cached = Array.isArray(body?.cached) ? body.cached : [];
    const includeAll = body?.includeAll === true;
    return c.json(await findbolig.getUpcomingAppointments(c.var.findbolig, includeAll, cached));
  });

  appointments.get("/delta", async (c) => {
    const since = parseSinceParam(c);
    if (!since) {
      return c.json({ error: "Query param 'since' (ISO timestamp) is required" }, 400);
    }
    const includeAll = c.req.query("includeAll") === "true";
    return c.json(await findbolig.getAppointmentUpdates(c.var.findbolig, since, includeAll, parseSinceIdsParam(c)));
  });

  offers.get("/active", async (c) => c.json(await findbolig.getActiveOffers(c.var.findbolig)));

  offers.get("/delta", async (c) => {
    const since = parseSinceParam(c);
    if (!since) {
      return c.json({ error: "Query param 'since' (ISO timestamp) is required" }, 400);
    }
    return c.json(await findbolig.getOfferUpdates(c.var.findbolig, since, parseSinceIdsParam(c)));
  });

  offers.post("/:offerId/accept", async (c) => c.json(await c.var.findbolig.acceptOffer(c.req.param("offerId"))));

  offers.post("/:offerId/decline", async (c) => c.json(await c.var.findbolig.declineOffer(c.req.param("offerId"))));

  waitingLists.get("/", async (c) => c.json(await findbolig.getWaitingLists(c.var.findbolig)));

  waitingLists.post("/:propertyId/set-active", async (c) => {
    await c.var.findbolig.setWaitingListActive(c.req.param("propertyId"));
    return c.json({ ok: true });
  });

  waitingLists.delete("/:propertyId", async (c) => {
    await c.var.findbolig.unsubscribeFromWaitingList(c.req.param("propertyId"));
    return c.json({ ok: true });
  });

  api.route("/", auth);
  api.route("/", offers);
  api.route("/", appointments);
  api.route("/", waitingLists);

  app.route("/api", api);

  return app;
}
