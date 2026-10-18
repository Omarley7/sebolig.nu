import { afterEach, expect, it } from "vitest";
import { createApp, defineComponent } from "vue";
import { useAutomaticChecks } from "./useAutomaticChecks";

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

it("stops checking once the page is left", () => {
  const appointments = fakeStore();
  const app = mountPage(appointments);

  app.unmount();
  switchTab("hidden");
  switchTab("visible");

  expect(appointments.checks).toBe(1);
});
