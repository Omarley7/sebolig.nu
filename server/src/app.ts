import type { Context } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import type { AppointmentDeltaRequest, SyncAppointmentsRequest } from "@/types";
import { getAppointmentUpdates, getUpcomingAppointments } from "~/appointments";
import {
  ConnectionEnded,
  CredentialsRejected,
  FindboligUnavailable,
} from "~/lib/errors";
import { FindboligClient, type FindboligTransport } from "~/lib/findbolig-client";
import type { AppointmentExtractor } from "~/lib/llm/appointment-extractor";
import { getActiveOffers, getOfferUpdates } from "~/offers";
import { getWaitingLists } from "~/waiting-lists";
import { setSessionCookie, clearSessionCookie, getSessionFromCookie } from "~/lib/session";
import type { ListingCursor } from "~/offer-listing";

export interface AppDeps {
  /** How to reach findbolig.nu: the HTTP transport in production, a fake findbolig.nu in tests. */
  transport: FindboligTransport;
  /** Reads appointment details out of message threads: OpenAI in production, a fake in tests. */
  extractor: AppointmentExtractor;
}

/** A delta cursor from a request, or null unless `since` is a valid timestamp. See `Delta.latestUpdatedIds`. */
function parseCursor(since: unknown, sinceIds: unknown): ListingCursor | null {
  if (typeof since !== "string" || Number.isNaN(new Date(since).getTime())) return null;
  return { since, sinceIds: Array.isArray(sinceIds) ? sinceIds.filter((id): id is string => typeof id === "string" && id !== "") : [] };
}

/** The cursor a `GET` delta route takes as `since` and comma-separated `sinceIds` query params. */
function cursorFromQuery(c: Context): ListingCursor | null {
  return parseCursor(c.req.query("since"), c.req.query("sinceIds")?.split(","));
}

const MISSING_SINCE = { error: "'since' (ISO timestamp) is required" };

/** The cached entries a request body carries, or none. */
function cachedFrom(body: { cached?: unknown } | null): SyncAppointmentsRequest["cached"] {
  return Array.isArray(body?.cached) ? body.cached : [];
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
export function createApp({ transport, extractor }: AppDeps) {
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
    const body = await c.req.json<SyncAppointmentsRequest>().catch(() => null);
    return c.json(await getUpcomingAppointments(c.var.findbolig, extractor, cachedFrom(body)));
  });

  appointments.post("/delta", async (c) => {
    const body = await c.req.json<AppointmentDeltaRequest>().catch(() => null);
    const cursor = parseCursor(body?.since, body?.sinceIds);
    if (!cursor) return c.json(MISSING_SINCE, 400);
    return c.json(await getAppointmentUpdates(c.var.findbolig, extractor, cursor, cachedFrom(body)));
  });

  offers.get("/active", async (c) => c.json(await getActiveOffers(c.var.findbolig)));

  offers.get("/delta", async (c) => {
    const cursor = cursorFromQuery(c);
    if (!cursor) return c.json(MISSING_SINCE, 400);
    return c.json(await getOfferUpdates(c.var.findbolig, cursor));
  });

  offers.post("/:offerId/accept", async (c) => c.json(await c.var.findbolig.acceptOffer(c.req.param("offerId"))));

  offers.post("/:offerId/decline", async (c) => c.json(await c.var.findbolig.declineOffer(c.req.param("offerId"))));

  waitingLists.get("/", async (c) => c.json(await getWaitingLists(c.var.findbolig)));

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
