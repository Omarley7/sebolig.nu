import type { WaitingList } from "@/types";
import config from "~/config";
import MOCK_WAITING_LISTS from "~/data/MOCK_WAITING_LISTS.json";
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

export async function fetchWaitingLists(): Promise<{ updatedAt: Date; lists: WaitingList[] }> {
  if (config.useMockData) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return { updatedAt: new Date(), lists: MOCK_WAITING_LISTS as WaitingList[] };
  }

  const res = await fetchWithTimeout(
    `${config.backendDomain}/api/waiting-lists`,
    { method: "GET", credentials: "include" },
    TIMEOUT_FETCH,
  );

  if (!res.ok) {
    throw await HttpError.fromResponse(res, "Failed to fetch waiting lists");
  }

  const data = await res.json();
  return { updatedAt: new Date(), lists: data as WaitingList[] };
}

export async function setWaitingListActive(propertyId: string): Promise<void> {
  if (config.useMockData) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return;
  }
  const res = await fetchWithTimeout(
    `${config.backendDomain}/api/waiting-lists/${propertyId}/set-active`,
    { method: "POST", credentials: "include" },
    TIMEOUT_ACTION,
  );
  if (!res.ok) {
    throw await HttpError.fromResponse(res, "Failed to set waiting list active");
  }
}

export async function unsubscribeFromWaitingList(propertyId: string): Promise<void> {
  if (config.useMockData) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return;
  }
  const res = await fetchWithTimeout(
    `${config.backendDomain}/api/waiting-lists/${propertyId}`,
    { method: "DELETE", credentials: "include" },
    TIMEOUT_ACTION,
  );
  if (!res.ok) {
    throw await HttpError.fromResponse(res, "Failed to unsubscribe from waiting list");
  }
}
