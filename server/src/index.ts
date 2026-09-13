import "~/lib/tls-setup";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import "dotenv/config";
import type { Context } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import * as findboligService from "~/findbolig-service";
import type { SyncAppointmentsRequest } from "@/types";
import { TimeoutError } from "~/findbolig-service";
import { AuthError, withReauth } from "~/lib/auth-helpers";
import { warmImages } from "~/lib/image-warmer";
import {
  setSessionCookie,
  clearSessionCookie,
  getSessionFromCookie,
  parseCookies,
  type SealedSession,
} from "~/lib/session";

function handleError(c: Context, error: unknown) {
  if (error instanceof AuthError) {
    return c.json({ error: error.message }, 401);
  }
  console.error(error);
  if (error instanceof TimeoutError) {
    return c.json(
      { error: "timeout", message: "findbolig.nu is not responding" },
      504
    );
  }
  return c.json({ error: "Internal server error" }, 500);
}

const app = new Hono();

app.get("/*", serveStatic({ root: "../client/dist" }));

app.notFound((c) => c.json({ error: "Not found", ok: false }, 404));

const api = new Hono();

const auth = new Hono().basePath("/auth");
const offers = new Hono().basePath("/offers");
const threads = new Hono().basePath("/threads");
const users = new Hono().basePath("/users");
const residences = new Hono().basePath("/residence");
const appointments = new Hono().basePath("/appointments");
const waitingLists = new Hono().basePath("/waiting-lists");

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
  try {
    const { email, password, remember } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    const result = await findboligService.login(email, password);
    if (!result?.cookies?.length) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    const session: SealedSession = {
      fbCookies: parseCookies(result.cookies),
      fbEmail: email,
      fbPassword: password,
      fullName: result.fullName,
      email: result.email,
    };

    await setSessionCookie(c, session, remember !== false);
    return c.json({ fullName: result.fullName, email: result.email });
  } catch (error) {
    return handleError(c, error);
  }
});

auth.post("/logout", async (c) => {
  await clearSessionCookie(c);
  return c.json({ ok: true });
});

auth.get("/refresh", async (c) => {
  try {
    const session = await getSessionFromCookie(c);
    if (!session) return c.json({ error: "Not authenticated" }, 401);

    const result = await findboligService.refreshSession(session.fbCookies);
    if (result) {
      // Update cookies if findbolig sent new ones
      if (result.cookies?.length) {
        session.fbCookies = parseCookies(result.cookies);
      }
      session.fullName = result.fullName;
      session.email = result.email;
      await setSessionCookie(c, session);
      return c.json({ fullName: result.fullName, email: result.email });
    }

    // findbolig session expired — try re-auth with stored credentials
    const fresh = await findboligService.login(
      session.fbEmail,
      session.fbPassword
    );
    if (!fresh?.cookies?.length) {
      await clearSessionCookie(c);
      return c.json({ error: "Session expired" }, 401);
    }

    session.fbCookies = parseCookies(fresh.cookies);
    session.fullName = fresh.fullName;
    session.email = fresh.email;
    await setSessionCookie(c, session);
    return c.json({ fullName: fresh.fullName, email: fresh.email });
  } catch (error) {
    return handleError(c, error);
  }
});

// ── Data routes (all use withReauth) ─────────────────────────

appointments.get("/upcoming", async (c) => {
  try {
    const includeAll = c.req.query("includeAll") === "true";
    const result = await withReauth(c, (cookies) =>
      findboligService.getUpcomingAppointments(cookies, includeAll)
    );
    warmImages(result);
    return c.json(result);
  } catch (error) {
    return handleError(c, error);
  }
});

appointments.post("/sync", async (c) => {
  try {
    const body = await c.req.json<SyncAppointmentsRequest>();
    const cached = Array.isArray(body?.cached) ? body.cached : [];
    const includeAll = body?.includeAll === true;
    const result = await withReauth(c, (cookies) =>
      findboligService.getUpcomingAppointments(cookies, includeAll, cached)
    );
    warmImages(result);
    return c.json(result);
  } catch (error) {
    return handleError(c, error);
  }
});

offers.get("/", async (c) => {
  try {
    const result = await withReauth(c, (cookies) =>
      findboligService.fetchOffers(cookies)
    );
    return c.json(result.results);
  } catch (error) {
    return handleError(c, error);
  }
});

