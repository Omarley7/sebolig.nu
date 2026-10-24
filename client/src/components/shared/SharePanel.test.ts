import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, h, nextTick } from "vue";
import { useToastStore } from "~/stores/toast";
import SharePanel from "~/components/shared/SharePanel.vue";
import posthog from "posthog-js";
import i18n from "~/i18n";
import type { ShareOptions } from "~/lib/share";

vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));

const TEXT = "Fremvisning: Ålekistevej 59, 2720 Vanløse";
const MAP_LINE = "Kort: https://maps.example/x";
const text = ({ mapLink }: ShareOptions) => (mapLink ? `${TEXT}\n${MAP_LINE}` : TEXT);

let unmount = () => {};

function mount(props: { floorPlan?: string | null } = {}) {
  unmount();
  const pinia = createPinia();
  setActivePinia(pinia);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const app = createApp({
    render: () => h(SharePanel, { kind: "viewing", text, floorPlan: props.floorPlan ?? null, fileName: "plantegning-alekistevej-59.png" }),
  })
    .use(pinia)
    .use(i18n);
  app.mount(host);
  unmount = () => {
    app.unmount();
    host.remove();
    unmount = () => {};
  };
}

/** The panel is teleported to the body. */
const panel = () => document.querySelector<HTMLElement>("[data-testid=share-panel]")!;
const preview = () => panel().querySelector<HTMLElement>("[data-testid=share-preview]")!;
const option = (label: string) =>
  [...panel().querySelectorAll("label")].find((l) => l.textContent?.includes(label))?.querySelector("input") ?? null;

const button = (label: string) =>
  [...panel().querySelectorAll("button")].find((b) => b.textContent?.trim() === label) ?? null;
const toasts = () => useToastStore().toasts.map((toast) => toast.message);

/** A device with a share menu; `share` resolves or rejects as the user finishes it. */
function stubShareMenu(share = vi.fn(() => Promise.resolve()), canShare = vi.fn(() => true)) {
  vi.stubGlobal("navigator", { ...navigator, share, canShare });
  return share;
}

/** Lets the share menu's promise settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

async function toggle(input: HTMLInputElement) {
  input.click();
  await nextTick();
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(posthog.capture).mockClear();
});

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
});

describe("SharePanel", () => {
  it("previews the text exactly as sent, and adds the map line once it is ticked", async () => {
    mount();

    expect(preview().textContent).toBe(TEXT);
    const mapLink = option("Kortlink")!;
    expect(mapLink.checked).toBe(false);

    await toggle(mapLink);

    expect(preview().textContent).toBe(`${TEXT}\n${MAP_LINE}`);
  });

  it("remembers the last choice on the device, as a preference", async () => {
    mount();
    await toggle(option("Kortlink")!);

    mount();

    expect(option("Kortlink")!.checked).toBe(true);
    expect(preview().textContent).toBe(`${TEXT}\n${MAP_LINE}`);
  });

  it("opens the share menu with the chosen text and no title, and counts the share without its content", async () => {
    const share = stubShareMenu();
    mount();
    await toggle(option("Kortlink")!);

    button("Del")!.click();
    await settle();

    expect(share).toHaveBeenCalledWith({ text: `${TEXT}\n${MAP_LINE}` });
    expect(posthog.capture).toHaveBeenCalledExactlyOnceWith("item_shared", { kind: "viewing", method: "share_sheet" });
  });

  it("takes a cancelled share menu quietly: no toast, no event", async () => {
    stubShareMenu(vi.fn(() => Promise.reject(new DOMException("Share canceled", "AbortError"))));
    mount();

    button("Del")!.click();
    await settle();

    expect(toasts()).toEqual([]);
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("copies the text instead where there is no share menu, and says so", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, share: undefined, canShare: undefined, clipboard: { writeText } });
    mount();

    button("Kopiér")!.click();
    await settle();

    expect(writeText).toHaveBeenCalledWith(TEXT);
    expect(toasts()).toEqual(["Tekst kopieret"]);
    expect(posthog.capture).toHaveBeenCalledExactlyOnceWith("item_shared", { kind: "viewing", method: "clipboard" });
  });

  describe("floor plan", () => {
    const FLOOR_PLAN = "/data/media/a/plan.png";
    const png = () => new Response(new Blob(["png"], { type: "image/png" }));

    it("is not offered when the viewing has none", () => {
      stubShareMenu();
      mount();

      expect(option("Plantegning")).toBeNull();
    });

    it("is not offered when the browser cannot share files", () => {
      stubShareMenu(undefined, vi.fn(() => false));
      vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(png())));
      mount({ floorPlan: FLOOR_PLAN });

      expect(option("Plantegning")).toBeNull();
    });

    it("is not offered where there is no share menu, only copying", () => {
      vi.stubGlobal("navigator", { ...navigator, share: undefined, canShare: undefined, clipboard: { writeText: vi.fn() } });
      mount({ floorPlan: FLOOR_PLAN });

      expect(option("Plantegning")).toBeNull();
    });

    it("is fetched as a PNG through the image proxy and sent along with the text when ticked", async () => {
      const share = stubShareMenu();
      const fetchMock = vi.fn((_url: string) => Promise.resolve(png()));
      vi.stubGlobal("fetch", fetchMock);
      mount({ floorPlan: FLOOR_PLAN });
      const floorPlan = option("Plantegning")!;
      expect(floorPlan.checked).toBe(false);

      await toggle(floorPlan);
      await settle();
      expect(panel().querySelector("[data-testid=share-preview-floor-plan]")).not.toBeNull();
      button("Del")!.click();
      await settle();

      const url = new URL(fetchMock.mock.calls[0][0]);
      expect(url.host).toBe("wsrv.nl");
      expect(url.searchParams.get("output")).toBe("png");
      const [data] = share.mock.calls[0] as unknown as [ShareData];
      expect(data.text).toBe(TEXT);
      expect(data).not.toHaveProperty("title");
      expect(data.files).toHaveLength(1);
      expect(data.files![0]).toMatchObject({ name: "plantegning-alekistevej-59.png", type: "image/png" });
      expect(toasts()).toEqual([]);
    });

    it("is left out when it could not be fetched, and the toast says so", async () => {
      const share = stubShareMenu();
      vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
      mount({ floorPlan: FLOOR_PLAN });
      await toggle(option("Plantegning")!);
      await settle();

      button("Del")!.click();
      await settle();

      expect(share).toHaveBeenCalledWith({ text: TEXT });
      expect(toasts()).toEqual(["Delt uden plantegningen"]);
    });

    it("is left out when it has not arrived by the tap, and the toast says so", async () => {
      const share = stubShareMenu();
      vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
      mount({ floorPlan: FLOOR_PLAN });
      await toggle(option("Plantegning")!);

      button("Del")!.click();
      await settle();

      expect(share).toHaveBeenCalledWith({ text: TEXT });
      expect(toasts()).toEqual(["Delt uden plantegningen"]);
    });
  });
});

