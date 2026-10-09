import type { WaitingList } from "@/types";
import { api } from "~/data/http";
import type { WaitingListsSource } from "./source";

const TIMEOUT_FETCH = 90_000;
const TIMEOUT_ACTION = 25_000;

export const httpWaitingLists: WaitingListsSource = {
  fetchAll: () => api<WaitingList[]>("/api/waiting-lists", { timeoutMs: TIMEOUT_FETCH, failureMessage: "Failed to fetch waiting lists" }),

  async setActive(propertyId) {
    await api(`/api/waiting-lists/${propertyId}/set-active`, {
      method: "POST",
      timeoutMs: TIMEOUT_ACTION,
      failureMessage: "Failed to set waiting list active",
    });
  },

  async unsubscribe(propertyId) {
    await api(`/api/waiting-lists/${propertyId}`, {
      method: "DELETE",
      timeoutMs: TIMEOUT_ACTION,
      failureMessage: "Failed to unsubscribe from waiting list",
    });
  },
};
