import { createPinia, setActivePinia } from "pinia";
import { beforeEach, expect, it, vi } from "vitest";
// Deliberately imports nothing but the wiring and the Connection: no store, no page. Every kind
// of Local data must be registered for erasing by startup alone, since a user can open any
// page directly (say /offers) and disconnect before other pages ever load.
import { installLocalData } from "~/app/wiring";
import { useAuth } from "~/composables/useAuth";
import { LOCAL_DATA_KEYS } from "~/test/localDataKeys";

vi.mock("posthog-js", () => ({ default: { init: vi.fn(), identify: vi.fn() } }));

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  installLocalData();
});

it("ending a Connection erases every kind of Local data, even kinds no page has loaded yet", async () => {
  for (const key of LOCAL_DATA_KEYS) localStorage.setItem(key, JSON.stringify({ seeded: true }));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));

  await useAuth().disconnect();

  for (const key of LOCAL_DATA_KEYS) expect(localStorage.getItem(key), key).toBeNull();
  vi.unstubAllGlobals();
});
