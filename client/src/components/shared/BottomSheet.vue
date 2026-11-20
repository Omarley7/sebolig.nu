<script setup lang="ts">
import { X } from "lucide-vue-next";
import { computed, onUnmounted, ref, watch } from "vue";
import i18n from "~/i18n";
import { useScrollLock } from "~/composables/useScrollLock";
import type { Sheet } from "~/composables/useSheet";

useScrollLock();

const props = defineProps<{
  sheet: Sheet;
  /** The dialog's accessible name. */
  label?: string;
}>();

// The app's i18n instance: sheets also mount in tests without the plugin installed.
const { t } = i18n.global;

const emit = defineEmits<{
  close: [];
  "after-leave": [];
}>();

const panelEl = ref<HTMLElement | null>(null);

// Drag-to-dismiss
const dragY = ref(0);
const isDragging = ref(false);
let dragStartY = 0;
let lastPointerId = 0;
const DISMISS_THRESHOLD = 120;

const panelStyle = computed(() => {
  if (isDragging.value && dragY.value > 0) {
    return { transform: `translateY(${dragY.value}px)`, transition: "none" };
  }
  return undefined;
});

const backdropOpacity = computed(() => {
  if (isDragging.value && dragY.value > 0) {
    return Math.max(0, 1 - dragY.value / 400);
  }
  return undefined;
});

function onDragStart(e: PointerEvent) {
  isDragging.value = true;
  dragStartY = e.clientY;
  dragY.value = 0;
  lastPointerId = e.pointerId;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onDragMove(e: PointerEvent) {
  if (!isDragging.value) return;
  dragY.value = Math.max(0, e.clientY - dragStartY);
}

function onDragEnd(e: PointerEvent) {
  if (!isDragging.value) return;
  isDragging.value = false;
  (e.currentTarget as HTMLElement).releasePointerCapture(lastPointerId);
  if (dragY.value > DISMISS_THRESHOLD) {
    props.sheet.close();
  } else {
    dragY.value = 0;
  }
}

let afterLeaveTimer: ReturnType<typeof setTimeout> | undefined;

watch(
  () => props.sheet.closed,
  (closed) => {
    if (!closed) return;

    // Notify parent immediately so logical state stays in sync with touches
    emit("close");

    // Signal DOM unmount after the CSS transition completes
    let fired = false;
    const emitAfterLeave = () => {
      if (fired) return;
      fired = true;
      clearTimeout(afterLeaveTimer);
      emit("after-leave");
    };
    panelEl.value?.addEventListener("transitionend", emitAfterLeave, { once: true });
    afterLeaveTimer = setTimeout(emitAfterLeave, 350); // fallback if transitionend doesn't fire
  },
  { flush: "sync" },
);

onUnmounted(() => clearTimeout(afterLeaveTimer));
</script>

<template>
  <Teleport to="body">
    <!-- Above the map (z-50), below popups opened from the sheet (z-[70]). From lg up, a centred panel. -->
    <div
      class="fixed inset-0 z-[60] flex items-end justify-center lg:items-center lg:p-6"
      :class="{ 'pointer-events-none': !sheet.visible }"
    >
      <!-- Backdrop -->
      <div
        data-sheet-backdrop
        class="absolute inset-0 bg-scrim transition-opacity duration-300"
        :class="sheet.visible ? 'opacity-100' : 'opacity-0'"
        :style="backdropOpacity != null ? { opacity: backdropOpacity } : undefined"
        @click="sheet.close()"
      />

      <!-- Sheet -->
      <div
        ref="panelEl"
        role="dialog"
        aria-modal="true"
        :aria-label="label"
        class="sheet-panel relative w-full max-w-2xl max-h-[92dvh] lg:max-w-xl lg:max-h-[88dvh]
               bg-surface text-ink rounded-t-[22px] lg:rounded-[22px] overflow-hidden
               flex flex-col shadow-2xl
               transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        :class="sheet.visible ? 'translate-y-0' : 'translate-y-[110%] lg:translate-y-[110vh]'"
        :style="panelStyle"
      >
        <!-- Drag handle -->
        <div
          data-sheet-handle
          class="flex justify-center pt-2.5 pb-2 shrink-0 cursor-grab active:cursor-grabbing touch-none select-none lg:hidden"
          @pointerdown="onDragStart"
          @pointermove="onDragMove"
          @pointerup="onDragEnd"
          @pointercancel="onDragEnd"
        >
          <div class="w-10 h-[5px] rounded-full bg-handle" />
        </div>

        <!-- Close button: below the drag handle, fully on the photo or level with the title row -->
        <button
          type="button"
          data-sheet-close
          class="absolute top-[26px] right-3 z-10 size-11 rounded-full flex items-center justify-center
                 bg-surface/90 text-ink shadow-sm hover:bg-subtle transition-colors lg:top-3"
          :aria-label="t('common.close')"
          @click="sheet.close()"
        >
          <X class="size-[18px]" :stroke-width="2.2" aria-hidden="true" />
        </button>

        <!-- Scrollable content -->
        <div data-sheet-scroll class="overflow-y-auto overscroll-contain flex-1 lg:pt-2">
          <slot />
        </div>

        <slot name="footer" />
      </div>
    </div>

    <!-- Popups opened from the sheet -->
    <slot name="popups" />
  </Teleport>
</template>
