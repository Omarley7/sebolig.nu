import type { WaitingList, WaitingListSnapshot } from "@/types";
import { computed, ref } from "vue";
import type { WaitingListsSource } from "~/data/waitingLists/source";
import type { ConnectionCheck, LocalDataContext, LocalDataDefinition, Mode } from "~/lib/localData";

const SNAPSHOTS_KEY = "waiting_lists_snapshots";
const CONCURRENCY_REACTIVATE_ALL = 5;

/** Waiting lists as stored on the device, under waiting_lists_cache. */
type StoredWaitingLists = { updatedAt: string; lists: WaitingList[] };

type WaitingLists = { updatedAt: Date; lists: WaitingList[] };

/** Ids of lists that are passive now but were active when last seen. Lists never seen before are not flagged. */
function wentPassive(lists: WaitingList[], seen: WaitingListSnapshot[]): string[] {
  const seenByProperty = new Map(seen.map((s) => [s.propertyId, s]));
  return lists
    .filter((l) => l.status === "Passive" && seenByProperty.get(l.propertyId)?.status === "Active")
    .map((l) => l.propertyId);
}

function snapshotsOf(lists: WaitingList[], observedAt = new Date()): WaitingListSnapshot[] {
  const iso = observedAt.toISOString();
  return lists.map((l) => ({ propertyId: l.propertyId, status: l.status, observedAt: iso }));
}

/**
 * Waiting lists have no cheap "did anything change" signal: queue positions cost the same
 * per-property fetch as a full refresh. So there is no check; init shows what is stored and
 * the refresh button fetches everything. A full refresh compares statuses with the last one
 * seen (stored separately as snapshots) to flag lists that went passive.
 */
export function waitingListsKind(sources: Record<Mode, WaitingListsSource>) {
  const definition: LocalDataDefinition<WaitingLists, WaitingListsSource, ReturnType<typeof exposeWaitingLists>> = {
    name: "waitingLists",
    key: "waiting_lists_cache",
    extraKeys: [SNAPSHOTS_KEY],
    failedKey: "waitingLists.refreshFailed",
    sources,
    revive(raw) {
      const stored = raw as StoredWaitingLists;
      return { updatedAt: new Date(stored.updatedAt), lists: stored.lists };
    },
    serialize: (data): StoredWaitingLists => ({ updatedAt: data.updatedAt.toISOString(), lists: data.lists }),
    async fetchAll(_current, source) {
      return { updatedAt: new Date(), lists: await source.fetchAll() };
    },
    expose: exposeWaitingLists,
  };
  return definition;
}

