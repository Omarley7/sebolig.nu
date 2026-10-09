import { createPinia, setActivePinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApp, nextTick } from "vue";
import { useAuth } from "~/composables/useAuth";
import { installLocalData } from "~/app/wiring";
import config from "~/config";
import { httpOffers } from "~/data/offers/http";
import router from "~/router";
import { useOffersStore } from "~/stores/offers";
import { LOCAL_DATA_KEYS } from "~/test/localDataKeys";

vi.mock("posthog-js", () => ({
  default: { init: vi.fn(), identify: vi.fn() },
}));

const CONNECTED_USER = { fullName: "Test Person" };


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

function stubConnectAndDisconnect(
  refresh: () => Promise<Response> = async () => jsonResponse(CONNECTED_USER),
  dataRoute: () => Promise<Response> = async () => jsonResponse([]),
) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/api/auth/login")) return jsonResponse(CONNECTED_USER);
    if (url.endsWith("/api/auth/logout")) return new Response(null, { status: 200 });
    if (url.endsWith("/api/auth/refresh")) return refresh();
    if (url.includes("/api/offers/")) return dataRoute();
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function refreshAnswers(status: number, body?: unknown) {
  return async () =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

/** A connected user with Local data on the device, sitting on the offers page. */
async function connectedUserOnOffersPage() {
  const auth = useAuth();
  await auth.connect("person@example.com", "secret");
  seedLocalDataAndPreferences();
  await router.push({ name: "offers" });
  return auth;
}

function expectLocalDataErased() {
  for (const key of LOCAL_DATA_KEYS) expect(localStorage.getItem(key), key).toBeNull();
  expect(JSON.parse(localStorage.getItem("auth")!)).toEqual({ email: "", name: "", isAuthenticated: false, demoChosen: false });
}

function expectLocalDataIntact() {
  for (const key of LOCAL_DATA_KEYS) expect(localStorage.getItem(key), key).not.toBeNull();
  expect(JSON.parse(localStorage.getItem("auth")!)).toMatchObject({
    email: "person@example.com",
    isAuthenticated: true,
  });
}

function seedLocalDataAndPreferences() {
  for (const key of LOCAL_DATA_KEYS) localStorage.setItem(key, JSON.stringify({ seeded: true }));
  for (const [key, value] of Object.entries(PREFERENCE_KEYS)) localStorage.setItem(key, value);
}

/** A fresh pinia over whatever is on the device, as after a page load. */
function loadPage() {
  const pinia = createPinia();
  pinia.use(piniaPluginPersistedstate);
  // Pinia only runs plugins once it is installed on an app, so persistence needs a host app.
  createApp({}).use(pinia);
  setActivePinia(pinia);
  installLocalData();
}

beforeEach(() => {
  localStorage.clear();
  loadPage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("disconnecting erases every piece of Local data and the persisted identity, keeps preferences, and ends the Connection", async () => {
  const fetchMock = stubConnectAndDisconnect();
  const auth = useAuth();
  await auth.connect("person@example.com", "secret");
  seedLocalDataAndPreferences();
  expect(auth.isAuthenticated).toBe(true);
  expect(JSON.parse(localStorage.getItem("auth")!)).toMatchObject({
    email: "person@example.com",
    name: "Test Person",
    isAuthenticated: true,
  });

  await auth.disconnect();

  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/auth\/logout$/),
    expect.objectContaining({ method: "POST" }),
  );
  for (const key of LOCAL_DATA_KEYS) expect(localStorage.getItem(key), key).toBeNull();
  for (const [key, value] of Object.entries(PREFERENCE_KEYS)) expect(localStorage.getItem(key), key).toBe(value);

  expect(JSON.parse(localStorage.getItem("auth")!)).toEqual({ email: "", name: "", isAuthenticated: false, demoChosen: false });
  expect(auth.email).toBe("");
  expect(auth.name).toBe("");
  expect(auth.isAuthenticated).toBe(false);
});

it("disconnecting brings the user back to the home page", async () => {
  stubConnectAndDisconnect();
  const auth = useAuth();
  await auth.connect("person@example.com", "secret");
  await router.push({ name: "offers" });
  expect(router.currentRoute.value.name).toBe("offers");

  await auth.disconnect();

  expect(router.currentRoute.value.name).toBe("home");
});

it("a Connection check answered 401 with credentials_rejected erases Local data, ends the Connection, flags the password change and goes home", async () => {
  stubConnectAndDisconnect(refreshAnswers(401, { error: "rejected", reason: "credentials_rejected" }));
  const auth = await connectedUserOnOffersPage();

  expect(await auth.checkConnection()).toBe("ended");

  expectLocalDataErased();
  expect(auth.isAuthenticated).toBe(false);
  expect(auth.email).toBe("");
  expect(auth.endedByPasswordChange).toBe(true);
  expect(router.currentRoute.value.name).toBe("home");
});

it("a Connection check answered 401 without a reason erases Local data and ends the Connection without the password-change message", async () => {
  stubConnectAndDisconnect(refreshAnswers(401, { error: "Authentication required" }));
  const auth = await connectedUserOnOffersPage();

  expect(await auth.checkConnection()).toBe("ended");

  expectLocalDataErased();
  expect(auth.isAuthenticated).toBe(false);
  expect(auth.endedByPasswordChange).toBe(false);
  expect(router.currentRoute.value.name).toBe("home");
});

it("a Connection check answered 504 keeps the Connection and erases nothing", async () => {
  stubConnectAndDisconnect(refreshAnswers(504, { error: "findbolig.nu is not responding" }));
  const auth = await connectedUserOnOffersPage();

  expect(await auth.checkConnection()).toBe("unreachable");

  expectLocalDataIntact();
  expect(auth.isAuthenticated).toBe(true);
  expect(auth.endedByPasswordChange).toBe(false);
  expect(router.currentRoute.value.name).toBe("offers");
});

it("a Connection check that fails on the network keeps the Connection and erases nothing", async () => {
  stubConnectAndDisconnect(async () => {
    throw new TypeError("Failed to fetch");
  });
  const auth = await connectedUserOnOffersPage();

  expect(await auth.checkConnection()).toBe("unreachable");

  expectLocalDataIntact();
  expect(auth.isAuthenticated).toBe(true);
  expect(router.currentRoute.value.name).toBe("offers");
});

it("a successful connect clears the password-change flag", async () => {
  stubConnectAndDisconnect(refreshAnswers(401, { error: "rejected", reason: "credentials_rejected" }));
  const auth = await connectedUserOnOffersPage();
  await auth.checkConnection();
  expect(auth.endedByPasswordChange).toBe(true);

  await auth.connect("person@example.com", "new-secret");

  expect(auth.endedByPasswordChange).toBe(false);
  expect(auth.isAuthenticated).toBe(true);
});

it("the keep-alive poll reacts to a rejected password the same way", async () => {
  vi.useFakeTimers();
  try {
    stubConnectAndDisconnect(refreshAnswers(401, { error: "rejected", reason: "credentials_rejected" }));
    const auth = await connectedUserOnOffersPage();

    await vi.advanceTimersByTimeAsync(3 * 60 * 1000);

    expectLocalDataErased();
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.endedByPasswordChange).toBe(true);
    expect(router.currentRoute.value.name).toBe("home");
  } finally {
    vi.useRealTimers();
  }
});

