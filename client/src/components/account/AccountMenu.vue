<script setup lang="ts">
import { BookOpen, ChevronRight, LogOut } from "lucide-vue-next";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import BottomSheet from "~/components/shared/BottomSheet.vue";
import AppDialog from "~/components/ui/AppDialog.vue";
import SegmentedControl from "~/components/ui/SegmentedControl.vue";
import { useAuth } from "~/composables/useAuth";
import { useDarkMode } from "~/composables/useDarkMode";
import { useLocale } from "~/composables/useLocale";
import { useSheet } from "~/composables/useSheet";
import type { ThemePreference } from "~/lib/theme";
import UserAvatar from "./UserAvatar.vue";

/**
 * The account menu (Q4): who is connected, language, theme (Lys / Mørk / Automatisk), how it
 * works, and disconnecting, or ending the Demo. A bottom sheet on phones.
 */
const emit = defineEmits<{ "after-leave": [] }>();

const { t } = useI18n();
const auth = useAuth();
const router = useRouter();
const { locale } = useLocale();
const { preference } = useDarkMode();

const sheet = useSheet();
const confirm = sheet.popup();

const languages = computed(() => [
  { value: "da" as const, label: "Dansk" },
  { value: "en" as const, label: "English" },
]);
const themes = computed(() => [
  { value: "light" as ThemePreference, label: t("account.theme.light") },
  { value: "dark" as ThemePreference, label: t("account.theme.dark") },
  { value: "auto" as ThemePreference, label: t("account.theme.auto") },
]);

let goToExplainer = false;
function openExplainer() {
  goToExplainer = true;
  sheet.close();
}

function onAfterLeave() {
  emit("after-leave");
  if (goToExplainer) void router.push({ name: "explainer" });
}

async function disconnect() {
  confirm.close();
  sheet.close();
  await auth.disconnect();
}
</script>

<template>
  <BottomSheet :sheet="sheet" :label="t('account.open')" @after-leave="onAfterLeave">
    <div class="flex flex-col gap-5 px-5 pb-8 pt-1">
      <div class="flex items-center gap-3.5 pr-12">
        <UserAvatar large />
        <div class="flex flex-col gap-0.5 min-w-0">
          <span class="text-lg font-extrabold truncate">{{ auth.name || t("account.anonymous") }}</span>
          <span class="text-[13px] text-muted">{{ auth.isDemo ? t("account.demo") : t("account.connected") }}</span>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <span class="text-[13px] font-bold text-muted">{{ t("account.language") }}</span>
        <SegmentedControl v-model="locale" :options="languages" :label="t('account.language')" />
      </div>

      <div class="flex flex-col gap-2">
        <span class="text-[13px] font-bold text-muted">{{ t("account.theme.label") }}</span>
        <SegmentedControl v-model="preference" :options="themes" :label="t('account.theme.label')" />
      </div>

      <div class="flex flex-col rounded-2xl border border-border overflow-hidden">
        <button
          type="button"
          class="min-h-[52px] flex items-center gap-3 px-4 text-left border-b border-divider hover:bg-subtle"
          @click="openExplainer"
        >
          <BookOpen class="size-5 text-muted" aria-hidden="true" />
          <span class="flex-1 text-[15px] font-semibold">{{ t("explainer.linkLabel") }}</span>
          <ChevronRight class="size-4 text-muted" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="min-h-[52px] flex items-center gap-3 px-4 text-left text-urgent-ink hover:bg-subtle"
          @click="confirm.open()"
        >
          <LogOut class="size-5" aria-hidden="true" />
          <span class="flex-1 text-[15px] font-semibold">{{ auth.isDemo ? t("account.endDemo") : t("auth.disconnect") }}</span>
        </button>
      </div>
      <p class="-mt-3 px-1 text-xs leading-snug text-muted">
        {{ auth.isDemo ? t("account.endDemoNote") : t("account.disconnectNote") }}
      </p>
    </div>

    <template #popups>
      <AppDialog
        v-if="confirm.isOpen"
        :title="auth.isDemo ? t('account.endDemoTitle') : t('auth.disconnectTitle')"
        :body="auth.isDemo ? t('account.endDemoNote') : t('auth.disconnectConfirm')"
        :confirm-label="auth.isDemo ? t('account.endDemo') : t('auth.disconnectShort')"
        danger
        @confirm="disconnect"
        @cancel="confirm.close()"
      />
    </template>
  </BottomSheet>
</template>
