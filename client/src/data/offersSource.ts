import type { Offer, RecipientState } from "@/types";
import config from "~/config";
import MOCK_OFFERS from "~/data/MOCK_OFFERS.json";
import { inDays } from "~/lib/dateHelper";
import { HttpError } from "./appointmentsSource";

const TIMEOUT_FETCH = 90_000;
const TIMEOUT_ACTION = 25_000;

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
}> {
  if (config.useMockData) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    const deadlines = [inDays(1), inDays(5), inDays(10)];
    const offers = (MOCK_OFFERS as Offer[]).map((offer, i) => ({
      ...offer,
      deadline: deadlines[i % deadlines.length],
    }));
    return { updatedAt: new Date(), offers };
  }

  const res = await fetchWithTimeout(
    `${config.backendDomain}/api/offers/active`,
    { method: "GET", credentials: "include" },
    TIMEOUT_FETCH,
  );

  if (!res.ok) {
    throw await HttpError.fromResponse(res, "Failed to fetch offers");
  }

  const data = await res.json();
  return { updatedAt: new Date(), offers: data as Offer[] };
}

export async function acceptOffer(offerId: string): Promise<RecipientState> {
  const res = await fetchWithTimeout(
    `${config.backendDomain}/api/offers/${offerId}/accept`,
    { method: "POST", credentials: "include" },
    TIMEOUT_ACTION,
  );

  if (!res.ok) {
    throw await HttpError.fromResponse(res, "Failed to accept offer");
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
    throw await HttpError.fromResponse(res, "Failed to decline offer");
  }

  const data = await res.json();
  return data.recipientState as RecipientState;
}
