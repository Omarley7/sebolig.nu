import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, type PropType } from "vue";
import { createRouter, createWebHistory, type Router } from "vue-router";
import BottomSheet from "~/components/shared/BottomSheet.vue";
import { useDetailSheet, useOpenDetail } from "~/composables/useDetailSheet";
import { useSheet, type Sheet } from "~/composables/useSheet";

// A list in miniature: items in two groups, cards that open a detail sheet,
// and one detail sheet rendered at list level.
interface Item {
  id: string;
  group: "new" | "accepted";
  name: string;
}

const items = ref<Item[]>([]);
let router: Router;
let sheet: Sheet | undefined;
let mounts: number;
let opened: string[];
let unmount = () => {};
// Desktop: the detail shows inline, in a pane, instead of in a sheet.
const inlineMode = ref(false);

const Detail = defineComponent({
  props: {
    item: { type: Object as PropType<Item>, required: true },
    gone: Boolean,
    section: { type: String as PropType<string | null>, default: null },
  },
  emits: ["close", "after-leave"],
  setup(props, { emit }) {
    mounts++;
    const own = (sheet = useSheet({ closeWhen: () => props.gone }));
    return () =>
      h(
        BottomSheet,
        { sheet: own, onClose: () => emit("close"), onAfterLeave: () => emit("after-leave") },
        () => h("p", { class: "detail", "data-section": props.section ?? "" }, props.item.name),
      );
  },
});

const Card = defineComponent({
  props: { item: { type: Object as PropType<Item>, required: true } },
  setup(props) {
    const openDetail = useOpenDetail();
    return () =>
      h("li", { class: "card", "data-id": props.item.id, onClick: () => openDetail(props.item.id) }, [
        h("span", {
          class: "card-thread",
          onClick: (event: Event) => (event.stopPropagation(), openDetail(props.item.id, "thread")),
        }),
      ]);
  },
});

const List = defineComponent({
  setup() {
    const detail = useDetailSheet((id) => items.value.find((i) => i.id === id), {
      onOpen: (id) => opened.push(id),
      inline: () => inlineMode.value,
      fallback: () => items.value[0]?.id,
    });
    return () => [
      detail.pane ? h("p", { class: "pane" }, detail.pane.name) : null,
      ...(["new", "accepted"] as const).map((group) =>
        h("ul", { key: group }, items.value.filter((i) => i.group === group).map((item) => h(Card, { key: item.id, item }))),
      ),
      detail.item
        ? h(Detail, {
            item: detail.item,
            gone: detail.gone,
            section: detail.section,
            onClose: detail.onClose,
            onAfterLeave: detail.onAfterLeave,
          })
        : null,
    ];
  },
});

const Page = { render: () => null };
const frame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));
const card = (id: string) => document.querySelector<HTMLElement>(`.card[data-id="${id}"]`)!;
const shown = () => document.querySelector(".detail")?.textContent;
const panel = () => document.querySelector<HTMLElement>("[role=dialog]")!;

async function tap(id: string) {
  card(id).click();
  await nextTick();
  await frame();
}

async function slideOut() {
  panel().dispatchEvent(new Event("transitionend"));
  await nextTick();
  await nextTick();
  await frame();
}

beforeEach(async () => {
  items.value = [
    { id: "a", group: "new", name: "Alpha" },
    { id: "b", group: "new", name: "Beta" },
  ];
  sheet = undefined;
  inlineMode.value = false;
  mounts = 0;
  opened = [];
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
  const app = createApp(List).use(router);
  app.mount(host);
  unmount = () => {
    app.unmount();
    host.remove();
  };
});

afterEach(() => unmount());

const section = () => document.querySelector<HTMLElement>(".detail")?.dataset.section;

