import { afterEach, beforeEach, expect, it } from "vitest";
import { createApp, defineComponent, nextTick } from "vue";
import { createRouter, createWebHistory, type Router } from "vue-router";
import { useQueryTab } from "./useQueryTab";

let router: Router;
let tab: ReturnType<typeof useQueryTab<"open" | "accepted" | "closed">>;
let unmount = () => {};

beforeEach(async () => {
  router = createRouter({ history: createWebHistory(), routes: [{ path: "/offers", component: { render: () => null } }] });
  await router.push("/offers");
  const host = document.createElement("div");
  const app = createApp(
    defineComponent({
      setup() {
        tab = useQueryTab(["open", "accepted", "closed"], "open");
        return () => null;
      },
    }),
  ).use(router);
  app.mount(host);
  unmount = () => app.unmount();
});

afterEach(() => unmount());

it("reads the tab from the address, the first tab when it names none or one that doesn't exist", async () => {
  expect(tab.value).toBe("open");

  await router.replace({ query: { tab: "closed" } });
  expect(tab.value).toBe("closed");

  await router.replace({ query: { tab: "bogus" } });
  expect(tab.value).toBe("open");
});

it("switching tab puts it in the address without a back step, and lets go of the open item", async () => {
  await router.replace({ query: { open: "o1" } });
  const before = history.length;

  tab.value = "accepted";
  await nextTick();
  await new Promise((r) => setTimeout(r, 0));

  expect(router.currentRoute.value.query).toEqual({ tab: "accepted" });
  expect(history.length).toBe(before);
});
