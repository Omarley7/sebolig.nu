<script setup lang="ts">
import { X } from "lucide-vue-next";
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
  /** What is on the map, for the chip in its header: "Boligtilbud". */
  title?: string;
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
  if (pin.sublabel) content.append(textElement("div", pin.sublabel, "text-xs text-[#585E6C]"));
  for (const detail of pin.details) content.append(textElement("div", detail, "text-xs tabular-nums"));
  const seeDetails = textElement(
    "button",
    t("common.seeDetails"),
    "mt-2 min-h-9 px-3 rounded-lg text-xs font-bold bg-[#16213B] hover:bg-[#0B1224] text-white transition-colors",
  ) as HTMLButtonElement;
  seeDetails.type = "button";
  seeDetails.addEventListener("click", () => emit("select", pin.id));
  content.append(seeDetails);
  return content;
}

/** A navy map pin `width` pixels wide, as an image so it keeps its alt text. */
function navyPin(width: number): L.Icon {
  const height = Math.round(width * 1.35);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 32"><path d="M12 31s10-10.2 10-18.5A10 10 0 0 0 2 12.5C2 20.8 12 31 12 31z" fill="#16213B" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="12.5" r="3.6" fill="#fff"/></svg>`;
  return L.icon({
    iconUrl: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    iconSize: [width, height],
    iconAnchor: [width / 2, height],
    popupAnchor: [0, -height + 4],
  });
}

function initMap() {
  if (!mapContainer.value || props.pins.length === 0) return;

  map = L.map(mapContainer.value, { zoomControl: true });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  // Navy pins; the selected one grows rather than turning red, so it doesn't read as urgent.
  const pinIcon = navyPin(26);
  const selectedIcon = navyPin(38);

  // Nearby pins merge into a numbered circle; clicking it zooms in until they separate,
  // and pins at the very same spot fan out at the last zoom
  const clusters = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 50,
    // The count sits in an inner element: Leaflet's own CSS keeps the icon itself display: block
    iconCreateFunction: (cluster) =>
      L.divIcon({
        html: textElement("span", String(cluster.getChildCount()), "size-full flex items-center justify-center"),
        className: "marker-cluster rounded-full bg-[#16213B] text-white text-sm font-bold shadow-md ring-2 ring-white",
        iconSize: L.point(36, 36),
      }),
  }).addTo(map);

  const bounds = L.latLngBounds([]);

  for (const pin of props.pins) {
    const marker = L.marker([pin.lat, pin.lng], { icon: pinIcon, alt: pin.label }).bindPopup(popupContent(pin));
    marker.on("popupopen", () => marker.setIcon(selectedIcon));
    marker.on("popupclose", () => marker.setIcon(pinIcon));
    clusters.addLayer(marker);
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
    <!-- A full-height sheet on phones, a centred modal on desktop (Q19) -->
    <div class="fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:p-6">
      <div class="absolute inset-0 bg-scrim" @click="layer.close()" />
      <div
        role="dialog"
        aria-modal="true"
        :aria-label="t('common.map')"
        class="relative w-full h-[calc(100dvh-24px)] rounded-t-[22px] bg-surface shadow-2xl flex flex-col overflow-hidden
               lg:w-[min(1040px,100%)] lg:h-[min(680px,100%)] lg:rounded-[22px]"
      >
        <div class="flex items-center justify-between gap-3 pl-5 pr-2 py-2 border-b border-border">
          <div class="flex items-center gap-2 min-w-0">
            <h2 class="text-lg font-extrabold">{{ t("common.map") }}</h2>
            <span v-if="title" class="chip bg-chip text-chip-ink truncate">{{ title }} · {{ pins.length }}</span>
          </div>
          <button type="button" class="icon-btn rounded-full hover:bg-subtle" :aria-label="t('common.close')" @click="layer.close()">
            <X class="size-5" aria-hidden="true" />
          </button>
        </div>

        <div ref="mapContainer" class="sebolig-map flex-1 min-h-0" />

        <div v-if="pins.length === 0" class="absolute inset-0 top-14 flex items-center justify-center text-muted text-sm pointer-events-none">
          {{ t("common.noLocations") }}
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
@import "leaflet/dist/leaflet.css";
@import "leaflet.markercluster/dist/MarkerCluster.css";

.sebolig-map .leaflet-control-zoom a {
  width: 44px;
  height: 44px;
  line-height: 44px;
  font-size: 20px;
}
.sebolig-map .leaflet-popup-content-wrapper {
  border-radius: 14px;
}
</style>