function exposeWaitingLists(ctx: LocalDataContext<WaitingLists, WaitingListsSource>) {
  const recentlyPassivated = ref<string[]>([]);
  const isMutating = ref(false);
  // For the "Reactivating X of N" counter
  const bulkInProgress = ref(false);
  const bulkDone = ref(0);
  const bulkTotal = ref(0);

  function readSnapshots(): WaitingListSnapshot[] | null {
    const raw = ctx.storage.read(SNAPSHOTS_KEY);
    if (raw === null) return null;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function writeSnapshots(snapshots: WaitingListSnapshot[]) {
    ctx.storage.write(SNAPSHOTS_KEY, JSON.stringify(snapshots));
  }

  function setStatus(propertyId: string, status: WaitingList["status"]) {
    ctx.mutate((current) => ({
      ...current,
      lists: current.lists.map((l) => (l.propertyId === propertyId ? { ...l, status } : l)),
    }));
  }

  function dismissFromBanner(propertyId: string) {
    recentlyPassivated.value = recentlyPassivated.value.filter((id) => id !== propertyId);
  }

  ctx.onRefreshed(({ lists }) => {
    const seen = readSnapshots() ?? ctx.source().statusesBeforeFirstRefresh?.() ?? [];
    recentlyPassivated.value = wentPassive(lists, seen);
    writeSnapshots(snapshotsOf(lists));
  });

  ctx.onErase(() => {
    recentlyPassivated.value = [];
  });

  async function setActive(propertyId: string): Promise<boolean> {
    const list = ctx.data.value?.lists.find((l) => l.propertyId === propertyId);
    if (!list) return false;
    const originalStatus = list.status;
    const params = { name: list.name };

    isMutating.value = true;
    setStatus(propertyId, "Active"); // optimistic
    try {
      await ctx.source().setActive(propertyId);
      // Remember it as active, so the next refresh doesn't flag it again.
      writeSnapshots(snapshotsOf(ctx.data.value?.lists ?? []));
      ctx.notify({ level: "success", key: "waitingLists.actions.reactivateSuccess", params });
      return true;
    } catch (error) {
      setStatus(propertyId, originalStatus);
      await ctx.fail(error, { key: "waitingLists.actions.reactivateFailed", params });
      return false;
    } finally {
      // The user has acknowledged it, whether or not it worked.
      dismissFromBanner(propertyId);
      isMutating.value = false;
    }
  }

  async function reactivateAll(): Promise<void> {
    const passive = (ctx.data.value?.lists ?? []).filter((l) => l.status === "Passive");
    if (passive.length === 0) return;

    bulkInProgress.value = true;
    bulkDone.value = 0;
    bulkTotal.value = passive.length;
    isMutating.value = true;

    let next = 0;
    let failed = 0;
    // Set once the Connection turned out to be the problem: no point firing more requests.
    let connectionTrouble: ConnectionCheck | null = null;

    async function worker() {
      while (!connectionTrouble && next < passive.length) {
        const list = passive[next++];
        try {
          await ctx.source().setActive(list.propertyId);
          // Store each success at once, so partial progress survives a closed tab.
          setStatus(list.propertyId, "Active");
          dismissFromBanner(list.propertyId);
        } catch (error) {
          failed++;
          const check = await ctx.recover(error);
          if (check !== "unrelated") connectionTrouble ??= check;
        } finally {
          bulkDone.value++;
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY_REACTIVATE_ALL, passive.length) }, worker));

    bulkInProgress.value = false;
    isMutating.value = false;
    // Ended: the Connection has erased Local data and sent the user home; nothing to report.
    if (connectionTrouble === "ended") return;

    writeSnapshots(snapshotsOf(ctx.data.value?.lists ?? []));
    const done = bulkDone.value - failed;
    if (failed === 0) {
      ctx.notify({ level: "success", key: "waitingLists.actions.reactivateAllSuccess", params: { count: done } });
    } else {
      // Not retried automatically, to avoid surprise side effects; the user can try again.
      ctx.notify({
        level: "warning",
        key: "waitingLists.actions.reactivateAllPartial",
        params: { done, total: passive.length, failed: passive.length - done },
      });
    }
  }

  async function unsubscribe(propertyId: string): Promise<boolean> {
    const list = ctx.data.value?.lists.find((l) => l.propertyId === propertyId);
    if (!list) return false;
    const params = { name: list.name };

    isMutating.value = true;
    try {
      await ctx.source().unsubscribe(propertyId);
      ctx.mutate((current) => ({ ...current, lists: current.lists.filter((l) => l.propertyId !== propertyId) }));
      // Forget it, so applying again later starts from scratch instead of counting as a change.
      writeSnapshots((readSnapshots() ?? []).filter((s) => s.propertyId !== propertyId));
      dismissFromBanner(propertyId);
      ctx.notify({ level: "success", key: "waitingLists.actions.unsubscribeSuccess", params });
      return true;
    } catch (error) {
      await ctx.fail(error, { key: "waitingLists.actions.unsubscribeFailed", params });
      return false;
    } finally {
      isMutating.value = false;
    }
  }

  return {
    lists: computed(() => ctx.data.value?.lists ?? []),
    updatedAt: computed(() => ctx.data.value?.updatedAt ?? null),
    recentlyPassivated,
    isMutating,
    bulkInProgress,
    bulkDone,
    bulkTotal,
    setActive,
    reactivateAll,
    unsubscribe,
    dismissPassivatedBanner: () => (recentlyPassivated.value = []),
  };
}
