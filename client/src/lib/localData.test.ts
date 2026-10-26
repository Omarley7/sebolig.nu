import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createLocalData, memoryStorage, type Connection, type Notice } from "~/lib/localData";

type Note = { id: string; text: string };
type Notes = { updatedAt: string; notes: Note[] };

function fakeSource(pages: Notes[]) {
  const calls = { fetchAll: 0 };
  return {
    calls,
    async fetchAll(): Promise<Notes> {
      calls.fetchAll++;
      const page = pages.shift();
      if (!page) throw new Error("no more pages");
      return page;
    },
  };
}

type Options = {
  connected?: boolean;
  stored?: Notes;
  check?: (current: Notes) => Promise<Notes | null>;
  checkConnection?: Connection["checkConnection"];
  recoverFrom?: Connection["recoverFrom"];
  /** What the user does when asked to connect. */
  userConnects?: boolean;
};

function setup(pages: Notes[], { connected = true, stored, check, checkConnection = async () => "live", recoverFrom = async () => "unrelated", userConnects = false }: Options = {}) {
  const storage = memoryStorage();
  if (stored) storage.write("notes_cache", JSON.stringify(stored));
  const notices: Notice[] = [];
  const connectRequests = { count: 0 };
  const connection: Connection = {
    isConnected: () => connected,
    recoverFrom,
    checkConnection,
    requestConnect: async () => {
      connectRequests.count++;
      if (userConnects) connected = true;
      return userConnects;
    },
  };
  const source = fakeSource(pages);
  const localData = createLocalData({
    storage,
    connection: () => connection,
    notify: (notice) => notices.push(notice),
    mode: () => "live",
  });
  const useNotes = localData.define({
    name: "notes",
    key: "notes_cache",
    revive: (raw: unknown) => raw as Notes,
    fetchAll: (_cached, src) => src.fetchAll(),
    checkForChanges: check && ((current: Notes) => check(current)),
    failedKey: "offers.refreshFailed",
    sources: { live: source, demo: source },
  });
  return { storage, notices, connection, connectRequests, source, localData, useNotes };
}

const PAGE: Notes = { updatedAt: "2026-10-01T00:00:00.000Z", notes: [{ id: "a", text: "first" }] };

beforeEach(() => {
  setActivePinia(createPinia());
});

afterEach(() => {
  vi.useRealTimers();
});

it("refresh fetches the data, exposes it and saves it", async () => {
  const { useNotes, storage } = setup([PAGE]);
  const store = useNotes();

  await store.refresh();

  expect(store.data).toEqual(PAGE);
  expect(store.hasData).toBe(true);
  expect(JSON.parse(storage.read("notes_cache")!)).toEqual(PAGE);
});

it("init shows stored data without fetching when there is no Connection", async () => {
  const { useNotes, source } = setup([PAGE], { connected: false, stored: PAGE });
  const store = useNotes();

  await store.init();

  expect(store.data).toEqual(PAGE);
  expect(source.calls.fetchAll).toBe(0);
});

it("init fetches everything when connected and nothing is stored yet", async () => {
  const { useNotes, storage } = setup([PAGE]);
  const store = useNotes();

  await store.init();

  expect(store.data).toEqual(PAGE);
  expect(storage.read("notes_cache")).not.toBeNull();
});

it("init runs the cheap check over stored data instead of fetching everything", async () => {
  const checked: Notes = { ...PAGE, notes: [...PAGE.notes, { id: "b", text: "second" }] };
  const { useNotes, source, storage } = setup([], { stored: PAGE, check: async () => checked });
  const store = useNotes();

  await store.init();

  expect(store.data).toEqual(checked);
  expect(JSON.parse(storage.read("notes_cache")!)).toEqual(checked);
  expect(source.calls.fetchAll).toBe(0);
});

it("init falls back to one full refresh when stored data can't be checked cheaply", async () => {
  const fresh: Notes = { ...PAGE, updatedAt: "2026-10-02T00:00:00.000Z" };
  const { useNotes } = setup([fresh], { stored: PAGE, check: async () => null });
  const store = useNotes();

  await store.init();

  expect(store.data).toEqual(fresh);
});

it("init keeps stored data when it can't be checked and the Connection isn't live", async () => {
  const { useNotes, source } = setup([PAGE], {
    stored: PAGE,
    check: async () => null,
    checkConnection: async () => "unreachable",
  });
  const store = useNotes();

  await store.init();

  expect(store.data).toEqual(PAGE);
  expect(source.calls.fetchAll).toBe(0);
});

