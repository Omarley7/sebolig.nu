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
   * without a cheap signal leave it out, and init() just shows what is stored.
   */
  checkForChanges?(current: Data, source: Source): Promise<Data | null>;
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

export function createLocalData(deps: LocalDataDeps) {
  // Every kind registers when it is defined, not when its store is first used, so erasing
  // also reaches data of kinds no page has used since the app started.
  const storedKeys: string[] = [];
  const forgetInMemory = new Set<() => void>();

  /** Erases all Local data kept by the defined kinds: stored copies and in-memory state. */
  function eraseAll() {
    for (const key of storedKeys) deps.storage.remove(key);
    for (const forget of forgetInMemory) forget();
  }

  function define<Data, Source, Extra extends object = {}>(definition: LocalDataDefinition<Data, Source, Extra>) {
    storedKeys.push(definition.key, ...(definition.extraKeys ?? []));
    return defineStore(definition.name, () => {
      const data = shallowRef<Data | null>(null);
      const status = ref<"idle" | "loading" | "error">("idle");
      const hasData = computed(() => data.value !== null);
      const isLoading = computed(() => status.value === "loading");
      // Looked up on every call: a demo can start after the store already exists.
      const source = () => definition.sources[deps.mode()];
      const refreshListeners: ((data: Data) => void)[] = [];
      const eraseListeners: (() => void)[] = [];

      function save(next: Data) {
        data.value = next;
        deps.storage.write(definition.key, JSON.stringify(definition.serialize ? definition.serialize(next) : next));
      }

      function load() {
        const raw = deps.storage.read(definition.key);
        if (raw === null) return;
        data.value = definition.revive(JSON.parse(raw));
      }

      async function init() {
        load();
        if (!deps.connection().isConnected()) return;
        if (data.value === null) return refresh();
        if (!definition.checkForChanges) return;
        let checked: Data | null;
        try {
          checked = await definition.checkForChanges(data.value, source());
        } catch (error) {
          // Best-effort: keep showing stored data. A refused check still reaches the
          // Connection, so an ended Connection is noticed here too.
          await deps.connection().recoverFrom(error);
          return;
        }
        if (checked) return save(checked);
        // Can't check cheaply: self-heal with one full refresh, but only on a confirmed live
        // Connection. An ended one is the Connection's to handle; an unreachable findbolig.nu
        // just leaves the stored data as it is.
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

      function saveRefreshed(next: Data) {
        save(next);
        for (const listener of refreshListeners) listener(next);
      }

      async function fetchEverything() {
        status.value = "loading";
        try {
          saveRefreshed(await definition.fetchAll(data.value, source()));
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
              saveRefreshed(await definition.fetchAll(data.value, source()));
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
        data.value = null;
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

      return { data, status, hasData, isLoading, init, refresh, ...(own as Extra) };
    });
  }

  return { define, eraseAll };
}
