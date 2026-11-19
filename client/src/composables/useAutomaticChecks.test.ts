import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApp, defineComponent, nextTick } from "vue";
import { useAuth } from "~/composables/useAuth";
import { useAutomaticChecks } from "./useAutomaticChecks";

vi.mock("posthog-js", () => ({ default: { init: vi.fn(), identify: vi.fn() } }));

let visibility: DocumentVisibilityState = "visible";
Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });

function fakeStore() {
  const store = { checks: 0, init: async () => void store.checks++ };
  return store;
}

/** Mounts a page that uses the stores, as a view does. */
function mountPage(...stores: ReturnType<typeof fakeStore>[]) {
  const app = createApp(defineComponent({ setup: () => useAutomaticChecks(...stores), render: () => null }));
  app.mount(document.createElement("div"));
  return app;
}

function switchTab(to: DocumentVisibilityState) {
  visibility = to;
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => setActivePinia(createPinia()));

afterEach(() => {
  visibility = "visible";
});

it("checks every store when the page opens", () => {
  const appointments = fakeStore();
  const offers = fakeStore();

  mountPage(appointments, offers);

  expect([appointments.checks, offers.checks]).toEqual([1, 1]);
});

it("checks again when the user comes back to the tab, not when they leave it", () => {
  const appointments = fakeStore();
  mountPage(appointments);

  switchTab("hidden");
  expect(appointments.checks).toBe(1);
  switchTab("visible");
  expect(appointments.checks).toBe(2);
});

it("checks every store when a Connection starts on the open page", async () => {
  // Home is the landing page until the user connects or starts the Demo, so it is already open.
  const appointments = fakeStore();
  const offers = fakeStore();
  mountPage(appointments, offers);

  useAuth().loginAsDemo("Tester");
  await nextTick();

  expect([appointments.checks, offers.checks]).toEqual([2, 2]);
});

it("stops checking once the page is left", () => {
  const appointments = fakeStore();
  const app = mountPage(appointments);

  app.unmount();
  switchTab("hidden");
  switchTab("visible");

  expect(appointments.checks).toBe(1);
});