describe("useDetailSheet", () => {
  it("every item opened is reported, however it was opened", async () => {
    await tap("a");
    sheet!.close();
    await nextTick();
    await slideOut();
    card("b").querySelector<HTMLElement>(".card-thread")!.click();
    await nextTick();

    expect(opened).toEqual(["a", "b"]);
  });

  it("a link naming an item opens its sheet once the item is there, and back closes it, staying on the page", async () => {
    items.value = [];
    await router.push({ path: "/offers", query: { open: "b", tab: "x" } });
    await nextTick();
    expect(shown()).toBeUndefined();

    items.value = [{ id: "b", group: "new", name: "Beta" }];
    await vi.waitFor(() => expect(shown()).toBe("Beta"));
    await vi.waitFor(() => expect(router.currentRoute.value.query).toEqual({ open: "b", tab: "x" }));

    history.back();
    await vi.waitFor(() => expect(sheet!.visible).toBe(false));
    await vi.waitFor(() => expect(router.currentRoute.value.query).toEqual({ tab: "x" }));
    expect(router.currentRoute.value.path).toBe("/offers");
  });

  it("while a sheet is open the address names its item, so a reload or a shared link opens it again", async () => {
    await tap("a");
    await vi.waitFor(() => expect(router.currentRoute.value.query).toEqual({ open: "a" }));

    sheet!.close();
    await vi.waitFor(() => expect(router.currentRoute.value.query).toEqual({}));
    await slideOut();
    expect(shown()).toBeUndefined();
  });

  it("a card can open its sheet at a section, and tapping the card itself opens it at the top", async () => {
    card("a").querySelector<HTMLElement>(".card-thread")!.click();
    await nextTick();
    await frame();
    expect([shown(), section()]).toEqual(["Alpha", "thread"]);

    sheet!.close();
    await nextTick();
    await slideOut();
    await tap("b");
    expect([shown(), section()]).toEqual(["Beta", ""]);
  });

  it("tapping a card opens its detail sheet", async () => {
    await tap("a");
    expect(shown()).toBe("Alpha");
    expect(sheet!.visible).toBe(true);
  });

  it("closing unmounts the sheet once the slide-out ends", async () => {
    await tap("a");
    sheet!.close();
    await nextTick();
    expect(shown()).toBe("Alpha");

    await slideOut();
    expect(shown()).toBeUndefined();
  });

  it("reopening the same item during the slide-out mounts it again after the slide-out", async () => {
    await tap("a");
    sheet!.close();
    await nextTick();
    await tap("a");
    expect(mounts).toBe(1);

    await slideOut();
    expect(mounts).toBe(2);
    expect(shown()).toBe("Alpha");
    expect(sheet!.visible).toBe(true);
  });

  it("tapping a different item during the slide-out shows that item after the slide-out", async () => {
    await tap("a");
    sheet!.close();
    await nextTick();
    await tap("b");
    expect(shown()).toBe("Alpha");

    await slideOut();
    expect(shown()).toBe("Beta");
    expect(sheet!.visible).toBe(true);
  });

  it("the item moving to another group keeps the sheet open, showing its new state", async () => {
    await tap("a");
    const before = history.length;
    items.value = items.value.map((i) => (i.id === "a" ? { ...i, group: "accepted", name: "Alpha ✓" } : i));
    await nextTick();

    expect(shown()).toBe("Alpha ✓");
    expect(sheet!.visible).toBe(true);
    expect(mounts).toBe(1);
    expect(history.length).toBe(before);

    // Back closes the sheet; there is no dead step left behind
    history.back();
    await nextTick();
    expect(sheet!.visible).toBe(false);
  });

  it("the item disappearing closes the sheet the normal way, showing the last-known item during the slide-out", async () => {
    await tap("a");
    items.value = items.value.filter((i) => i.id !== "a");
    await nextTick();

    expect(sheet!.visible).toBe(false);
    expect(shown()).toBe("Alpha");
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe("/offers"));
    expect(history.state.current).toBe("/offers");

    await slideOut();
    expect(shown()).toBeUndefined();
  });
});

describe("useDetailSheet inline, as the desktop pane", () => {
  const pane = () => document.querySelector(".pane")?.textContent;

  it("shows the first item until the address names one, and tapping a card names it without adding a back step", async () => {
    inlineMode.value = true;
    await router.replace({ path: "/offers", query: { tab: "x" } });
    await nextTick();
    expect(pane()).toBe("Alpha");

    const before = history.length;
    card("b").click();
    await vi.waitFor(() => expect(pane()).toBe("Beta"));
    expect(router.currentRoute.value.query).toEqual({ tab: "x", open: "b" });
    expect(history.length).toBe(before);
    expect(shown()).toBeUndefined();
    expect(opened).toEqual(["a", "b"]);
  });
});
