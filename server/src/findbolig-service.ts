import "dotenv/config";

import type { CachedAppointmentEntry } from "@/types";
import { UserData } from "@/types";
import { apiResidenceToDomain, apiUserDataToDomain, mapAppointmentToDomain, mapOfferToDomain, mapWaitingListToDomain } from "~/lib/findbolig-domain";
import type { ApiOffer, ApiOffersPage, ApiUserData } from "~/types/offers";
import type { ApiResidence } from "~/types/residences";
import type {
  ApiMessageThreadFull,
  ApiMessageThreadsPage,
} from "~/types/threads";
import type { ApiPositionForProperty, ApiPropertySearchPage, ApiResidenceApplication } from "~/types/waiting-lists";
import { extractAppointmentDetailsFromShowingText, extractAppointmentDetailsWithLLM } from "./lib/llm/openai-extractor";

const BASE_URL = "https://findbolig.nu";

// Timeout constants (milliseconds)
const TIMEOUT_LOGIN = 10_000;     // 10s – user is waiting on a modal
const TIMEOUT_REFRESH = 10_000;   // 10s – background session check
const TIMEOUT_DATA = 20_000;      // 20s – heavier data fetches

import { TimeoutError, UnreachableError, UpstreamHttpError } from "~/lib/errors";

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new TimeoutError(url, timeoutMs);
    }
    throw new UnreachableError(url, error);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Performs initial GET and login to establish a findbolig session.
 * Returns the user data with the Set-Cookie headers of both requests.
 *
 * Failures are thrown, not swallowed, so callers can tell them apart:
 * - UpstreamHttpError with status 403: findbolig.nu rejected the email or
 *   password (observed body: "Invalid username or password", errorCode 105)
 * - UpstreamHttpError with another status: findbolig.nu answered but not with a session
 * - TimeoutError / UnreachableError: findbolig.nu is not responding
 */
export async function login(
  email: string,
  password: string,
): Promise<UserData & { cookies: string[] }> {
  // Initial GET to receive __Secure-SID cookie
  const initialRes = await fetchWithTimeout(BASE_URL, { redirect: "follow" }, TIMEOUT_LOGIN);
  const initialCookies = initialRes.headers.getSetCookie();

  // Perform login with initial cookies
  const cookieHeader = initialCookies.join("; ");
  const res = await fetchWithTimeout(`${BASE_URL}/api/authentication/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(cookieHeader && { Cookie: cookieHeader }),
    },
    body: JSON.stringify({ email, password }),
  }, TIMEOUT_LOGIN);

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new UpstreamHttpError(`Login failed: ${res.status} ${detail}`.trim(), res.status);
  }
  // Combine cookies from both requests
  return apiUserDataToDomain(await res.json() as ApiUserData, [...initialCookies, ...res.headers.getSetCookie()]);
}

/**
 * Fetches offers from the API (requires prior authentication)
 */
export async function fetchOffers(cookies: string): Promise<ApiOffersPage> {
  const res = await fetchWithTimeout(`${BASE_URL}/api/search/offers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Cookie: cookies,
    },
    body: JSON.stringify({
      search: null,
      filters: {},
      pageSize: 2147483647,
      page: 0,
      orderDirection: "desc",
      orderBy: "created",
    }),
  }, TIMEOUT_DATA);

  if (!res.ok) {
    throw new UpstreamHttpError(`Failed to fetch offers: ${res.status}`, res.status);
  }

  return (await res.json()) as ApiOffersPage;
}

/**
 * Fetches message threads from the API (requires prior authentication)
 */
