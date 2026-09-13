import type { Offer, OfferDelta, RecipientState } from "@/types";
import config from "~/config";
import MOCK_OFFERS from "~/data/MOCK_OFFERS.json";
import { inDays } from "~/lib/dateHelper";
import { HttpError } from "./appointmentsSource";

const TIMEOUT_FETCH = 90_000;
const TIMEOUT_ACTION = 25_000;
const TIMEOUT_DELTA = 30_000;

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export async function fetchActiveOffers(): Promise<{
  updatedAt: Date;
  offers: Offer[];
  latestUpdated: string | null;
}> {
  if (config.useMockData) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    const deadlines = [inDays(1), inDays(5), inDays(10)];
    const offers = (MOCK_OFFERS as Offer[]).map((offer, i) => ({
      ...offer,
      deadline: deadlines[i % deadlines.length],
    }));
    return { updatedAt: new Date(), offers, latestUpdated: new Date().toISOString() };
  }

  const res = await fetchWithTimeout(
    `${config.backendDomain}/api/offers/active`,
    { method: "GET", credentials: "include" },
    TIMEOUT_FETCH,
  );

  if (!res.ok) {
    throw new HttpError(`Failed to fetch offers: ${res.status}`, res.status);
  }

  const data = (await res.json()) as { offers: Offer[]; latestUpdated: string | null };
  return { updatedAt: new Date(), offers: data.offers, latestUpdated: data.latestUpdated };
}

/**
 * Lightweight check for offers changed since `since` (a `latestUpdated` cursor
 * previously returned by this same API — never a client-generated timestamp).
 */
export async function fetchOfferDelta(since: string): Promise<OfferDelta> {
  const res = await fetchWithTimeout(
    `${config.backendDomain}/api/offers/delta?since=${encodeURIComponent(since)}`,
    { method: "GET", credentials: "include" },
    TIMEOUT_DELTA,
  );

  if (!res.ok) {
    throw new HttpError(`Failed to fetch offer delta: ${res.status}`, res.status);
  }

  return (await res.json()) as OfferDelta;
}

export async function acceptOffer(offerId: string): Promise<RecipientState> {
  const res = await fetchWithTimeout(
    `${config.backendDomain}/api/offers/${offerId}/accept`,
    { method: "POST", credentials: "include" },
    TIMEOUT_ACTION,
  );

  if (!res.ok) {
    throw new HttpError(`Failed to accept offer: ${res.status}`, res.status);
  }

  const data = await res.json();
  return data.recipientState as RecipientState;
}

export async function declineOffer(offerId: string): Promise<RecipientState> {
  const res = await fetchWithTimeout(
    `${config.backendDomain}/api/offers/${offerId}/decline`,
    { method: "POST", credentials: "include" },
    TIMEOUT_ACTION,
  );

  if (!res.ok) {
    throw new HttpError(`Failed to decline offer: ${res.status}`, res.status);
  }

  const data = await res.json();
  return data.recipientState as RecipientState;
}
