import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import { createRouter, createWebHistory, type Router } from "vue-router";
import BottomSheet from "~/components/shared/BottomSheet.vue";
import { useSheet, type Sheet, type SheetPopup } from "~/composables/useSheet";

// A detail sheet in miniature: a sheet with a gallery and a confirm dialog.
interface Harness {
  sheet: Sheet;
  gallery: SheetPopup;
  confirm: SheetPopup;
}

const busy = ref(false);
let router: Router;
let harness: Harness;
let events: string[];
let unmount = () => {};

const Detail = defineComponent({
  emits: ["close", "after-leave"],
  setup(_, { emit, expose }) {
    const sheet = useSheet();
    const gallery = sheet.popup();
    const confirm = sheet.popup({ escapable: () => !busy.value });
    expose({ sheet, gallery, confirm });
    return () =>
      h(
        BottomSheet,
        { sheet, onClose: () => emit("close"), onAfterLeave: () => emit("after-leave") },
        () => h("p", { class: "content" }, "Content"),
      );
  },
});

const Page = { render: () => null };

async function mountSheet() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const Root = defineComponent({
    setup: () => () =>
      h(Detail, {
        ref: (r: unknown) => { if (r) harness = r as Harness; },
        onClose: () => events.push("close"),
        onAfterLeave: () => events.push("after-leave"),
      }),
  });
  const app = createApp(Root).use(router);
  app.mount(host);
  unmount = () => {
    app.unmount();
    host.remove();
  };
  await frame();
}

const frame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));
const panel = () => document.querySelector<HTMLElement>("[role=dialog]")!;
const handle = () => document.querySelector<HTMLElement>("[data-sheet-handle]")!;

async function back() {
  history.back();
  await nextTick();
}

async function esc() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  await nextTick();
}

function drag(distance: number) {
  const opts = { pointerId: 1, bubbles: true };
  handle().dispatchEvent(new PointerEvent("pointerdown", { ...opts, clientY: 100 }));
  handle().dispatchEvent(new PointerEvent("pointermove", { ...opts, clientY: 100 + distance }));
  handle().dispatchEvent(new PointerEvent("pointerup", { ...opts, clientY: 100 + distance }));
}

beforeEach(async () => {
  busy.value = false;
  events = [];
  router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: "/", component: Page },
      { path: "/offers", component: Page },
    ],
  });
  await router.push("/");
  await router.push("/offers");
});

afterEach(() => unmount());

describe("BottomSheet with useSheet", () => {
  it("opens with one history entry of its own and shows its content", async () => {
    const before = history.length;
    await mountSheet();
    expect(history.length).toBe(before + 1);
    expect(harness.sheet.visible).toBe(true);
    expect(panel().querySelector(".content")?.textContent).toBe("Content");
  });

  it("back closes popups one layer at a time, then the sheet, without leaving the route", async () => {
    await mountSheet();
    harness.gallery.open();
    harness.confirm.open();

    await back();
    expect(harness.confirm.isOpen).toBe(false);
    expect(harness.gallery.isOpen).toBe(true);
    expect(harness.sheet.visible).toBe(true);

    await back();
    expect(harness.gallery.isOpen).toBe(false);
    expect(harness.sheet.visible).toBe(true);

    await back();
    expect(harness.sheet.visible).toBe(false);
    expect(events).toContain("close");
    expect(router.currentRoute.value.path).toBe("/offers");
    expect(location.pathname).toBe("/offers");
  });

  it("Esc closes popups one layer at a time, then the sheet", async () => {
    await mountSheet();
    harness.gallery.open();
    harness.confirm.open();

    await esc();
    expect(harness.confirm.isOpen).toBe(false);
    expect(harness.gallery.isOpen).toBe(true);

    await esc();
    expect(harness.gallery.isOpen).toBe(false);
    expect(harness.sheet.visible).toBe(true);

    await esc();
    expect(harness.sheet.visible).toBe(false);
    expect(router.currentRoute.value.path).toBe("/offers");
  });

  it("Esc leaves a busy confirm open, but back still closes it", async () => {
    await mountSheet();
    harness.confirm.open();
    busy.value = true;

    await esc();
    expect(harness.confirm.isOpen).toBe(true);
    expect(harness.sheet.visible).toBe(true);

    await back();
    expect(harness.confirm.isOpen).toBe(false);
    expect(harness.sheet.visible).toBe(true);
  });

  it("closing a popup from its own UI removes its history entry and keeps the sheet open", async () => {
    await mountSheet();
    const sheetState = history.state;
    harness.gallery.open();
    harness.gallery.close();
    await nextTick();
    expect(history.state).toEqual(sheetState);
    expect(harness.sheet.visible).toBe(true);

    // The next back closes the sheet, not a stale popup layer
    await back();
    expect(harness.sheet.visible).toBe(false);
  });

  it("closing the sheet in code unwinds every history entry it added", async () => {
    const before = history.state;
    await mountSheet();
    harness.gallery.open();
    harness.confirm.open();

    harness.sheet.close();
    await nextTick();
    expect(harness.gallery.isOpen).toBe(false);
    expect(harness.confirm.isOpen).toBe(false);
    expect(history.state).toEqual(before);
    expect(router.currentRoute.value.path).toBe("/offers");
    expect(events).toEqual(["close"]);
  });

  it("emits after-leave once the slide-out transition ends", async () => {
    await mountSheet();
    harness.sheet.close();
    await nextTick();
    expect(events).toEqual(["close"]);
    panel().dispatchEvent(new Event("transitionend"));
    expect(events).toEqual(["close", "after-leave"]);
  });

  it("emits after-leave on a timer when no transitionend arrives", async () => {
    await mountSheet();
    harness.sheet.close();
    await nextTick();
    await new Promise((r) => setTimeout(r, 400));
    expect(events).toEqual(["close", "after-leave"]);
  });

  it("drag past the threshold dismisses the sheet", async () => {
    await mountSheet();
    drag(150);
    await nextTick();
    expect(harness.sheet.visible).toBe(false);
    expect(events).toContain("close");
  });

  it("drag under the threshold snaps back", async () => {
    await mountSheet();
    drag(80);
    await nextTick();
    expect(harness.sheet.visible).toBe(true);
    expect(panel().style.transform).toBe("");
  });

  it("the close button and the backdrop close the sheet", async () => {
    await mountSheet();
    document.querySelector<HTMLElement>("[role=dialog] button[aria-label=Close]")!.click();
    await nextTick();
    expect(harness.sheet.visible).toBe(false);
    unmount();

    await mountSheet();
    document.querySelector<HTMLElement>("[data-sheet-backdrop]")!.click();
    await nextTick();
    expect(harness.sheet.visible).toBe(false);
  });
});
