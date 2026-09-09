<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import ConnectForm from "~/components/ConnectForm.vue";
import { useAuth } from "~/composables/useAuth";

const auth = useAuth();
const { t } = useI18n();
const isLogoutModalOpen = ref(false);

function openModal() {
  auth.showLoginModal = true;
}

function closeModal() {
  auth.showLoginModal = false;
}

function openLogoutModal() {
  isLogoutModalOpen.value = true;
}

function closeLogoutModal() {
  isLogoutModalOpen.value = false;
}

function confirmLogout() {
  isLogoutModalOpen.value = false;
  auth.logout();
}
</script>

<template>
  <div>
    <!-- Connect / disconnect trigger -->
    <div
      class="disabled:opacity-50 cursor-pointer p-2 bg-black/5 dark:bg-white/10 rounded-full hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
    >
      <div v-if="!auth.isAuthenticated" @click="openModal" :aria-label="t('common.connect')">
        <img src="/icons/user-round-key.svg" :alt="t('common.connect')" class="size-6 dark:invert" />
      </div>
      <div v-else @click="openLogoutModal" :disabled="auth.isLoading" :aria-label="t('auth.disconnect')">
        <img src="/icons/log-out.svg" :alt="t('auth.disconnect')" class="size-6 dark:invert" />
      </div>
    </div>

    <!-- Connect modal -->
    <Teleport to="body">
      <div
        v-if="auth.showLoginModal"
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        @click.self="closeModal"
      >
        <div
          class="bg-violet-50 dark:bg-violet-950 text-gray-900 dark:text-gray-100 border border-violet-200 dark:border-violet-800/50 rounded-lg shadow-xl p-6 max-w-md w-full mx-20"
        >
          <div class="flex justify-between items-center mb-3">
            <h2 class="text-xl font-semibold">{{ t("common.connect") }}</h2>
            <button
              @click="closeModal"
              class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              aria-label="Close modal"
            >
              <img src="/icons/x.svg" alt="Close" class="size-6 dark:invert" />
            </button>
          </div>
          <ConnectForm @connected="closeModal" />
        </div>
      </div>
    </Teleport>

    <!-- Disconnect confirmation -->
    <Teleport to="body">
      <div
        v-if="isLogoutModalOpen"
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        @click.self="closeLogoutModal"
      >
        <div
          class="bg-violet-50 dark:bg-violet-950 text-gray-900 dark:text-gray-100 border border-violet-200 dark:border-violet-800/50 rounded-lg shadow-xl p-6 max-w-sm w-full mx-20"
        >
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-semibold">{{ t("auth.disconnect") }}</h2>
            <button
              @click="closeLogoutModal"
              class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              aria-label="Close modal"
            >
              <img src="/icons/x.svg" alt="Close" class="size-6 dark:invert" />
            </button>
          </div>

          <p class="mb-2 text-gray-600 dark:text-gray-300">{{ t("auth.disconnectConfirm") }}</p>
          <router-link
            :to="{ name: 'explainer' }"
            @click="closeLogoutModal"
            class="inline-block mb-6 text-sm text-violet-600 dark:text-violet-400 hover:underline"
          >
            {{ t("explainer.linkLabel") }} →
          </router-link>

          <div class="flex gap-3 justify-end">
            <button
              @click="closeLogoutModal"
              class="px-4 py-2 rounded-md border border-violet-200 dark:border-violet-700 text-gray-700 dark:text-gray-300 hover:bg-violet-100 dark:hover:bg-violet-900 transition-colors"
            >
              {{ t("auth.cancel") }}
            </button>
            <button
              @click="confirmLogout"
              class="px-4 py-2 rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors font-medium"
            >
              {{ t("auth.disconnect") }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
