import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import { createRouter, createWebHistory, type Router } from "vue-router";
import BottomSheet from "~/components/shared/BottomSheet.vue";
import MapModal from "~/components/shared/MapModal.vue";
import { useSheet, type Sheet } from "~/composables/useSheet";
import i18n from "~/i18n";

// A page with a map that can open, and a sheet that can open above it.
const showMap = ref(false);
const showSheet = ref(false);
let sheet: Sheet | undefined;
let router: Router;
let unmount = () => {};

const Detail = defineComponent({
  emits: ["close"],
  setup(_, { emit }) {
    const own = (sheet = useSheet());
    return () => h(BottomSheet, { sheet: own, onClose: () => emit("close") }, () => h("p", "Content"));
  },
});

const Root = defineComponent({
  setup: () => () => [
    showMap.value ? h(MapModal, { appointments: [], onClose: () => (showMap.value = false) }) : null,
    showSheet.value ? h(Detail, { onClose: () => (showSheet.value = false) }) : null,
  ],
});

const Page = { render: () => null };
const frame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));

async function settle() {
  await nextTick();
  await frame();
}

async function back() {
  history.back();
  await nextTick();
}

async function esc() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  await nextTick();
}

beforeEach(async () => {
  showMap.value = false;
  showSheet.value = false;
  sheet = undefined;
  router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: "/", component: Page },
      { path: "/offers", component: Page },
    ],
  });
  await router.push("/");
  await router.push("/offers");

  const host = document.createElement("div");
  document.body.appendChild(host);
  const app = createApp(Root).use(router).use(i18n);
  app.mount(host);
  unmount = () => {
    app.unmount();
    host.remove();
  };
});

afterEach(() => unmount());

describe("history layers", () => {
  it("back closes the map without leaving the route", async () => {
    showMap.value = true;
    await settle();

    await back();
    expect(showMap.value).toBe(false);
    expect(router.currentRoute.value.path).toBe("/offers");
    expect(location.pathname).toBe("/offers");
  });

  it("Esc closes the map and removes its history entry", async () => {
    const before = history.state;
    showMap.value = true;
    await settle();

    await esc();
    await nextTick();
    expect(showMap.value).toBe(false);
    expect(history.state).toEqual(before);
    expect(router.currentRoute.value.path).toBe("/offers");
  });

  it("back closes a sheet opened over the map first, then the map", async () => {
    showMap.value = true;
    await settle();
    showSheet.value = true;
    await settle();

    await back();
    expect(sheet!.visible).toBe(false);
    expect(showMap.value).toBe(true);

    await back();
    expect(showMap.value).toBe(false);
    expect(router.currentRoute.value.path).toBe("/offers");
  });

  it("Esc closes a sheet opened over the map first, then the map", async () => {
    showMap.value = true;
    await settle();
    showSheet.value = true;
    await settle();

    await esc();
    expect(sheet!.visible).toBe(false);
    expect(showMap.value).toBe(true);

    await esc();
    expect(showMap.value).toBe(false);
  });
});
