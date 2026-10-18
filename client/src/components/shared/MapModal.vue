<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import L from "leaflet";
import "leaflet.markercluster";
import { useHistoryLayer } from "~/composables/useHistoryLayer";
import { useScrollLock } from "~/composables/useScrollLock";
import type { MapPin } from "~/lib/mapPin";

const { t } = useI18n();

const props = defineProps<{
  pins: MapPin[];
}>();

const emit = defineEmits<{
  close: [];
  /** "Se detaljer" in a pin's popup; the map stays open underneath. */
  select: [id: string];
}>();

useScrollLock();

// Back and Esc close the map without leaving the route
const layer = useHistoryLayer({ onClose: () => emit("close") });

const mapContainer = ref<HTMLDivElement>();
let map: L.Map | null = null;

function textElement(tag: string, text: string, className: string): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = text;
  return el;
}

// Built from DOM nodes so the label and lines are always text, never HTML.
// Divs, not paragraphs: Leaflet's popup gives a <p> wide margins.
function popupContent(pin: MapPin): HTMLElement {
  const content = document.createElement("div");
  content.className = "flex flex-col items-start gap-0.5";
  content.append(textElement("strong", pin.label, "text-sm"));
  if (pin.sublabel) content.append(textElement("div", pin.sublabel, "text-xs text-neutral-500"));
  for (const detail of pin.details) content.append(textElement("div", detail, "text-xs tabular-nums"));
  const seeDetails = textElement(
    "button",
    t("common.seeDetails"),
    "mt-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors",
  ) as HTMLButtonElement;
  seeDetails.type = "button";
  seeDetails.addEventListener("click", () => emit("select", pin.id));
  content.append(seeDetails);
  return content;
}

function initMap() {
  if (!mapContainer.value || props.pins.length === 0) return;

  map = L.map(mapContainer.value, { zoomControl: true });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  const pinIcon = L.icon({
    iconUrl: "/leaflet/marker-icon.png",
    iconRetinaUrl: "/leaflet/marker-icon-2x.png",
    shadowUrl: "/leaflet/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

  // Nearby pins merge into a numbered circle; clicking it zooms in until they separate,
  // and pins at the very same spot fan out at the last zoom
  const clusters = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 50,
    // The count sits in an inner element: Leaflet's own CSS keeps the icon itself display: block
    iconCreateFunction: (cluster) =>
      L.divIcon({
        html: textElement("span", String(cluster.getChildCount()), "size-full flex items-center justify-center"),
        className: "marker-cluster rounded-full bg-emerald-500 text-white text-sm font-semibold shadow-md ring-2 ring-white",
        iconSize: L.point(36, 36),
      }),
  }).addTo(map);

  const bounds = L.latLngBounds([]);

  for (const pin of props.pins) {
    clusters.addLayer(L.marker([pin.lat, pin.lng], { icon: pinIcon, alt: pin.label }).bindPopup(popupContent(pin)));
    bounds.extend([pin.lat, pin.lng]);
  }

  if (props.pins.length === 1) {
    map.setView([props.pins[0].lat, props.pins[0].lng], 15);
  } else {
    map.fitBounds(bounds, { padding: [40, 40] });
  }
}

onMounted(async () => {
  layer.open();
  await nextTick();
  initMap();
});

onUnmounted(() => {
  if (map) {
    map.remove();
    map = null;
  }
});
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80" @click.self="layer.close()">
      <div
        class="relative w-[92vw] max-w-2xl h-[70vh] rounded-xl bg-white dark:bg-neutral-900 shadow-xl flex flex-col overflow-hidden">
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700/50">
          <h2 class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{{ $t("common.map") }}</h2>
          <button class="p-1 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors" @click="layer.close()">
            <img src="/icons/x.svg" alt="Close" class="size-5 dark:invert" />
          </button>
        </div>

        <!-- Map -->
        <div ref="mapContainer" class="flex-1 min-h-0" />

        <!-- Fallback when no locations -->
        <div v-if="pins.length === 0"
          class="absolute inset-0 flex items-center justify-center text-neutral-500 dark:text-neutral-400 text-sm pointer-events-none">
          Ingen lokationer tilgængelige
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
@import "leaflet/dist/leaflet.css";
@import "leaflet.markercluster/dist/MarkerCluster.css";
</style>
