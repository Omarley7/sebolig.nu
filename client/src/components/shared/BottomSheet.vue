<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { useScrollLock } from "~/composables/useScrollLock";
import type { Sheet } from "~/composables/useSheet";

useScrollLock();

const props = defineProps<{
  sheet: Sheet;
}>();

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
  () => props.sheet.visible,
  (visible, wasVisible) => {
    if (visible || !wasVisible) return;

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
    <div
      class="fixed inset-0 z-50 flex items-end justify-center"
      :class="{ 'pointer-events-none': !sheet.visible }"
    >
      <!-- Backdrop -->
      <div
        data-sheet-backdrop
        class="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        :class="sheet.visible ? 'opacity-100' : 'opacity-0'"
        :style="backdropOpacity != null ? { opacity: backdropOpacity } : undefined"
        @click="sheet.close()"
      />

      <!-- Sheet -->
      <div
        ref="panelEl"
        role="dialog"
        aria-modal="true"
        class="sheet-panel relative w-full max-w-2xl max-h-[92vh]
               bg-white dark:bg-neutral-900
               rounded-t-2xl overflow-hidden
               flex flex-col shadow-2xl
               transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        :class="sheet.visible ? 'translate-y-0' : 'translate-y-full'"
        :style="panelStyle"
      >
        <!-- Drag handle -->
        <div
          data-sheet-handle
          class="flex justify-center pt-3 pb-3 shrink-0 cursor-grab active:cursor-grabbing touch-none select-none"
          @pointerdown="onDragStart"
          @pointermove="onDragMove"
          @pointerup="onDragEnd"
          @pointercancel="onDragEnd"
        >
          <div class="w-10 h-1 rounded-full bg-neutral-300 dark:bg-neutral-600" />
        </div>

        <!-- Close button -->
        <button
          class="absolute top-3 right-3 z-10 p-1.5 rounded-full
                 bg-black/20 hover:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20
                 transition-colors"
          aria-label="Close"
          @click="sheet.close()"
        >
          <img src="/icons/x.svg" alt="" class="size-4 invert" />
        </button>

        <!-- Scrollable content -->
        <div class="overflow-y-auto overscroll-contain flex-1">
          <slot />
        </div>

        <slot name="footer" />
      </div>
    </div>

    <!-- Popups opened from the sheet -->
    <slot name="popups" />
  </Teleport>
</template>
