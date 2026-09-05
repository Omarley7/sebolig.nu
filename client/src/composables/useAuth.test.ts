import { createPinia, setActivePinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAuth } from "~/composables/useAuth";

const CONNECTED_USER = { fullName: "Test Person" };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  localStorage.clear();
  const pinia = createPinia();
  pinia.use(piniaPluginPersistedstate);
  setActivePinia(pinia);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("disconnecting erases the appointments and offers Local data and ends the Connection", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/api/auth/login")) return jsonResponse(CONNECTED_USER);
      if (url.endsWith("/api/auth/logout")) return new Response(null, { status: 200 });
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
  const auth = useAuth();
  await auth.login("person@example.com", "secret");
  localStorage.setItem("appointments_cache", JSON.stringify({ updatedAt: 0, appointments: [] }));
  localStorage.setItem("offers_cache", JSON.stringify({ updatedAt: 0, offers: [] }));
  expect(auth.isAuthenticated).toBe(true);

  await auth.logout();

  expect(localStorage.getItem("appointments_cache")).toBeNull();
  expect(localStorage.getItem("offers_cache")).toBeNull();
  expect(auth.isAuthenticated).toBe(false);
});