export async function fetchThreads(
  cookies: string,
): Promise<ApiMessageThreadsPage> {
  const res = await fetchWithTimeout(`${BASE_URL}/api/communications/threads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Cookie: cookies,
    },
    body: JSON.stringify({
      page: 0,
      pageSize: 100,
      orderDirection: "DESC",
    }),
  }, TIMEOUT_DATA);

  if (!res.ok) {
    throw new UpstreamHttpError(`Failed to fetch threads: ${res.status}`, res.status);
  }

  return (await res.json()) as ApiMessageThreadsPage;
}

/**
 * Fetches the position on an offer
 * @param offerId
 * @returns
 */
export async function getPositionOnOffer(offerId: string, cookies: string) {
  const res = await fetchWithTimeout(
    `${BASE_URL}/api/search/waiting-lists/applicants/position-on-offer/${offerId}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: cookies,
      },
    },
    TIMEOUT_DATA,
  );

  if (!res.ok) {
    throw new UpstreamHttpError(
      `Failed to fetch position on offer: ${res.status}: ${res.statusText}`, res.status,
    );
  }

  const data = await res.json();
  return data;
}

/**
 * Fetches a residence by ID
 * @param residenceId
 * @returns
 */
export async function getResidence(residenceId: string, cookies: string) {
  const res = await fetchWithTimeout(`${BASE_URL}/api/models/residence/${residenceId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Cookie: cookies,
    },
  }, TIMEOUT_DATA);

  if (!res.ok) {
    throw new UpstreamHttpError(
      `Failed to fetch residence: ${res.status}: ${res.statusText}`, res.status,
    );
  }
  const data = await res.json();
  const residence = apiResidenceToDomain(data as ApiResidence);

  return residence;
}

/**
 * Fetches the thread for an offer
 * @param offerId
 * @returns
 */
export async function getThreadForOffer(
  offerId: string,
  cookies: string,
): Promise<ApiMessageThreadFull | null> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/api/communications/messages/thread/related-to/${offerId}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: cookies,
      },
    },
    TIMEOUT_DATA,
  );

  if (!res.ok) {
    throw new UpstreamHttpError(
      `Failed to fetch thread for offer: ${res.status}: ${res.statusText}`, res.status,
    );
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
export async function getUpcomingAppointments(
  cookies: string,
  includeAll: boolean = false,
  cached?: CachedAppointmentEntry[],
) {
  try {
    let offers = (await fetchOffers(cookies)).results;

    if (!includeAll) {
      offers = offers.filter(
        (offer) => offer.state === "Finished" || offer.state === "Published",
      );
    }

    const cacheMap = new Map(
      (cached ?? []).map((entry) => [entry.offerId, entry]),
    );

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
        if (
          cachedEntry &&
          thread.messages.length === cachedEntry.messageCount
        ) {
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
          const showingDetails = await extractAppointmentDetailsFromShowingText(
            offer.showingText,
            currentYear,
          );
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

    return results.filter(
      (a): a is NonNullable<typeof a> => a !== null,
    );
  } catch (error) {
    console.error("Failed to fetch upcoming appointments:", error);
    throw error;
  }
}

/** Fetches active (Published) offers with residence data eagerly loaded */
export async function getActiveOffers(cookies: string) {
  const offersPage = await fetchOffers(cookies);
  const publishedOffers = offersPage.results.filter(
    (offer) => offer.state === "Published",
  );

  const offersWithData = await Promise.all(
    publishedOffers.map(async (offer) => {
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
    }),
  );

  return offersWithData.filter((o): o is NonNullable<typeof o> => o !== null);
}

/** Accepts an offer on findbolig.nu */
export async function acceptOffer(offerId: string, cookies: string) {
  const res = await fetchWithTimeout(
    `${BASE_URL}/api/data/offers/${offerId}/accept`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: cookies,
      },
    },
    TIMEOUT_DATA,
  );
  if (!res.ok) {
    throw new UpstreamHttpError(`Failed to accept offer: ${res.status}`, res.status);
  }
  return (await res.json()) as ApiOffer;
}

/** Declines an offer on findbolig.nu */
export async function declineOffer(offerId: string, cookies: string) {
  const res = await fetchWithTimeout(
    `${BASE_URL}/api/data/offers/${offerId}/decline`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: cookies,
      },
    },
    TIMEOUT_DATA,
  );
  if (!res.ok) {
    throw new UpstreamHttpError(`Failed to decline offer: ${res.status}`, res.status);
  }
  return (await res.json()) as ApiOffer;
}

/**
 * Fetches the user data
 * @returns
 */
export async function getUserData(cookies: string) {
  const res = await fetchWithTimeout(`${BASE_URL}/api/users/me`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Cookie: cookies,
    },
  }, TIMEOUT_DATA);

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
  const res = await fetchWithTimeout(`${BASE_URL}/api/users/me`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Cookie: cookies,
    },
  }, TIMEOUT_REFRESH);

  if (!res.ok) {
    return null;
  }

  // Return the mapped user data together with any Set-Cookie headers
  return apiUserDataToDomain(await res.json() as ApiUserData, res.headers.getSetCookie() ?? []);
}

/** Fetches raw residence-application rows (one per applied residence) for the current user. */
export async function fetchResidenceApplications(cookies: string): Promise<ApiResidenceApplication[]> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/api/data/residence-applications`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: cookies,
      },
    },
    TIMEOUT_DATA,
  );

  if (!res.ok) {
    throw new UpstreamHttpError(
      `Failed to fetch residence applications: ${res.status}`,
      res.status,
    );
  }

  return (await res.json()) as ApiResidenceApplication[];
}

