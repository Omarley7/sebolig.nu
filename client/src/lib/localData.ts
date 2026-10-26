import { defineStore } from "pinia";
import { computed, readonly, ref, shallowRef, type Ref } from "vue";
import type { ConnectionCheck } from "~/composables/useAuth";
import type { MessageKey } from "~/i18n";

/** Where Local data lives on the device. */
export interface LocalStorage {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

export function memoryStorage(): LocalStorage {
  const items = new Map<string, string>();
  return {
    read: (key) => items.get(key) ?? null,
    write: (key, value) => void items.set(key, value),
    remove: (key) => void items.delete(key),
  };
}

export const browserStorage: LocalStorage = {
  read: (key) => localStorage.getItem(key),
  write: (key, value) => localStorage.setItem(key, value),
  remove: (key) => localStorage.removeItem(key),
};

export type { ConnectionCheck };

/** What a Local data store needs to know about the Connection. */
export interface Connection {
  isConnected(): boolean;
  /** Hands a failed request to the Connection; an ended Connection has erased Local data by the time this resolves. */
  recoverFrom(error: unknown): Promise<ConnectionCheck | "unrelated">;
  checkConnection(): Promise<ConnectionCheck>;
  /** Asks the user to connect; resolves true once they have, false if they gave up. */
  requestConnect(): Promise<boolean>;
}

export type Notice = {
  level: "success" | "warning" | "error";
  key: MessageKey;
  params?: Record<string, unknown>;
  /** The failure behind an error notice; the app may present some causes (a timeout) differently. */
  cause?: unknown;
};

export type Mode = "live" | "demo";

/** When each kind was last checked successfully, by kind name, kept apart from the kinds' own data. */
const CHECKED_AT_KEY = "local_data_checked_at";

/** How long an automatic check waits after the last check or refresh of the same kind. */
const CHECK_COOLDOWN_MS = 60_000;

/** What a check or refresh changed: the data shown before it, and the data shown now. */
export type Update<Data> = { before: Data; after: Data };

export interface LocalDataDeps {
  storage: LocalStorage;
  connection: () => Connection;
  notify: (notice: Notice) => void;
  mode: () => Mode;
}

export interface LocalDataDefinition<Data, Source, Extra> {
  name: string;
  key: string;
  /** Other storage keys the kind keeps Local data under; erased along with `key`. */
  extraKeys?: string[];
  /** Turns stored JSON back into the kind's data. */
  revive(raw: unknown): Data;
  /** Turns the kind's data into what is stored; left out when the data is stored as it is. */
  serialize?(data: Data): unknown;
  fetchAll(current: Data | null, source: Source): Promise<Data>;
  /**
   * The cheap "did anything change" path init() takes over stored data. Resolves null when
   * the stored data cannot be checked cheaply (e.g. it predates the delta cursor). Kinds
   * without a cheap signal leave it out, and init() shows what is stored (see refreshAfterMs).
   */
  checkForChanges?(current: Data, source: Source): Promise<Data | null>;
  /**
   * For kinds without a cheap check: init() fetches everything once the last successful check
   * is this many ms old. Data with no recorded check counts as that old.
   */
  refreshAfterMs?: number;
  failedKey: MessageKey;
  sources: Record<Mode, Source>;
  /** What the kind's store exposes on top of the shared lifecycle: its own state, getters and writes. */
  expose?(ctx: LocalDataContext<Data, Source>): Extra;
}

/** What a kind's own writes get to work with. */
export interface LocalDataContext<Data, Source> {
  data: Readonly<Ref<Data | null>>;
  source(): Source;
  /** The only way a write changes the data; it always saves. Ignored while there is no data. */
  mutate(change: (current: Data) => Data): void;
  /**
   * Reports a failed write: recover() then, unless the Connection ended, an error notice.
   * The usual way out of a failed write.
   */
  fail(error: unknown, notice: Pick<Notice, "key" | "params">): Promise<void>;
  /** Only hands a failed request to the Connection, for writes that decide for themselves what to say. */
  recover(error: unknown): Promise<ConnectionCheck | "unrelated">;
  notify(notice: Notice): void;
  /** For the kind's extra keys only; its main data goes through mutate. */
  storage: LocalStorage;
  /** Runs after every successful full refresh, with the fresh data. */
  onRefreshed(listener: (data: Data) => void): void;
  /** Runs when Local data is erased, to clear the kind's own state. */
  onErase(listener: () => void): void;
}

/** One storage key of Local data kept outside the defined kinds; see `keep`. */
export interface KeptData {
  read(): string | null;
  write(value: string): void;
  /** Runs when Local data is erased, after the key is removed from storage. */
  onErase(forget: () => void): void;
}

export function createLocalData(deps: LocalDataDeps) {
  // Every kind registers when it is defined, not when its store is first used, so erasing
  // also reaches data of kinds no page has used since the app started.
  const storedKeys: string[] = [CHECKED_AT_KEY];
  const forgetInMemory = new Set<() => void>();

  /** Erases all Local data kept by the defined kinds: stored copies and in-memory state. */
  function eraseAll() {
    for (const key of storedKeys) deps.storage.remove(key);
    for (const forget of forgetInMemory) forget();
  }

  function readCheckedAt(): Record<string, string> {
    try {
      const parsed = JSON.parse(deps.storage.read(CHECKED_AT_KEY) ?? "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function define<Data, Source, Extra extends object = {}>(definition: LocalDataDefinition<Data, Source, Extra>) {
    storedKeys.push(definition.key, ...(definition.extraKeys ?? []));
    return defineStore(definition.name, () => {
      const data = shallowRef<Data | null>(null);
      // The last successful check: a cheap check or a full refresh. Data that didn't change
      // keeps its own updatedAt, so this is what "last updated" shows.
      const checkedAt = ref<Date | null>(null);
      const status = ref<"idle" | "loading" | "error">("idle");
      const hasData = computed(() => data.value !== null);
      const isLoading = computed(() => status.value === "loading");
      // Bumped when Local data is erased: a fetch that started before then must not store its result.
      let erasures = 0;
      // Looked up on every call: a demo can start after the store already exists.
      const source = () => definition.sources[deps.mode()];
      const refreshListeners: ((data: Data) => void)[] = [];
      const eraseListeners: (() => void)[] = [];
      const updateListeners: ((update: Update<Data>) => void)[] = [];

      function save(next: Data) {
        data.value = next;
        deps.storage.write(definition.key, JSON.stringify(definition.serialize ? definition.serialize(next) : next));
      }

      /** Saves what a check or refresh brought, telling update listeners what it replaced, if anything. */
      function saveUpdate(next: Data) {
        const before = data.value;
        save(next);
        if (before !== null) for (const listener of updateListeners) listener({ before, after: next });
      }

      function recordCheck() {
        checkedAt.value = new Date();
        deps.storage.write(CHECKED_AT_KEY, JSON.stringify({ ...readCheckedAt(), [definition.name]: checkedAt.value.toISOString() }));
      }

      function load() {
        const stored = new Date(readCheckedAt()[definition.name] ?? NaN);
        checkedAt.value = Number.isNaN(stored.getTime()) ? null : stored;
        const raw = deps.storage.read(definition.key);
        if (raw === null) return;
        data.value = definition.revive(JSON.parse(raw));
      }

      // When the last check or refresh started, for the cooldown between automatic checks.
      let lastCheckStartedAt = -Infinity;
      let checkInFlight: Promise<void> | null = null;
      const isChecking = ref(false);
      /** A check or a refresh is running: what the refresh icon spins for. */
      const isBusy = computed(() => isChecking.value || isLoading.value);

      /**
       * Shows what is stored and, with a Connection, checks findbolig.nu for changes: the
       * automatic check a page runs when it opens and when the tab is shown again. A check
       * started within CHECK_COOLDOWN_MS of the last one (or of a refresh) is skipped.
       */
      async function init() {
        // Once loaded, the data in memory is what is stored: every change goes through save().
        if (data.value === null) load();
        if (!deps.connection().isConnected()) return;
        if (checkInFlight) return checkInFlight;
        if (Date.now() - lastCheckStartedAt < CHECK_COOLDOWN_MS) return;
        isChecking.value = true;
        checkInFlight = check().finally(() => {
          checkInFlight = null;
          isChecking.value = false;
        });
        return checkInFlight;
      }

      /**
       * A check that doesn't wait out the cooldown, for when findbolig.nu is known to have
       * changed (say, the user just accepted an offer). A check already running started before
       * that: this one runs after it.
       */
      async function checkNow() {
        if (checkInFlight) await checkInFlight;
        lastCheckStartedAt = -Infinity;
        return init();
      }

      async function check() {
        if (data.value === null) return refresh();
        lastCheckStartedAt = Date.now();
        if (!definition.checkForChanges) {
          const { refreshAfterMs } = definition;
          const due = refreshAfterMs !== undefined && (checkedAt.value?.getTime() ?? -Infinity) <= Date.now() - refreshAfterMs;
          if (due) await refreshIfLive();
          return;
        }
        const startedBefore = erasures;
        let checked: Data | null;
        try {
          checked = await definition.checkForChanges(data.value, source());
        } catch (error) {
          // Best-effort: keep showing stored data. A refused check still reaches the
          // Connection, so an ended Connection is noticed here too.
          await deps.connection().recoverFrom(error);
          return;
        }
        if (erasures !== startedBefore) return;
        if (checked) {
          saveUpdate(checked);
          return recordCheck();
        }
        // Can't check cheaply: self-heal with one full refresh.
        await refreshIfLive();
      }

      /**
       * An automatic full refresh, only on a confirmed live Connection. An ended one is the
       * Connection's to handle; an unreachable findbolig.nu just leaves the stored data as it is.
       */
      async function refreshIfLive() {
        if ((await deps.connection().checkConnection()) === "live") await refresh();
      }

      let inFlight: Promise<void> | null = null;

      async function refresh(): Promise<void> {
        if (!deps.connection().isConnected()) {
          // Nothing to refresh from yet: ask the user to connect, and refresh once they have.
          if (!(await deps.connection().requestConnect())) return;
        }
        inFlight ??= fetchEverything().finally(() => (inFlight = null));
        return inFlight;
      }

      function saveRefreshed(next: Data, startedBefore: number) {
        // Local data was erased while fetching (say, a disconnect): keep it erased.
        if (erasures !== startedBefore) return;
        saveUpdate(next);
        recordCheck();
        for (const listener of refreshListeners) listener(next);
      }

      async function fetchEverything() {
        lastCheckStartedAt = Date.now();
        const startedBefore = erasures;
        status.value = "loading";
        try {
          saveRefreshed(await definition.fetchAll(data.value, source()), startedBefore);
          status.value = "idle";
        } catch (error) {
          const check = await deps.connection().recoverFrom(error);
          if (check === "ended") {
            // The Connection has erased Local data and sent the user home; nothing to say.
            status.value = "idle";
            return;
          }
          if (check === "live") {
            try {
              saveRefreshed(await definition.fetchAll(data.value, source()), startedBefore);
              status.value = "idle";
              return;
            } catch {
              // The retry failed too: report the original failure below.
            }
          }
          status.value = "error";
          deps.notify({ level: "error", key: definition.failedKey, cause: error });
        }
      }

      forgetInMemory.add(() => {
        erasures++;
        data.value = null;
        checkedAt.value = null;
        lastCheckStartedAt = -Infinity;
        status.value = "idle";
        for (const listener of eraseListeners) listener();
      });

      const own = definition.expose?.({
        data: readonly(data) as Readonly<Ref<Data | null>>,
        source,
        mutate(change) {
          if (data.value !== null) save(change(data.value));
        },
        async fail(error, notice) {
          if ((await deps.connection().recoverFrom(error)) === "ended") return;
          deps.notify({ level: "error", ...notice, cause: error });
        },
        recover: (error) => deps.connection().recoverFrom(error),
        notify: deps.notify,
        storage: deps.storage,
        onRefreshed: (listener) => void refreshListeners.push(listener),
        onErase: (listener) => void eraseListeners.push(listener),
      });

      /**
       * Runs after every successful check or refresh that replaced data already shown, with what
       * was shown before and what is shown now. Not for the first fetch, which replaces nothing.
       */
      function onUpdated(listener: (update: Update<Data>) => void) {
        updateListeners.push(listener);
      }

      return { data, status, hasData, isLoading, isChecking, isBusy, checkedAt, init, checkNow, refresh, onUpdated, ...(own as Extra) };
    });
  }

  /**
   * Registers a storage key holding Local data outside the defined kinds (what changed, say), so
   * erasing reaches it too. The returned handle reads and writes that key; `onErase` listeners
   * clear what is kept of it in memory.
   */
  function keep(key: string): KeptData {
    storedKeys.push(key);
    return {
      read: () => deps.storage.read(key),
      write: (value) => deps.storage.write(key, value),
      onErase: (forget) => void forgetInMemory.add(forget),
    };
  }

  return { define, keep, eraseAll };
}
