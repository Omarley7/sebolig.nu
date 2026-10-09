import type { WaitingList, WaitingListSnapshot } from "@/types";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, expect, it } from "vitest";
import type { WaitingListsSource } from "~/data/waitingLists/source";
import { waitingListsKind } from "~/localData/waitingLists";
import { localDataHarness, type HarnessOptions } from "~/test/localDataHarness";

function list(propertyId: string, status: WaitingList["status"] = "Active"): WaitingList {
  return { propertyId, status, name: `Property ${propertyId}` } as WaitingList;
}

function snapshot(propertyId: string, status: WaitingList["status"]): WaitingListSnapshot {
  return { propertyId, status, observedAt: "2026-10-01T08:00:00.000Z" };
}

/** Today's stored format for waiting_lists_cache, written by the store before the Local data module. */
function storedLists(lists: WaitingList[]) {
  return { updatedAt: "2026-10-01T08:00:00.000Z", lists };
}

function fakeSource(overrides: Partial<WaitingListsSource> = {}): WaitingListsSource {
  return {
    fetchAll: async () => [],
    setActive: async () => {},
    unsubscribe: async () => {},
    ...overrides,
  };
}

function setup(source: WaitingListsSource, options: HarnessOptions = {}) {
  const harness = localDataHarness(options);
  const useWaitingLists = harness.localData.define(waitingListsKind({ live: source, demo: source }));
  return { ...harness, store: useWaitingLists() };
}

beforeEach(() => {
  setActivePinia(createPinia());
});

it("a refresh flags lists that went passive since they were last seen active", async () => {
  const { store, readStored } = setup(fakeSource({ fetchAll: async () => [list("a", "Passive"), list("b", "Passive")] }), {
    stored: {
      waiting_lists_cache: storedLists([list("a"), list("b", "Passive")]),
      waiting_lists_snapshots: [snapshot("a", "Active"), snapshot("b", "Passive")],
    },
  });
  await store.init();

  await store.refresh();

  expect(store.recentlyPassivated).toEqual(["a"]);
  expect(readStored("waiting_lists_snapshots").map((s: WaitingListSnapshot) => [s.propertyId, s.status])).toEqual([
    ["a", "Passive"],
    ["b", "Passive"],
  ]);
});

it("the first refresh ever flags nothing, since there is nothing to compare with", async () => {
  const { store } = setup(fakeSource({ fetchAll: async () => [list("a", "Passive")] }));

  await store.init();

  expect(store.lists.map((l) => l.propertyId)).toEqual(["a"]);
  expect(store.recentlyPassivated).toEqual([]);
});

it("waiting lists stored in today's format load as they are when there is no Connection", async () => {
  const { store } = setup(fakeSource(), { connected: false, stored: { waiting_lists_cache: storedLists([list("a")]) } });

  await store.init();

  expect(store.lists.map((l) => l.propertyId)).toEqual(["a"]);
  expect(store.updatedAt).toEqual(new Date("2026-10-01T08:00:00.000Z"));
});

it("reactivating a list stores it as active, takes it off the banner and confirms it", async () => {
  const { store, readStored, notices } = setup(fakeSource({ fetchAll: async () => [list("a", "Passive")] }), {
    stored: { waiting_lists_snapshots: [snapshot("a", "Active")] },
  });
  await store.init();
  expect(store.recentlyPassivated).toEqual(["a"]);

  expect(await store.setActive("a")).toBe(true);

  expect(store.lists[0].status).toBe("Active");
  expect(readStored("waiting_lists_cache").lists[0].status).toBe("Active");
  expect(store.recentlyPassivated).toEqual([]);
  expect(notices).toEqual([{ level: "success", key: "waitingLists.actions.reactivateSuccess", params: { name: "Property a" } }]);
});

it("a refused reactivation puts the list back as it was", async () => {
  const { store, notices } = setup(
    fakeSource({
      fetchAll: async () => [list("a", "Passive")],
      setActive: async () => {
        throw new Error("refused");
      },
    }),
  );
  await store.init();

  expect(await store.setActive("a")).toBe(false);

  expect(store.lists[0].status).toBe("Passive");
  expect(notices).toEqual([
    { level: "error", key: "waitingLists.actions.reactivateFailed", params: { name: "Property a" }, cause: expect.any(Error) },
  ]);
});

it("reactivate all reports how many succeeded when some fail", async () => {
  const { store, notices } = setup(
    fakeSource({
      fetchAll: async () => [list("a", "Passive"), list("b", "Passive"), list("c", "Passive")],
      setActive: async (propertyId) => {
        if (propertyId === "b") throw new Error("refused");
      },
    }),
  );
  await store.init();

  await store.reactivateAll();

  expect(store.lists.map((l) => l.status)).toEqual(["Active", "Passive", "Active"]);
  expect(notices).toEqual([
    { level: "warning", key: "waitingLists.actions.reactivateAllPartial", params: { done: 2, total: 3, failed: 1 } },
  ]);
});

it("reactivate all stops quietly once the Connection has ended", async () => {
  const attempted: string[] = [];
  const { store, notices } = setup(
    fakeSource({
      fetchAll: async () => [list("a", "Passive"), list("b", "Passive")],
      setActive: async (propertyId) => {
        attempted.push(propertyId);
        throw new Error("refused");
      },
    }),
    { recoverFrom: "ended" },
  );
  await store.init();

  await store.reactivateAll();

  expect(notices).toEqual([]);
});

it("unsubscribing removes the list and forgets it was ever seen", async () => {
  const { store, readStored } = setup(fakeSource({ fetchAll: async () => [list("a"), list("b")] }));
  await store.init();

  expect(await store.unsubscribe("a")).toBe(true);

  expect(store.lists.map((l) => l.propertyId)).toEqual(["b"]);
  expect(readStored("waiting_lists_snapshots").map((s: WaitingListSnapshot) => s.propertyId)).toEqual(["b"]);
});
