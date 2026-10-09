import type { WaitingList } from "@/types";
import MOCK_WAITING_LISTS from "~/data/MOCK_WAITING_LISTS.json";
import { demoDelay } from "~/data/demo";
import type { WaitingListsSource } from "./source";

const wait = () => demoDelay(600);

/** Sample waiting lists for the Demo. Reactivations and removals stick until the page reloads. */
export function demoWaitingLists(): WaitingListsSource {
  let lists = MOCK_WAITING_LISTS as WaitingList[];

  return {
    async fetchAll() {
      await wait();
      return lists;
    },
    async setActive(propertyId) {
      await wait();
      lists = lists.map((l) => (l.propertyId === propertyId ? { ...l, status: "Active" } : l));
    },
    async unsubscribe(propertyId) {
      await wait();
      lists = lists.filter((l) => l.propertyId !== propertyId);
    },
    // Pretend every list was active before, so the passive ones show up on the banner.
    statusesBeforeFirstRefresh: () =>
      lists.map((l) => ({ propertyId: l.propertyId, status: "Active", observedAt: new Date().toISOString() })),
  };
}
