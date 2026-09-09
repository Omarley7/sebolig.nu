<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useAuth } from "~/composables/useAuth";

defineProps<{ disabled?: boolean }>();

const auth = useAuth();
const { t } = useI18n();
const demoName = ref("");
const isModalOpen = ref(false);

function openModal() {
  demoName.value = "";
  isModalOpen.value = true;
}

function closeModal() {
  isModalOpen.value = false;
}

function handleSubmit() {
  if (!demoName.value.trim()) return;
  isModalOpen.value = false;
  auth.showLoginModal = false;
  auth.loginAsDemo(demoName.value.trim());
}
</script>

<template>
  <button
    type="button"
    @click="openModal"
    :disabled="disabled"
    class="disabled:opacity-50 w-full border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 px-4 py-2 rounded-md hover:bg-violet-100 dark:hover:bg-violet-900 transition-colors font-medium"
  >
    {{ t("auth.demoLogin") }}
  </button>

  <Teleport to="body">
    <div
      v-if="isModalOpen"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      @click.self="closeModal"
    >
      <div
        class="bg-violet-50 dark:bg-violet-950 text-gray-900 dark:text-gray-100 border border-violet-200 dark:border-violet-800/50 rounded-lg shadow-xl p-6 max-w-sm w-full mx-20"
      >
        <div class="flex justify-between items-center mb-1">
          <h2 class="text-xl font-semibold">{{ t("auth.demoLogin") }}</h2>
          <button
            @click="closeModal"
            class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            :aria-label="t('common.close')"
          >
            <img src="/icons/x.svg" alt="" class="size-6 dark:invert" />
          </button>
        </div>
        <p class="text-sm text-violet-600 dark:text-violet-400 mb-4">
          {{ t("auth.demoNameHint") }}
        </p>

        <form @submit.prevent="handleSubmit" class="flex flex-col gap-4">
          <input
            v-model="demoName"
            type="text"
            :placeholder="t('auth.demoNamePlaceholder')"
            autofocus
            class="px-3 py-2 border border-violet-200 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-transparent"
          />
          <div class="flex gap-3 justify-end">
            <button
              type="button"
              @click="closeModal"
              class="px-4 py-2 rounded-md border border-violet-200 dark:border-violet-700 text-gray-700 dark:text-gray-300 hover:bg-violet-100 dark:hover:bg-violet-900 transition-colors"
            >
              {{ t("auth.cancel") }}
            </button>
            <button
              type="submit"
              :disabled="!demoName.trim()"
              class="disabled:opacity-50 bg-violet-600 text-white px-4 py-2 rounded-md hover:bg-violet-700 transition-colors font-medium"
            >
              {{ t("auth.demoLogin") }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
