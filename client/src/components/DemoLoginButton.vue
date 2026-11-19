<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import AppDialog from "~/components/ui/AppDialog.vue";
import { useAuth } from "~/composables/useAuth";

/** "Prøv demoen" (Q12): asks for a nickname, then starts the Demo. */
defineProps<{ disabled?: boolean }>();

const auth = useAuth();
const { t } = useI18n();
const demoName = ref("");
const isOpen = ref(false);

function open() {
  demoName.value = "";
  isOpen.value = true;
}

function start() {
  if (!demoName.value.trim()) return;
  isOpen.value = false;
  auth.showConnectModal = false;
  auth.loginAsDemo(demoName.value.trim());
}
</script>

<template>
  <button type="button" class="btn btn-primary btn-lg w-full" :disabled="disabled" @click="open">
    {{ t("auth.demoLogin") }}
  </button>

  <AppDialog
    v-if="isOpen"
    :title="t('auth.demoLogin')"
    :body="t('auth.demoNameHint')"
    :confirm-label="t('auth.demoStart')"
    @confirm="start"
    @cancel="isOpen = false"
  >
    <form @submit.prevent="start">
      <input
        v-model="demoName"
        type="text"
        :placeholder="t('auth.demoNamePlaceholder')"
        :aria-label="t('auth.demoNamePlaceholder')"
        class="w-full h-[46px] px-3 rounded-[10px] border border-border-strong bg-surface text-ink text-base"
      />
    </form>
  </AppDialog>
</template>