it("a data fetch answered 401 with credentials_rejected ends the Connection with the same explanation, without a second look", async () => {
  // Once findbolig.nu rejects the password, the server has already cleared the cookie: a follow-up
  // refresh could only answer a reasonless 401, so the reason must be taken from the data response.
  const fetchMock = stubConnectAndDisconnect(
    refreshAnswers(401, { error: "Not authenticated" }),
    refreshAnswers(401, { error: "rejected", reason: "credentials_rejected" }),
  );
  const auth = await connectedUserOnOffersPage();

  await useOffersStore().refresh();

  expectLocalDataErased();
  expect(auth.isAuthenticated).toBe(false);
  expect(auth.endedByPasswordChange).toBe(true);
  expect(router.currentRoute.value.name).toBe("home");
  expect(fetchMock.mock.calls.map(([url]) => String(url)).filter((u) => u.endsWith("/api/auth/refresh"))).toEqual([]);
});

it("a delta check answered 401 keeps the reason the server gave", async () => {
  // The delta check is a data fetch like any other: the auth store needs the reason from it.
  stubConnectAndDisconnect(undefined, refreshAnswers(401, { error: "rejected", reason: "credentials_rejected" }));

  await expect(httpOffers.fetchDelta({ latestUpdated: "2026-09-01T00:00:00Z", latestUpdatedIds: [] })).rejects.toMatchObject({
    status: 401,
    reason: "credentials_rejected",
  });
});

it("an offer action answered 401 with credentials_rejected ends the Connection with the same explanation", async () => {
  const fetchMock = stubConnectAndDisconnect(
    refreshAnswers(401, { error: "Not authenticated" }),
    refreshAnswers(401, { error: "rejected", reason: "credentials_rejected" }),
  );
  const auth = await connectedUserOnOffersPage();

  expect(await useOffersStore().acceptOffer("offer-1")).toBe(false);

  expectLocalDataErased();
  expect(auth.isAuthenticated).toBe(false);
  expect(auth.endedByPasswordChange).toBe(true);
  expect(router.currentRoute.value.name).toBe("home");
  expect(fetchMock.mock.calls.map(([url]) => String(url)).filter((u) => u.endsWith("/api/auth/refresh"))).toEqual([]);
});

it("a Demo is still a Demo after a reload, so it isn't checked against findbolig.nu", async () => {
  const fetchMock = stubConnectAndDisconnect(refreshAnswers(401, { error: "Not authenticated" }));
  useAuth().loginAsDemo("Demo Person");
  await nextTick(); // let the persisted state reach the device

  loadPage();
  const auth = useAuth();

  expect(auth.isDemo).toBe(true);
  expect(await auth.checkConnection()).toBe("live");
  expect(auth.isAuthenticated).toBe(true);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("a VITE_DEMO_MODE build is always the Demo: connecting starts one, and nothing reaches the server", async () => {
  vi.useFakeTimers();
  const built = config.demoMode;
  config.demoMode = true;
  try {
    const fetchMock = stubConnectAndDisconnect();
    const auth = useAuth();

    expect(await auth.connect("person@example.com", "secret")).toBe(true);
    const refreshing = useOffersStore().refresh();
    await vi.advanceTimersByTimeAsync(1000); // past the Demo's artificial delay
    await refreshing;
    expect(await auth.checkConnection()).toBe("live");
    await auth.disconnect();

    expect(auth.isDemo).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    config.demoMode = built;
    vi.useRealTimers();
  }
});
