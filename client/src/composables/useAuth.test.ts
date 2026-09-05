import { createPinia, setActivePinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAuth } from "~/composables/useAuth";

const CONNECTED_USER = { fullName: "Test Person" };

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
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
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/api/auth/login")) return jsonResponse(CONNECTED_USER);
    if (url.endsWith("/api/auth/logout")) return new Response(null, { status: 200 });
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const auth = useAuth();
  await auth.login("person@example.com", "secret");
  localStorage.setItem("appointments_cache", JSON.stringify({ updatedAt: 0, appointments: [] }));
  localStorage.setItem("offers_cache", JSON.stringify({ updatedAt: 0, offers: [] }));
  expect(auth.isAuthenticated).toBe(true);
  expect(localStorage.getItem("appointments_cache")).not.toBeNull();
  expect(localStorage.getItem("offers_cache")).not.toBeNull();

  await auth.logout();

  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/auth\/logout$/),
    expect.objectContaining({ method: "POST" }),
  );
  expect(localStorage.getItem("appointments_cache")).toBeNull();
  expect(localStorage.getItem("offers_cache")).toBeNull();
  expect(auth.isAuthenticated).toBe(false);
});
