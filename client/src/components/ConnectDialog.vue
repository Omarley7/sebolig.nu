<script setup lang="ts">
import { X } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import ConnectForm from "~/components/ConnectForm.vue";
import { useAuth } from "~/composables/useAuth";
import { useScrollLock } from "~/composables/useScrollLock";

/** Asks to connect again when a check needs a Connection it no longer has. */
const auth = useAuth();
const { t } = useI18n();
useScrollLock();

const close = () => (auth.showConnectModal = false);
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[70] flex items-center justify-center p-5">
      <div class="absolute inset-0 bg-scrim" @click="close" />
      <div role="dialog" aria-modal="true" :aria-label="t('common.connect')" class="relative w-full max-w-md rounded-[22px] bg-surface p-5 shadow-2xl">
        <div class="flex items-center justify-between mb-2 -mr-2">
          <h2 class="text-xl font-extrabold">{{ t("common.connect") }}</h2>
          <button type="button" class="icon-btn rounded-full" :aria-label="t('common.close')" @click="close">
            <X class="size-5" aria-hidden="true" />
          </button>
        </div>
        <ConnectForm @connected="close" />
      </div>
    </div>
  </Teleport>
</template>
