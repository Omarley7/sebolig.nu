import { createPinia, setActivePinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApp } from "vue";
import { useAuth } from "~/composables/useAuth";
import router from "~/router";

vi.mock("posthog-js", () => ({
  default: { init: vi.fn(), identify: vi.fn() },
}));

const CONNECTED_USER = { fullName: "Test Person" };

const LOCAL_DATA_KEYS = [
  "appointments_cache",
  "offers_cache",
  "waiting_lists_cache",
  "waiting_lists_snapshots",
];

const PREFERENCE_KEYS: Record<string, string> = {
  "locale-preference": "en",
  "theme-preference": "dark",
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function stubConnectAndDisconnect() {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/api/auth/login")) return jsonResponse(CONNECTED_USER);
    if (url.endsWith("/api/auth/logout")) return new Response(null, { status: 200 });
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function seedLocalDataAndPreferences() {
  for (const key of LOCAL_DATA_KEYS) localStorage.setItem(key, JSON.stringify({ seeded: true }));
  for (const [key, value] of Object.entries(PREFERENCE_KEYS)) localStorage.setItem(key, value);
}

beforeEach(() => {
  localStorage.clear();
  const pinia = createPinia();
  pinia.use(piniaPluginPersistedstate);
  // Pinia only runs plugins once it is installed on an app, so persistence needs a host app.
  createApp({}).use(pinia);
  setActivePinia(pinia);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("disconnecting erases every piece of Local data and the persisted identity, keeps preferences, and ends the Connection", async () => {
  const fetchMock = stubConnectAndDisconnect();
  const auth = useAuth();
  await auth.login("person@example.com", "secret");
  seedLocalDataAndPreferences();
  expect(auth.isAuthenticated).toBe(true);
  expect(JSON.parse(localStorage.getItem("auth")!)).toMatchObject({
    email: "person@example.com",
    name: "Test Person",
    isAuthenticated: true,
  });

  await auth.logout();

  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/auth\/logout$/),
    expect.objectContaining({ method: "POST" }),
  );
  for (const key of LOCAL_DATA_KEYS) expect(localStorage.getItem(key), key).toBeNull();
  for (const [key, value] of Object.entries(PREFERENCE_KEYS)) expect(localStorage.getItem(key), key).toBe(value);

  const persistedIdentity = localStorage.getItem("auth");
  if (persistedIdentity !== null) {
    expect(JSON.parse(persistedIdentity)).toEqual({ email: "", name: "", isAuthenticated: false });
  }
  expect(auth.email).toBe("");
  expect(auth.name).toBe("");
  expect(auth.isAuthenticated).toBe(false);
});

it("disconnecting brings the tenant back to the home page", async () => {
  stubConnectAndDisconnect();
  const auth = useAuth();
  await auth.login("person@example.com", "secret");
  await router.push({ name: "offers" });
  expect(router.currentRoute.value.name).toBe("offers");

  await auth.logout();

  expect(router.currentRoute.value.name).toBe("home");
});
