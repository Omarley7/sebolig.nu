<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { captureItemShared } from "~/composables/usePostHog";
import { useScrollLock } from "~/composables/useScrollLock";
import { sharedFloorPlanImage } from "~/lib/imageTransform";
import { imageUrl } from "~/lib/imageUrl";
import type { ShareKind, ShareMethod, ShareOptions } from "~/lib/share";
import { useToastStore } from "~/stores/toast";

const props = defineProps<{
  kind: ShareKind;
  /** The text to send for the chosen options; the preview shows the same. */
  text: (options: ShareOptions) => string;
  /** The first floor plan's findbolig.nu path, or null when there is none. */
  floorPlan: string | null;
  fileName: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();
const toast = useToastStore();
useScrollLock();

/** Without a share menu (most desktop browsers) the panel copies the text instead. */
const hasShareMenu = typeof navigator.share === "function";
/** With one, a copy button sits beside it, for pasting on the same device. */
const canCopyBeside = hasShareMenu && !!navigator.clipboard;

/** What the user last chose to send along: a preference like language and theme, not Local data. */
const PREFERENCE_KEY = "share-preference";
type Choice = { mapLink: boolean; floorPlan: boolean };

function storedChoice(): Choice {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFERENCE_KEY) ?? "{}");
    return { mapLink: stored.mapLink === true, floorPlan: stored.floorPlan === true };
  } catch {
    return { mapLink: false, floorPlan: false };
  }
}

const choice = reactive(storedChoice());
watch(choice, (value) => localStorage.setItem(PREFERENCE_KEY, JSON.stringify(value)));

const text = computed(() => props.text({ mapLink: choice.mapLink }));

/**
 * The floor plan, fetched as the panel opens: the share menu must open within the tap, with no
 * time to fetch. Offered only where the browser can share files; a failed fetch leaves it out.
 */
const floorPlan = ref<{ state: "loading" | "failed" } | { state: "ready"; file: File; previewUrl: string } | null>(null);

function canShareFile(file: File) {
  return navigator.canShare?.({ files: [file] }) === true;
}

if (hasShareMenu && props.floorPlan && canShareFile(new File([], props.fileName, { type: "image/png" }))) {
  floorPlan.value = { state: "loading" };
  fetch(sharedFloorPlanImage(imageUrl(props.floorPlan)))
    .then((response) => {
      if (!response.ok) throw new Error(`Floor plan: ${response.status}`);
      return response.blob();
    })
    .then((blob) => {
      const file = new File([blob], props.fileName, { type: "image/png" });
      floorPlan.value = canShareFile(file) ? { state: "ready", file, previewUrl: URL.createObjectURL(file) } : null;
    })
    .catch(() => {
      floorPlan.value = { state: "failed" };
    });
}

onUnmounted(() => {
  if (floorPlan.value?.state === "ready") URL.revokeObjectURL(floorPlan.value.previewUrl);
});

const floorPlanSent = computed(() => (choice.floorPlan && floorPlan.value?.state === "ready" ? floorPlan.value : null));

function shared(method: ShareMethod) {
  captureItemShared(props.kind, method);
  emit("close");
}

/** Copies the text only, never the floor plan. */
function copy(then: () => void) {
  navigator.clipboard.writeText(text.value).then(
    () => {
      toast.success(t("share.copied"));
      then();
    },
    () => toast.error(t("share.failed")),
  );
}

/** Beside the share menu: the panel stays open, so the user can still share. */
function copyBeside() {
  copy(() => captureItemShared(props.kind, "clipboard"));
}

/**
 * Runs straight in the tap: the share menu only opens within the tap's activation. Never passes
 * `title`: iPhone turns it into extra text and Android drops it.
 */
function send() {
  if (!hasShareMenu) {
    copy(() => shared("clipboard"));
    return;
  }
  const file = floorPlanSent.value?.file;
  // Ticked, but still loading or failed: it goes without, and says so. The tap can't wait for it.
  const leftOut = choice.floorPlan && !!floorPlan.value && !file;
  navigator.share(file ? { text: text.value, files: [file] } : { text: text.value }).then(
    () => {
      if (leftOut) toast.warning(t("share.floorPlanLeftOut"));
      shared("share_sheet");
    },
    (error: unknown) => {
      // The user closed the share menu: not an error.
      if ((error as Error)?.name === "AbortError") return;
      toast.error(t("share.failed"));
    },
  );
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/80" @click.self="emit('close')">
      <div
        data-testid="share-panel"
        class="relative w-[90vw] max-w-md rounded-xl bg-white dark:bg-neutral-900 p-6 shadow-xl text-neutral-900 dark:text-neutral-100"
      >
        <!-- Close button -->
        <button
          class="absolute top-3 right-3 p-1 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors"
          @click="emit('close')"
        >
          <img src="/icons/x.svg" alt="Close" class="size-5 dark:invert" />
        </button>

        <h2 class="text-lg font-semibold mb-4">{{ t("share.title") }}</h2>

        <!-- Preview: what is sent, not how each app shows it -->
        <div class="relative rounded-2xl bg-neutral-100 dark:bg-white/5 p-3 text-sm">
          <button
            v-if="canCopyBeside"
            data-testid="share-copy"
            :aria-label="t('share.copy')"
            :title="t('share.copy')"
            class="absolute top-2 right-2 p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            @click="copyBeside"
          >
            <img src="/icons/copy.svg" alt="" class="size-4 opacity-60 dark:invert" />
          </button>
          <p data-testid="share-preview" class="whitespace-pre-wrap break-words" :class="{ 'pr-8': canCopyBeside }">{{ text }}</p>
          <img
            v-if="floorPlanSent"
            data-testid="share-preview-floor-plan"
            :src="floorPlanSent.previewUrl"
            alt=""
            class="mt-2 max-h-32 rounded-lg bg-white"
          />
        </div>

        <!-- Options: the text is always sent -->
        <div class="mt-4 space-y-2">
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input v-model="choice.mapLink" type="checkbox" class="size-4 accent-blue-600" />
            {{ t("share.mapLink") }}
          </label>
          <label v-if="floorPlan" class="flex items-center gap-2 text-sm cursor-pointer">
            <input v-model="choice.floorPlan" type="checkbox" class="size-4 accent-blue-600" />
            {{ t("share.floorPlan") }}
            <span v-if="floorPlan.state === 'loading'" class="text-xs text-neutral-400 dark:text-neutral-500">
              {{ t("share.floorPlanLoading") }}
            </span>
            <span v-else-if="floorPlan.state === 'failed'" class="text-xs text-neutral-400 dark:text-neutral-500">
              {{ t("share.floorPlanFailed") }}
            </span>
          </label>
        </div>

        <button
          class="mt-5 w-full flex items-center justify-center gap-2 p-3 rounded-xl
                 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
          @click="send"
        >
          {{ hasShareMenu ? t("share.send") : t("share.copy") }}
        </button>
      </div>
    </div>
  </Teleport>
</template>
