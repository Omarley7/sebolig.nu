import "dotenv/config";

import type { CachedAppointmentEntry } from "@/types";
import { UserData } from "@/types";
import {
  apiResidenceToDomain,
  apiUserDataToDomain,
  mapAppointmentToDomain,
  mapOfferToDomain,
  mapWaitingListToDomain,
} from "~/lib/findbolig-domain";
import type { ApiOffer, ApiOffersPage, ApiUserData } from "~/types/offers";
import type { ApiResidence } from "~/types/residences";
import type { ApiMessageThreadFull, ApiMessageThreadsPage } from "~/types/threads";
import type { ApiPositionForProperty, ApiPropertySearchPage, ApiResidenceApplication } from "~/types/waiting-lists";
import { extractAppointmentDetailsFromShowingText, extractAppointmentDetailsWithLLM } from "./lib/llm/openai-extractor";

const BASE_URL = "https://findbolig.nu";

// Timeout constants (milliseconds)
const TIMEOUT_LOGIN = 10_000; // 10s – user is waiting on a modal
const TIMEOUT_REFRESH = 10_000; // 10s – background session check
const TIMEOUT_DATA = 20_000; // 20s – heavier data fetches

// How many offers to pull per page when walking the updated-desc listing for a delta check.
const DELTA_PAGE_SIZE = 25;