it("a cheap check or a refresh tells update listeners what was shown before and what is shown now", async () => {
  const checked: Notes = { ...PAGE, notes: [...PAGE.notes, { id: "b", text: "second" }] };
  const fresh: Notes = { ...PAGE, updatedAt: "2026-10-02T00:00:00.000Z", notes: [] };
  const { useNotes } = setup([fresh], { stored: PAGE, check: async () => checked });
  const store = useNotes();
  const updates: { before: Notes; after: Notes }[] = [];
  store.onUpdated((update) => updates.push(update));

  await store.init();
  await store.refresh();

  expect(updates).toEqual([
    { before: PAGE, after: checked },
    { before: checked, after: fresh },
  ]);
});

it("the first fetch, with nothing shown before, is not an update", async () => {
  const { useNotes } = setup([PAGE]);
  const store = useNotes();
  const updates: unknown[] = [];
  store.onUpdated((update) => updates.push(update));

  await store.init();

  expect(updates).toEqual([]);
});

it("a failed refresh keeps the data and tells the user, passing the error along", async () => {
  const { useNotes, notices } = setup([], { stored: PAGE });
  const store = useNotes();
  await store.init();

  await store.refresh();

  expect(store.data).toEqual(PAGE);
  expect(store.status).toBe("error");
  expect(notices).toEqual([{ level: "error", key: "offers.refreshFailed", cause: expect.any(Error) }]);
});

it("a refused refresh on a still-live Connection is retried once", async () => {
  const fresh: Notes = { ...PAGE, updatedAt: "2026-10-02T00:00:00.000Z" };
  const { useNotes, source, notices } = setup([], { stored: PAGE, recoverFrom: async () => "live" });
  const store = useNotes();
  await store.init();
  let attempts = 0;
  source.fetchAll = async () => {
    if (++attempts === 1) throw new Error("refused");
    return fresh;
  };

  await store.refresh();

  expect(store.data).toEqual(fresh);
  expect(store.status).toBe("idle");
  expect(notices).toEqual([]);
});

it("a refresh refused because the Connection ended stops quietly", async () => {
  const { useNotes, notices } = setup([], { stored: PAGE, recoverFrom: async () => "ended" });
  const store = useNotes();
  await store.init();

  await store.refresh();

  expect(notices).toEqual([]);
});

it("a refresh started while one is running joins it instead of fetching again", async () => {
  const { useNotes, source } = setup([PAGE, PAGE]);
  const store = useNotes();

  await Promise.all([store.refresh(), store.refresh()]);

  expect(source.calls.fetchAll).toBe(1);
});

it("a refresh without a Connection asks the user to connect, then runs", async () => {
  const { useNotes, connectRequests } = setup([PAGE], { connected: false, userConnects: true });
  const store = useNotes();

  await store.refresh();

  expect(connectRequests.count).toBe(1);
  expect(store.data).toEqual(PAGE);
});

it("a refresh without a Connection does nothing when the user doesn't connect", async () => {
  const { useNotes, source } = setup([PAGE], { connected: false, userConnects: false });
  const store = useNotes();

  await store.refresh();

  expect(source.calls.fetchAll).toBe(0);
  expect(store.data).toBeNull();
});

it("erasing Local data empties every store and its stored copy", async () => {
  const { useNotes, localData, storage } = setup([PAGE]);
  const store = useNotes();
  await store.refresh();

  localData.eraseAll();

  expect(store.data).toBeNull();
  expect(store.hasData).toBe(false);
  expect(storage.read("notes_cache")).toBeNull();
});

it("erasing Local data also removes data of kinds no store has been opened for", () => {
  const { localData, storage } = setup([], { stored: PAGE });

  localData.eraseAll();

  expect(storage.read("notes_cache")).toBeNull();
});

it("a failed cheap check keeps stored data and only lets the Connection look at the error", async () => {
  const seen: unknown[] = [];
  const { useNotes, notices } = setup([], {
    stored: PAGE,
    check: async () => {
      throw new Error("check failed");
    },
    recoverFrom: async (error) => (seen.push(error), "unrelated"),
  });
  const store = useNotes();

  await store.init();

  expect(store.data).toEqual(PAGE);
  expect(seen).toHaveLength(1);
  expect(notices).toEqual([]);
});