/** Fetches property metadata for a batch of propertyIds using the search endpoint. */
export async function searchPropertiesByIds(
  propertyIds: string[],
  cookies: string,
): Promise<ApiPropertySearchPage["results"]> {
  if (propertyIds.length === 0) return [];

  const res = await fetchWithTimeout(
    `${BASE_URL}/api/search`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: cookies,
      },
      body: JSON.stringify({
        filters: { propertyId: propertyIds },
        mixedResults: true,
        pageSize: propertyIds.length,
      }),
    },
    TIMEOUT_DATA,
  );

  if (!res.ok) {
    throw new UpstreamHttpError(
      `Failed to search properties: ${res.status}`,
      res.status,
    );
  }

  const data = (await res.json()) as ApiPropertySearchPage;
  return data.results ?? [];
}

/** Fetches the user's waiting-list position info for a property. Shape varies; see extractBestPosition. */
export async function getPositionForProperty(
  propertyId: string,
  cookies: string,
): Promise<ApiPositionForProperty | null> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/api/search/waiting-lists/applicants/position-for-property/${propertyId}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: cookies,
      },
    },
    TIMEOUT_DATA,
  );

  if (!res.ok) {
    throw new UpstreamHttpError(
      `Failed to fetch position for property ${propertyId}: ${res.status}`,
      res.status,
    );
  }

  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text) as ApiPositionForProperty;
}

/** Reactivates a waiting list (property-level). Upstream uses PUT and returns 204. */
export async function setWaitingListActive(propertyId: string, cookies: string): Promise<void> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/api/data/residence-applications/property/${propertyId}/set-active`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: cookies,
      },
    },
    TIMEOUT_DATA,
  );

  if (!res.ok) {
    throw new UpstreamHttpError(
      `Failed to set waiting list active for property ${propertyId}: ${res.status}`,
      res.status,
    );
  }
}

/** Unsubscribes the user from a waiting list (property-level). Upstream returns 204. */
export async function unsubscribeFromWaitingList(propertyId: string, cookies: string): Promise<void> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/api/data/residence-applications/property/${propertyId}`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: cookies,
      },
    },
    TIMEOUT_DATA,
  );

  if (!res.ok) {
    throw new UpstreamHttpError(
      `Failed to unsubscribe from waiting list for property ${propertyId}: ${res.status}`,
      res.status,
    );
  }
}

/** Minimal concurrency limiter — runs at most `limit` tasks in parallel, preserving input order. */
async function pLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
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
