<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import L from "leaflet";
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

// Built from DOM nodes so the label is always text, never HTML
function popupContent(pin: MapPin): HTMLElement {
  const content = document.createElement("div");
  content.className = "flex flex-col items-start gap-2";
  const label = document.createElement("strong");
  label.textContent = pin.label;
  const details = document.createElement("button");
  details.type = "button";
  details.className = "px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors";
  details.textContent = t("common.seeDetails");
  details.addEventListener("click", () => emit("select", pin.id));
  content.append(label, details);
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

  const bounds = L.latLngBounds([]);

  for (const pin of props.pins) {
    L.marker([pin.lat, pin.lng], { icon: pinIcon }).addTo(map).bindPopup(popupContent(pin));
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
</style>