function defineEditableNotes(localData: ReturnType<typeof setup>["localData"], save: (id: string) => Promise<void>) {
  const source = { fetchAll: async () => PAGE, save };
  return localData.define({
    name: "editableNotes",
    key: "editable_notes_cache",
    revive: (raw: unknown) => raw as Notes,
    fetchAll: (_cached, src) => src.fetchAll(),
    failedKey: "offers.refreshFailed",
    sources: { live: source, demo: source },
    expose: (ctx) => ({
      async rename(id: string, text: string) {
        try {
          await ctx.source().save(id);
          ctx.mutate((notes) => ({ ...notes, notes: notes.notes.map((n) => (n.id === id ? { ...n, text } : n)) }));
        } catch (error) {
          await ctx.fail(error, { key: "offers.actionFailed" });
        }
      },
    }),
  });
}

it("a write changes the data through mutate, which saves it", async () => {
  const { localData, storage } = setup([]);
  const store = defineEditableNotes(localData, async () => {})();
  await store.refresh();

  await store.rename("a", "renamed");

  expect(store.data?.notes[0].text).toBe("renamed");
  expect(JSON.parse(storage.read("editable_notes_cache")!).notes[0].text).toBe("renamed");
});

it("a failed write tells the user unless the Connection ended", async () => {
  const { localData, notices } = setup([]);
  const store = defineEditableNotes(localData, async () => {
    throw new Error("refused");
  })();
  await store.refresh();

  await store.rename("a", "renamed");

  expect(store.data?.notes[0].text).toBe("first");
  expect(notices).toEqual([{ level: "error", key: "offers.actionFailed", cause: expect.any(Error) }]);
});

function defineWatchedNotes(localData: ReturnType<typeof setup>["localData"], source: ReturnType<typeof fakeSource>) {
  return localData.define({
    name: "watchedNotes",
    key: "watched_notes_cache",
    extraKeys: ["watched_notes_seen"],
    revive: (raw: unknown) => raw as Notes,
    fetchAll: (_cached, src) => src.fetchAll(),
    failedKey: "offers.refreshFailed",
    sources: { live: source, demo: source },
    expose: (ctx) => {
      const refreshed: Notes[] = [];
      let erased = 0;
      ctx.onRefreshed((notes) => {
        refreshed.push(notes);
        ctx.storage.write("watched_notes_seen", JSON.stringify(notes.notes.map((n) => n.id)));
      });
      ctx.onErase(() => erased++);
      return { refreshed, erasedCount: () => erased };
    },
  });
}

it("a kind hears about every full refresh, but not about cheap checks", async () => {
  const { localData } = setup([]);
  const store = defineWatchedNotes(localData, fakeSource([PAGE]))();

  await store.refresh();

  expect(store.refreshed).toEqual([PAGE]);
});

it("erasing Local data also removes a kind's extra keys and its own state", async () => {
  const { localData, storage } = setup([]);
  const store = defineWatchedNotes(localData, fakeSource([PAGE]))();
  await store.refresh();
  expect(storage.read("watched_notes_seen")).not.toBeNull();

  localData.eraseAll();

  expect(storage.read("watched_notes_seen")).toBeNull();
  expect(store.erasedCount()).toBe(1);
});

it("a successful check is remembered as the last check, apart from when the data last changed", async () => {
  vi.setSystemTime(new Date("2026-10-18T10:00:00.000Z"));
  const { useNotes } = setup([], { stored: PAGE, check: async (current) => current });
  const store = useNotes();

  await store.init();

  expect(store.checkedAt).toEqual(new Date("2026-10-18T10:00:00.000Z"));
  expect(store.data).toEqual(PAGE);
});

it("a failed check after a reload still shows the last successful one", async () => {
  vi.setSystemTime(new Date("2026-10-18T10:00:00.000Z"));
  const { useNotes } = setup([PAGE], {
    check: async () => {
      throw new Error("check failed");
    },
  });
  await useNotes().refresh();

  setActivePinia(createPinia());
  vi.setSystemTime(new Date("2026-10-18T12:00:00.000Z"));
  const reloaded = useNotes();
  await reloaded.init();

  expect(reloaded.data).toEqual(PAGE);
  expect(reloaded.checkedAt).toEqual(new Date("2026-10-18T10:00:00.000Z"));
});

it("an automatic check within 60 s of the last one is skipped, and runs again after", async () => {
  vi.setSystemTime(new Date("2026-10-18T10:00:00.000Z"));
  let checks = 0;
  const { useNotes } = setup([], { stored: PAGE, check: async (current) => (checks++, current) });
  const store = useNotes();
  await store.init();

  vi.setSystemTime(new Date("2026-10-18T10:00:59.000Z"));
  await store.init();
  expect(checks).toBe(1);

  vi.setSystemTime(new Date("2026-10-18T10:01:00.000Z"));
  await store.init();
  expect(checks).toBe(2);
});

