import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, h, nextTick } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import MapModal from "~/components/shared/MapModal.vue";
import i18n from "~/i18n";
import type { MapPin } from "~/lib/mapPin";

let selected: string[];
let unmount = () => {};

const pins: MapPin[] = [
  { id: "a", lat: 55.68, lng: 12.57, label: "Nørregade 1", sublabel: "1165 København K", details: ["d. 18/10, 15:00 - 16:00"] },
  {
    id: "b",
    lat: 55.69,
    lng: 12.58,
    label: "<img src=x onerror=alert(1)>",
    sublabel: "<b>2000</b>",
    details: ["<script>alert(2)</script>", "<a href=x>8.500 kr.</a>"],
  },
];

async function mount(pins: MapPin[]) {
  const router = createRouter({ history: createWebHistory(), routes: [{ path: "/", component: { render: () => null } }] });
  await router.push("/");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const app = createApp({
    render: () => h(MapModal, { pins, onSelect: (id: string) => selected.push(id) }),
  })
    .use(router)
    .use(i18n);
  app.mount(host);
  unmount = () => {
    app.unmount();
    host.remove();
  };
  await nextTick();
  await nextTick();
}

beforeEach(() => {
  selected = [];
  // happy-dom lays nothing out; give the map a size, or no pin is in view
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300);
});

afterEach(() => {
  unmount();
  vi.restoreAllMocks();
});

const markers = () => [...document.querySelectorAll<HTMLImageElement>("img.leaflet-marker-icon")];
const marker = (label: string) => markers().find((m) => m.alt === label)!;
const popup = () => document.querySelector<HTMLElement>(".leaflet-popup-content");
const lines = () => [...popup()!.querySelectorAll(":scope > div > *")].map((el) => el.textContent);

describe("MapModal", () => {
  beforeEach(() => mount(pins));

  it("tapping a pin opens its popup; Se detaljer selects that pin", async () => {
    marker("Nørregade 1").click();
    expect(popup()?.textContent).toContain("Nørregade 1");

    popup()!.querySelector("button")!.click();
    expect(selected).toEqual(["a"]);
  });

  it("shows a pin's address and detail lines, in order", async () => {
    marker("Nørregade 1").click();
    expect(lines()).toEqual(["Nørregade 1", "1165 København K", "d. 18/10, 15:00 - 16:00", "Se detaljer"]);
  });

  it("shows a pin's label and lines as text, never as HTML", async () => {
    marker("<img src=x onerror=alert(1)>").click();
    expect(lines()).toEqual([
      "<img src=x onerror=alert(1)>",
      "<b>2000</b>",
      "<script>alert(2)</script>",
      "<a href=x>8.500 kr.</a>",
      "Se detaljer",
    ]);
    expect(popup()?.querySelector("img, b, script, a")).toBeNull();
  });
});

describe("MapModal clustering", () => {
  const at = (id: string, lat: number, lng: number): MapPin => ({ id, lat, lng, label: id, sublabel: null, details: [] });
  const clusters = () => [...document.querySelectorAll<HTMLElement>(".marker-cluster")];

  it("merges pins at the same spot into one numbered cluster", async () => {
    await mount([at("a", 55.68, 12.57), at("b", 55.68, 12.57), at("c", 55.7, 12.6)]);
    expect(clusters().map((c) => c.textContent)).toEqual(["2"]);
    expect(markers().map((m) => m.alt)).toEqual(["c"]);
  });

  it("fans out pins at the same spot when their cluster is clicked, each with its own popup", async () => {
    await mount([at("a", 55.68, 12.57), at("b", 55.68, 12.57), at("c", 55.7, 12.6)]);
    clusters()[0].click();
    // Spiderfy animates for 200 ms (markercluster's own timing); wait it out
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(markers().map((m) => m.alt).sort()).toEqual(["a", "b", "c"]);

    marker("b").click();
    popup()!.querySelector("button")!.click();
    expect(selected).toEqual(["b"]);
  });
});
