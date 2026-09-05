<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import DemoLoginButton from "~/components/DemoLoginButton.vue";
import { useAuth } from "~/composables/useAuth";

const auth = useAuth();
const { t } = useI18n();
const password = ref("");
const showPassword = ref(false);
const isLogoutModalOpen = ref(false);

async function handleLogin() {
  if (await auth.login(auth.email, password.value)) {
    password.value = "";
    auth.showLoginModal = false;
  }
}

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
    <!-- Login/Logout Button -->
    <div
      class="disabled:opacity-50 cursor-pointer p-2 bg-black/5 dark:bg-white/10 rounded-full hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
    >
      <div v-if="!auth.isAuthenticated" @click="openModal" :aria-label="t('common.login')">
        <img src="/icons/user-round-key.svg" :alt="t('common.login')" class="size-6 dark:invert" />
      </div>
      <div v-else @click="openLogoutModal" :disabled="auth.isLoading" :aria-label="t('common.logout')">
        <img src="/icons/log-out.svg" :alt="t('common.logout')" class="size-6 dark:invert" />
      </div>
    </div>

    <!-- Login Modal -->
    <Teleport to="body">
      <div
        v-if="auth.showLoginModal"
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        @click.self="closeModal"
      >
        <div
          class="bg-violet-50 dark:bg-violet-950 text-gray-900 dark:text-gray-100 border border-violet-200 dark:border-violet-800/50 rounded-lg shadow-xl p-6 max-w-md w-full mx-20"
        >
          <div class="flex justify-between items-center mb-1">
            <h2 class="text-xl font-semibold">{{ t("common.login") }}</h2>
            <button
              @click="closeModal"
              class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              aria-label="Close modal"
            >
              <img src="/icons/x.svg" alt="Close" class="size-6 dark:invert" />
            </button>
          </div>
          <p class="text-sm text-violet-600 dark:text-violet-400 mb-4">
            {{ t("auth.findboligCredentials") }}
          </p>

          <form @submit.prevent="handleLogin" class="flex flex-col gap-4">
            <div class="flex flex-col gap-2">
              <input
                id="email"
                v-model="auth.email"
                type="email"
                :placeholder="t('landing.emailPlaceholder')"
                :disabled="auth.isLoading"
                class="disabled:opacity-50 px-3 py-2 border border-violet-200 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-transparent"
              />
            </div>

            <div class="relative flex flex-col gap-2">
              <input
                id="password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                :placeholder="t('landing.passwordPlaceholder')"
                :disabled="auth.isLoading"
                class="disabled:opacity-50 px-3 py-2 pr-10 border border-violet-200 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-transparent"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                tabindex="-1"
              >
                <img v-if="showPassword" src="/icons/eye-off.svg" alt="Hide password" class="size-5 dark:invert opacity-60" />
                <img v-else src="/icons/eye.svg" alt="Show password" class="size-5 dark:invert opacity-60" />
              </button>
            </div>

            <button
              type="submit"
              :disabled="auth.isLoading || !auth.email || !password"
              class="disabled:opacity-50 bg-violet-600 text-white px-4 py-2 rounded-md hover:bg-violet-700 transition-colors font-medium"
            >
              {{ auth.isLoading ? t("auth.loggingIn") : t("common.login") }}
            </button>

            <div class="relative flex items-center">
              <div class="grow border-t border-violet-200 dark:border-violet-800"></div>
              <span class="mx-3 text-xs text-violet-400 dark:text-violet-500">{{
                t("auth.orSeparator")
              }}</span>
              <div class="grow border-t border-violet-200 dark:border-violet-800"></div>
            </div>

            <DemoLoginButton :disabled="auth.isLoading" />
          </form>
        </div>
      </div>
    </Teleport>

    <!-- Logout Confirmation Modal -->
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
            <h2 class="text-xl font-semibold">{{ t("common.logout") }}</h2>
            <button
              @click="closeLogoutModal"
              class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              aria-label="Close modal"
            >
              <img src="/icons/x.svg" alt="Close" class="size-6 dark:invert" />
            </button>
          </div>

          <p class="mb-2 text-gray-600 dark:text-gray-300">{{ t("auth.logoutConfirm") }}</p>
          <router-link
            to="/saadan-virker-det"
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
              :disabled="auth.isLoading"
              class="disabled:opacity-50 px-4 py-2 rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors font-medium"
            >
              {{ auth.isLoading ? t("auth.loggingOut") : t("common.logout") }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
