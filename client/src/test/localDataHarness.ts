import {
  createLocalData,
  memoryStorage,
  type Connection,
  type ConnectionCheck,
  type Notice,
} from "~/lib/localData";

export type HarnessOptions = {
  connected?: boolean;
  /** What the Connection answers when handed a failed request. */
  recoverFrom?: ConnectionCheck | "unrelated";
  /** Stored Local data, keyed by storage key, as it would be found on the device. */
  stored?: Record<string, unknown>;
};

/** A Local data registry over in-memory storage, a fake Connection and a notice recorder. */
export function localDataHarness({ connected = true, recoverFrom = "unrelated", stored = {} }: HarnessOptions = {}) {
  const storage = memoryStorage();
  for (const [key, value] of Object.entries(stored)) storage.write(key, JSON.stringify(value));
  const notices: Notice[] = [];
  const connection: Connection = {
    isConnected: () => connected,
    recoverFrom: async () => recoverFrom,
    checkConnection: async () => "live",
    requestConnect: async () => false,
  };
  const localData = createLocalData({
    storage,
    connection: () => connection,
    notify: (notice) => notices.push(notice),
    mode: () => "live",
  });
  const readStored = (key: string) => {
    const raw = storage.read(key);
    return raw === null ? null : JSON.parse(raw);
  };
  return { localData, storage, notices, readStored };
}