offers.get("/active", async (c) => {
  try {
    const result = await withReauth(c, (cookies) =>
      findboligService.getActiveOffers(cookies)
    );
    warmImages(result);
    return c.json(result);
  } catch (error) {
    return handleError(c, error);
  }
});

offers.post("/:offerId/accept", async (c) => {
  try {
    const offerId = c.req.param("offerId");
    if (!offerId) return c.json({ error: "Offer ID is required" }, 400);
    const result = await withReauth(c, (cookies) =>
      findboligService.acceptOffer(offerId, cookies)
    );
    const recipientState = result.recipients?.[0]?.state ?? "OfferAccepted";
    return c.json({ recipientState });
  } catch (error) {
    return handleError(c, error);
  }
});

offers.post("/:offerId/decline", async (c) => {
  try {
    const offerId = c.req.param("offerId");
    if (!offerId) return c.json({ error: "Offer ID is required" }, 400);
    const result = await withReauth(c, (cookies) =>
      findboligService.declineOffer(offerId, cookies)
    );
    const recipientState = result.recipients?.[0]?.state ?? "OfferDeclined";
    return c.json({ recipientState });
  } catch (error) {
    return handleError(c, error);
  }
});

offers.get("/:offerId/position", async (c) => {
  try {
    const offerId = c.req.param("offerId");
    if (!offerId) return c.json({ error: "Offer ID is required" }, 400);
    const result = await withReauth(c, (cookies) =>
      findboligService.getPositionOnOffer(offerId, cookies)
    );
    return c.json(result);
  } catch (error) {
    return handleError(c, error);
  }
});

threads.get("/", async (c) => {
  try {
    const result = await withReauth(c, (cookies) =>
      findboligService.fetchThreads(cookies)
    );
    return c.json(result.results);
  } catch (error) {
    return handleError(c, error);
  }
});

users.get("/me", async (c) => {
  try {
    const result = await withReauth(c, (cookies) =>
      findboligService.getUserData(cookies)
    );
    return c.json(result);
  } catch (error) {
    return handleError(c, error);
  }
});

residences.get("/:residenceId", async (c) => {
  try {
    const residenceId = c.req.param("residenceId");
    const result = await withReauth(c, (cookies) =>
      findboligService.getResidence(residenceId, cookies)
    );
    return c.json(result);
  } catch (error) {
    return handleError(c, error);
  }
});

waitingLists.get("/", async (c) => {
  try {
    const result = await withReauth(c, (cookies) =>
      findboligService.getWaitingLists(cookies)
    );
    warmImages(result);
    return c.json(result);
  } catch (error) {
    return handleError(c, error);
  }
});

waitingLists.post("/:propertyId/set-active", async (c) => {
  try {
    const propertyId = c.req.param("propertyId");
    if (!propertyId) return c.json({ error: "Property ID is required" }, 400);
    await withReauth(c, (cookies) =>
      findboligService.setWaitingListActive(propertyId, cookies)
    );
    return c.json({ ok: true });
  } catch (error) {
    return handleError(c, error);
  }
});

waitingLists.delete("/:propertyId", async (c) => {
  try {
    const propertyId = c.req.param("propertyId");
    if (!propertyId) return c.json({ error: "Property ID is required" }, 400);
    await withReauth(c, (cookies) =>
      findboligService.unsubscribeFromWaitingList(propertyId, cookies)
    );
    return c.json({ ok: true });
  } catch (error) {
    return handleError(c, error);
  }
});

api.route("/", auth);
api.route("/", offers);
api.route("/", threads);
api.route("/", users);
api.route("/", residences);
api.route("/", appointments);
api.route("/", waitingLists);

app.route("/api", api);

// SPA fallback
app.get(
  "*",
  serveStatic({
    root: "../client/dist",
    rewriteRequestPath: () => "/index.html",
  })
);

const server = serve({ ...app, hostname: "0.0.0.0" }, (info) => {
  console.log(`Server is running on ${info.address}:${info.port}`);
});

process.on("SIGINT", () => {
  server.close();
  process.exit(0);
});
process.on("SIGTERM", () => {
  server.close((err) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    process.exit(0);
  });
});