it("checkNow runs a check within the cooldown, after the one already running", async () => {
  vi.setSystemTime(new Date("2026-10-18T10:00:00.000Z"));
  let checks = 0;
  let finishFirst!: () => void;
  const { useNotes } = setup([], {
    stored: PAGE,
    check: async (current) => {
      if (++checks === 1) await new Promise<void>((resolve) => (finishFirst = resolve));
      return current;
    },
  });
  const store = useNotes();
  const first = store.init();

  const now = store.checkNow();
  finishFirst();
  await Promise.all([first, now]);

  expect(checks).toBe(2);
});

it("a refresh counts as a check for the cooldown", async () => {
  vi.setSystemTime(new Date("2026-10-18T10:00:00.000Z"));
  let checks = 0;
  const { useNotes } = setup([PAGE], { check: async (current) => (checks++, current) });
  const store = useNotes();
  await store.refresh();

  vi.setSystemTime(new Date("2026-10-18T10:00:30.000Z"));
  await store.init();

  expect(checks).toBe(0);
});

it("a failed check also holds off the next one for 60 s", async () => {
  vi.setSystemTime(new Date("2026-10-18T10:00:00.000Z"));
  let checks = 0;
  const { useNotes } = setup([], {
    stored: PAGE,
    check: async () => {
      checks++;
      throw new Error("check failed");
    },
  });
  const store = useNotes();
  await store.init();

  vi.setSystemTime(new Date("2026-10-18T10:00:30.000Z"));
  await store.init();

  expect(checks).toBe(1);
});

it("each kind has its own cooldown", async () => {
  vi.setSystemTime(new Date("2026-10-18T10:00:00.000Z"));
  let checks = 0;
  const { useNotes, localData, storage } = setup([], { stored: PAGE, check: async (current) => (checks++, current) });
  storage.write("other_notes_cache", JSON.stringify(PAGE));
  const useOtherNotes = localData.define({
    name: "otherNotes",
    key: "other_notes_cache",
    revive: (raw: unknown) => raw as Notes,
    fetchAll: async () => PAGE,
    checkForChanges: async (current: Notes) => (checks++, current),
    failedKey: "offers.refreshFailed",
    sources: { live: null, demo: null },
  });

  await useNotes().init();
  await useOtherNotes().init();

  expect(checks).toBe(2);
});

it("a store says it is checking while an automatic check runs, and a second one joins it", async () => {
  let finishCheck!: (notes: Notes) => void;
  let checks = 0;
  const { useNotes } = setup([], {
    stored: PAGE,
    check: () => (checks++, new Promise((resolve) => (finishCheck = resolve))),
  });
  const store = useNotes();

  const first = store.init();
  const second = store.init();
  await vi.waitFor(() => expect(checks).toBe(1));
  expect(store.isChecking).toBe(true);
  finishCheck(PAGE);
  await Promise.all([first, second]);

  expect(store.isChecking).toBe(false);
  expect(checks).toBe(1);
});

it("a check that finishes after Local data was erased stores nothing", async () => {
  let finishCheck!: (notes: Notes) => void;
  const { useNotes, localData, storage } = setup([], {
    stored: PAGE,
    check: () => new Promise((resolve) => (finishCheck = resolve)),
  });
  const store = useNotes();
  const checking = store.init();
  await vi.waitFor(() => expect(finishCheck).toBeDefined());

  localData.eraseAll();
  finishCheck({ ...PAGE, notes: [] });
  await checking;

  expect(store.data).toBeNull();
  expect(store.checkedAt).toBeNull();
  expect(storage.read("notes_cache")).toBeNull();
  expect(storage.read("local_data_checked_at")).toBeNull();
});

it("a check date that can't be read counts as no check at all", async () => {
  const { useNotes, storage } = setup([], { connected: false, stored: PAGE });
  storage.write("local_data_checked_at", JSON.stringify({ notes: "not a date" }));
  const store = useNotes();

  await store.init();

  expect(store.checkedAt).toBeNull();
});

it("a refresh that finishes after Local data was erased stores nothing", async () => {
  let finishFetch!: (notes: Notes) => void;
  const { useNotes, localData, source, storage } = setup([]);
  source.fetchAll = () => new Promise((resolve) => (finishFetch = resolve));
  const store = useNotes();
  const refreshing = store.refresh();
  await vi.waitFor(() => expect(finishFetch).toBeDefined());

  localData.eraseAll();
  finishFetch(PAGE);
  await refreshing;

  expect(store.data).toBeNull();
  expect(storage.read("notes_cache")).toBeNull();
});
