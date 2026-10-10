import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, h, nextTick } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import MapModal from "~/components/shared/MapModal.vue";
import i18n from "~/i18n";

let selected: string[];
let unmount = () => {};

const pins = [
  { id: "a", lat: 55.68, lng: 12.57, label: "Nørregade 1" },
  { id: "b", lat: 55.69, lng: 12.58, label: "<img src=x onerror=alert(1)>" },
];

beforeEach(async () => {
  selected = [];
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
});

afterEach(() => unmount());

const markers = () => [...document.querySelectorAll<HTMLElement>(".leaflet-marker-icon")];
const popup = () => document.querySelector<HTMLElement>(".leaflet-popup-content");

describe("MapModal", () => {
  it("tapping a pin opens its popup; Se detaljer selects that pin", async () => {
    markers()[0].click();
    expect(popup()?.textContent).toContain("Nørregade 1");

    popup()!.querySelector("button")!.click();
    expect(selected).toEqual(["a"]);
  });

  it("shows a pin's label as text, never as HTML", async () => {
    markers()[1].click();
    expect(popup()?.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(popup()?.querySelector("img")).toBeNull();
  });
});
