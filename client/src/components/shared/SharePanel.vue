<script setup lang="ts">
import { Copy, Share2, X } from "lucide-vue-next";
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
    <!-- A bottom sheet on phones, a centred panel on desktop -->
    <div class="fixed inset-0 z-[70] flex items-end justify-center lg:items-center lg:p-6">
      <div class="absolute inset-0 bg-scrim" @click="emit('close')" />
      <div
        data-testid="share-panel"
        role="dialog"
        aria-modal="true"
        :aria-label="t('share.title')"
        class="relative w-full max-w-lg flex flex-col gap-3.5 px-5 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] rounded-t-[22px] bg-surface shadow-2xl
               lg:rounded-[22px] lg:pb-6"
      >
        <span class="self-center w-10 h-[5px] mt-2.5 rounded-full bg-handle lg:hidden" aria-hidden="true" />
        <div class="flex items-center justify-between gap-2 -mr-2 lg:mt-3">
          <h2 class="text-[21px] font-extrabold tracking-tight">{{ t("share.title") }}</h2>
          <button type="button" class="icon-btn rounded-full bg-subtle" :aria-label="t('common.close')" @click="emit('close')">
            <X class="size-[18px]" :stroke-width="2.2" aria-hidden="true" />
          </button>
        </div>

        <!-- Preview: what is sent, not how each app shows it -->
        <div class="relative rounded-[14px] bg-bg border border-border py-3.5 pl-4" :class="canCopyBeside ? 'pr-[52px]' : 'pr-4'">
          <button
            v-if="canCopyBeside"
            type="button"
            data-testid="share-copy"
            :aria-label="t('share.copy')"
            :title="t('share.copy')"
            class="icon-btn absolute top-1.5 right-1.5 rounded-[10px] hover:bg-subtle"
            @click="copyBeside"
          >
            <Copy class="size-[18px]" aria-hidden="true" />
          </button>
          <p data-testid="share-preview" class="text-sm leading-[1.55] whitespace-pre-wrap break-words">{{ text }}</p>
          <img
            v-if="floorPlanSent"
            data-testid="share-preview-floor-plan"
            :src="floorPlanSent.previewUrl"
            alt=""
            class="mt-2 max-h-32 rounded-lg bg-white"
          />
        </div>

        <!-- Options: the text is always sent -->
        <div class="flex flex-col">
          <label class="min-h-12 flex items-center gap-3 px-1 cursor-pointer text-[15px] font-semibold">
            <input v-model="choice.mapLink" type="checkbox" class="size-6 shrink-0 rounded-[7px] accent-accent" />
            {{ t("share.mapLink") }}
          </label>
          <label v-if="floorPlan" class="min-h-12 flex items-center gap-3 px-1 cursor-pointer text-[15px] font-semibold">
            <input v-model="choice.floorPlan" type="checkbox" class="size-6 shrink-0 rounded-[7px] accent-accent" />
            {{ t("share.floorPlan") }}
            <span v-if="floorPlan.state === 'loading'" class="font-medium text-muted">{{ t("share.floorPlanLoading") }}</span>
            <span v-else-if="floorPlan.state === 'failed'" class="font-medium text-muted">{{ t("share.floorPlanFailed") }}</span>
          </label>
        </div>

        <button type="button" class="btn btn-primary btn-lg" @click="send">
          <Share2 v-if="hasShareMenu" class="size-[18px]" aria-hidden="true" />
          <Copy v-else class="size-[18px]" aria-hidden="true" />
          {{ hasShareMenu ? t("share.send") : t("share.copy") }}
        </button>
      </div>
    </div>
  </Teleport>
</template>