export class TimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs / 1000}s`);
    this.name = "TimeoutError";
  }
}

export class UpstreamHttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "UpstreamHttpError";
    this.status = status;
  }
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new TimeoutError(url, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Authenticated request to findbolig.nu — sets the JSON + cookie headers every upstream call needs. */
function upstreamFetch(path: string, cookies: string, init: RequestInit = {}, timeoutMs: number = TIMEOUT_DATA): Promise<Response> {
  return fetchWithTimeout(
    `${BASE_URL}${path}`,
    {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: cookies,
        ...init.headers,
      },
    },
    timeoutMs,
  );
}

/**
 * Performs initial GET and login to establish authenticated session
 * Returns the Set-Cookie headers if successful
 */
export async function login(email: string, password: string): Promise<(UserData & { cookies: string[] }) | null> {
  try {
    // Initial GET to receive __Secure-SID cookie
    const initialRes = await fetchWithTimeout(BASE_URL, { redirect: "follow" }, TIMEOUT_LOGIN);
    const initialCookies = initialRes.headers.getSetCookie();

    // Perform login with initial cookies
    const cookieHeader = initialCookies.join("; ");
    const res = await fetchWithTimeout(
      `${BASE_URL}/api/authentication/login`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(cookieHeader && { Cookie: cookieHeader }),
        },
        body: JSON.stringify({ email, password }),
      },
      TIMEOUT_LOGIN,
    );

    if (!res.ok) {
      return null;
    }
    // Combine cookies from both requests
    return apiUserDataToDomain((await res.json()) as ApiUserData, [...initialCookies, ...res.headers.getSetCookie()]);
  } catch (error) {
    console.error("Login failed:", error);
    return null;
  }
}

export interface FetchOffersOptions {
  orderBy?: string;
  orderDirection?: "asc" | "desc";
  pageSize?: number;
  page?: number;
  filters?: Record<string, unknown>;
  search?: string | null;
}

/**
 * Fetches offers from the API (requires prior authentication)
 */
export async function fetchOffers(cookies: string, options: FetchOffersOptions = {}): Promise<ApiOffersPage> {
  const { orderBy = "created", orderDirection = "desc", pageSize = 2147483647, page = 0, filters = {}, search = null } = options;

  const res = await upstreamFetch(
    "/api/search/offers",
    cookies,
    {
      method: "POST",
      body: JSON.stringify({ search, filters, pageSize, page, orderDirection, orderBy }),
    },
    TIMEOUT_DATA,
  );

  if (!res.ok) {
    throw new UpstreamHttpError(`Failed to fetch offers: ${res.status}`, res.status);
  }

  return (await res.json()) as ApiOffersPage;
}

/**
 * Fetches message threads from the API (requires prior authentication)
 */
export async function fetchThreads(cookies: string): Promise<ApiMessageThreadsPage> {
  const res = await upstreamFetch(
    "/api/communications/threads",
    cookies,
    {
      method: "POST",
      body: JSON.stringify({ page: 0, pageSize: 100, orderDirection: "DESC" }),
    },
    TIMEOUT_DATA,
  );

  if (!res.ok) {
    throw new UpstreamHttpError(`Failed to fetch threads: ${res.status}`, res.status);
  }

  return (await res.json()) as ApiMessageThreadsPage;
}

/** Fetches the position on an offer */
export async function getPositionOnOffer(offerId: string, cookies: string) {
  const res = await upstreamFetch(`/api/search/waiting-lists/applicants/position-on-offer/${offerId}`, cookies, { method: "GET" });

  if (!res.ok) {
    throw new UpstreamHttpError(`Failed to fetch position on offer: ${res.status}: ${res.statusText}`, res.status);
  }

  return res.json();
}

/** Fetches a residence by ID */
export async function getResidence(residenceId: string, cookies: string) {
  const res = await upstreamFetch(`/api/models/residence/${residenceId}`, cookies, { method: "GET" });

  if (!res.ok) {
    throw new UpstreamHttpError(`Failed to fetch residence: ${res.status}: ${res.statusText}`, res.status);
  }
  const data = await res.json();
  return apiResidenceToDomain(data as ApiResidence);
}

/** Fetches the message thread for an offer */
export async function getThreadForOffer(offerId: string, cookies: string): Promise<ApiMessageThreadFull | null> {
  const res = await upstreamFetch(`/api/communications/messages/thread/related-to/${offerId}`, cookies, { method: "GET" });

  if (!res.ok) {
    throw new UpstreamHttpError(`Failed to fetch thread for offer: ${res.status}: ${res.statusText}`, res.status);
  }

  const text = await res.text();
  if (!text) {
    return null;
  }

  return JSON.parse(text) as ApiMessageThreadFull;
}

function isDateInPast(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dateStr < today;
}

/**
 * Fetches upcoming appointments with optional incremental sync.
 * When `cached` is provided, the server skips expensive work for past and unchanged appointments.
 * @param includeAll - If true, fetches all offers; if false, only fetches active offers (Finished/Published)
 * @param cached - Optional cached appointment entries from the client for incremental sync
 */
export async function getUpcomingAppointments(cookies: string, includeAll: boolean = false, cached?: CachedAppointmentEntry[]) {
  try {
    let offers = (await fetchOffers(cookies)).results;

    if (!includeAll) {
      offers = offers.filter((offer) => offer.state === "Finished" || offer.state === "Published");
    }

    const cacheMap = new Map((cached ?? []).map((entry) => [entry.offerId, entry]));

    const currentYear = new Date().getFullYear().toString();

    const results = await Promise.all(
      offers.map(async (offer) => {
        if (!offer.residenceId || !offer.id) {
          return null;
        }

        const cachedEntry = cacheMap.get(offer.id);

        // Path 1: Past appointment with cached data — echo back as-is
        if (cachedEntry && isDateInPast(cachedEntry.date)) {
          return cachedEntry.appointment;
        }

        // Fetch thread (needed for Path 2 comparison and Path 3 extraction)
        const [residence, thread, position] = await Promise.all([
          getResidence(offer.residenceId, cookies),
          getThreadForOffer(offer.id, cookies),
          getPositionOnOffer(offer.id, cookies).catch(() => null),
        ]);

        if (!thread) {
          return null;
        }

        // Path 2: Unchanged thread — skip LLM, reuse cached details
        if (cachedEntry && thread.messages.length === cachedEntry.messageCount) {
          const details = {
            date: cachedEntry.appointment.date ?? "",
            startTime: cachedEntry.appointment.start ?? "",
            endTime: cachedEntry.appointment.end ?? "",
            cancelled: cachedEntry.appointment.cancelled,
          };
          return mapAppointmentToDomain({
            offer,
            residence,
            details,
            position,
            messageCount: thread.messages.length,
          });
        }

        // Path 3: New or changed — full LLM extraction
        let details = await extractAppointmentDetailsWithLLM(thread, currentYear);

        if (!details.date && offer.showingText) {
          const showingDetails = await extractAppointmentDetailsFromShowingText(offer.showingText, currentYear);
          if (showingDetails.date && (showingDetails.startTime || showingDetails.endTime)) {
            details = showingDetails;
          }
        }

        return mapAppointmentToDomain({
          offer,
          residence,
          details,
          position,
          messageCount: thread.messages.length,
        });
      }),
    );

    return results.filter((a): a is NonNullable<typeof a> => a !== null);
  } catch (error) {
    console.error("Failed to fetch upcoming appointments:", error);
    throw error;
  }
}

/** Fetches residence + waiting-list position for an offer and maps it to the domain `Offer` shape, or null if either lookup fails. */
async function enrichOffer(offer: ApiOffer, cookies: string) {
  if (!offer.residenceId || !offer.id) return null;
  try {
    const [residence, position] = await Promise.all([
      getResidence(offer.residenceId, cookies),
      getPositionOnOffer(offer.id, cookies).catch(() => null),
    ]);
    return mapOfferToDomain({ offer, residence, position });
  } catch (error) {
    console.error(`Failed to load residence for offer ${offer.id}:`, error);
    return null;
  }
}

/** Fetches active (Published) offers with residence data eagerly loaded, alongside the current `updated` high-water mark. */
export async function getActiveOffers(cookies: string) {
  // Sorted by updated desc so results[0].updated is cheaply the latest touch on any of this
  // user's offers — the same cursor semantics `getOfferUpdates` below compares against.
  const offersPage = await fetchOffers(cookies, { orderBy: "updated", orderDirection: "desc" });
  const latestUpdated = offersPage.results[0]?.updated ?? null;

  const publishedOffers = offersPage.results.filter((offer) => offer.state === "Published");
  const enriched = await Promise.all(publishedOffers.map((offer) => enrichOffer(offer, cookies)));

  return {
    offers: enriched.filter((o): o is NonNullable<typeof o> => o !== null),
    latestUpdated,
  };
}

/**
 * Walks the updated-desc offer listing, collecting every offer touched after `since`.
 * Paginates using `totalResults` rather than trusting a single page, so accounts with
 * more changes than fit on one page (a busy user, or one who hasn't checked in a while)
 * don't silently lose updates.
 *
 * `since` must be an `updated` value this server previously returned (i.e. findbolig.nu's
 * own clock) — never a client-generated timestamp. Comparing against a browser's local
 * clock risks clock skew between the two systems silently hiding or duplicating changes.
 */
async function getOffersUpdatedSince(cookies: string, since: string): Promise<{ changed: ApiOffer[]; latestUpdated: string | null }> {
  const sinceMs = new Date(since).getTime();
  const changed: ApiOffer[] = [];
  let latestUpdated: string | null = null;
  let page = 0;

  while (true) {
    const { results, totalResults } = await fetchOffers(cookies, {
      page,
      pageSize: DELTA_PAGE_SIZE,
      orderBy: "updated",
      orderDirection: "desc",
    });

    if (page === 0) {
      latestUpdated = results[0]?.updated ?? null;
    }

    for (const offer of results) {
      if (new Date(offer.updated).getTime() <= sinceMs) {
        // Sorted desc — once we hit one this old, everything after it is too.
        return { changed, latestUpdated };
      }
      changed.push(offer);
    }

    page += 1;
    if (results.length === 0 || page * DELTA_PAGE_SIZE >= totalResults) {
      return { changed, latestUpdated };
    }
  }
}

/**
 * Lightweight delta check for the offers list: finds what changed since `since` and only
 * pays the residence/position enrichment cost (2 upstream calls per offer) for those offers,
 * instead of re-enriching every active offer on every navigation.
 */
export async function getOfferUpdates(cookies: string, since: string) {
  const { changed, latestUpdated } = await getOffersUpdatedSince(cookies, since);

  const stillPublished = changed.filter((offer) => offer.state === "Published");
  const removedIds = changed.filter((offer) => offer.state !== "Published").map((offer) => offer.id);

  const enriched = await Promise.all(stillPublished.map((offer) => enrichOffer(offer, cookies)));

  return {
    offers: enriched.filter((o): o is NonNullable<typeof o> => o !== null),
    removedIds,
    latestUpdated,
  };
}

/** Accepts an offer on findbolig.nu */
export async function acceptOffer(offerId: string, cookies: string) {
  const res = await upstreamFetch(`/api/data/offers/${offerId}/accept`, cookies, { method: "POST" });
  if (!res.ok) {
    throw new UpstreamHttpError(`Failed to accept offer: ${res.status}`, res.status);
  }
  return (await res.json()) as ApiOffer;
}

/** Declines an offer on findbolig.nu */
export async function declineOffer(offerId: string, cookies: string) {
  const res = await upstreamFetch(`/api/data/offers/${offerId}/decline`, cookies, { method: "POST" });
  if (!res.ok) {
    throw new UpstreamHttpError(`Failed to decline offer: ${res.status}`, res.status);
  }
  return (await res.json()) as ApiOffer;
}

/** Fetches the user data */
export async function getUserData(cookies: string) {
  const res = await upstreamFetch("/api/users/me", cookies, { method: "GET" });

  if (!res.ok) {
    throw new UpstreamHttpError(`Failed to fetch user data: ${res.status}`, res.status);
  }

  return res.json();
}

/**
 * Refreshes the session by calling an authenticated endpoint. If the upstream
 * returns new Set-Cookie headers they will be returned alongside the user data
 * so the client can update its stored cookie header.
 */
export async function refreshSession(cookies: string) {
  const res = await upstreamFetch("/api/users/me", cookies, { method: "GET" }, TIMEOUT_REFRESH);

  if (!res.ok) {
    return null;
  }

  // Return the mapped user data together with any Set-Cookie headers
  return apiUserDataToDomain((await res.json()) as ApiUserData, res.headers.getSetCookie() ?? []);
}

/** Fetches raw residence-application rows (one per applied residence) for the current user. */
export async function fetchResidenceApplications(cookies: string): Promise<ApiResidenceApplication[]> {
  const res = await upstreamFetch("/api/data/residence-applications", cookies, { method: "GET" });

  if (!res.ok) {
    throw new UpstreamHttpError(`Failed to fetch residence applications: ${res.status}`, res.status);
  }

  return (await res.json()) as ApiResidenceApplication[];
}

/** Fetches property metadata for a batch of propertyIds using the search endpoint. */
export async function searchPropertiesByIds(propertyIds: string[], cookies: string): Promise<ApiPropertySearchPage["results"]> {
  if (propertyIds.length === 0) return [];

  const res = await upstreamFetch("/api/search", cookies, {
    method: "POST",
    body: JSON.stringify({ filters: { propertyId: propertyIds }, mixedResults: true, pageSize: propertyIds.length }),
  });

  if (!res.ok) {
    throw new UpstreamHttpError(`Failed to search properties: ${res.status}`, res.status);
  }

  const data = (await res.json()) as ApiPropertySearchPage;
  return data.results ?? [];
}

/** Fetches the user's waiting-list position info for a property. Shape varies; see extractBestPosition. */
export async function getPositionForProperty(propertyId: string, cookies: string): Promise<ApiPositionForProperty | null> {
  const res = await upstreamFetch(`/api/search/waiting-lists/applicants/position-for-property/${propertyId}`, cookies, { method: "GET" });

  if (!res.ok) {
    throw new UpstreamHttpError(`Failed to fetch position for property ${propertyId}: ${res.status}`, res.status);
  }

  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text) as ApiPositionForProperty;
}

/** Reactivates a waiting list (property-level). Upstream uses PUT and returns 204. */
export async function setWaitingListActive(propertyId: string, cookies: string): Promise<void> {
  const res = await upstreamFetch(`/api/data/residence-applications/property/${propertyId}/set-active`, cookies, { method: "PUT" });

  if (!res.ok) {
    throw new UpstreamHttpError(`Failed to set waiting list active for property ${propertyId}: ${res.status}`, res.status);
  }
}

/** Unsubscribes the user from a waiting list (property-level). Upstream returns 204. */
export async function unsubscribeFromWaitingList(propertyId: string, cookies: string): Promise<void> {
  const res = await upstreamFetch(`/api/data/residence-applications/property/${propertyId}`, cookies, { method: "DELETE" });

  if (!res.ok) {
    throw new UpstreamHttpError(`Failed to unsubscribe from waiting list for property ${propertyId}: ${res.status}`, res.status);
  }
}

/** Minimal concurrency limiter — runs at most `limit` tasks in parallel, preserving input order. */
async function pLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Aggregates per-residence application rows into per-property WaitingList objects,
 * enriching with property metadata (from /api/search) and best-position info.
 */
export async function getWaitingLists(cookies: string) {
  const applications = await fetchResidenceApplications(cookies);

  // Group by propertyId
  const byProperty = new Map<string, ApiResidenceApplication[]>();
  for (const app of applications) {
    const list = byProperty.get(app.propertyId);
    if (list) list.push(app);
    else byProperty.set(app.propertyId, [app]);
  }

  const propertyIds = Array.from(byProperty.keys());
  if (propertyIds.length === 0) return [];

  // One batched search for all properties
  const properties = await searchPropertiesByIds(propertyIds, cookies);
  const propertyById = new Map(properties.map((p) => [p.id, p]));

  // Per-property position fetches with concurrency cap 5
  const positions = await pLimit(propertyIds, 5, async (propertyId) => {
    try {
      return await getPositionForProperty(propertyId, cookies);
    } catch (err) {
      console.warn(`Position fetch failed for ${propertyId}:`, err);
      return null;
    }
  });

  // Map and merge
  const lists = propertyIds.map((propertyId, i) => {
    const property = propertyById.get(propertyId);
    if (!property) {
      console.warn(`No property metadata found for ${propertyId} — skipping`);
      return null;
    }
    const apps = byProperty.get(propertyId)!;
    return mapWaitingListToDomain({
      applications: apps,
      property,
      position: positions[i],
    });
  });

  return lists.filter((l): l is NonNullable<typeof l> => l !== null);
}
