<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import DemoLoginButton from "~/components/DemoLoginButton.vue";
import { useAuth } from "~/composables/useAuth";
import { REPO_URL } from "~/config";

/**
 * The one place a tenant connects their findbolig.nu account. Used on the
 * landing page and inside the header modal, so both carry the same wording,
 * autofill hints and trust cues.
 */
const emit = defineEmits<{ connected: [] }>();

const auth = useAuth();
const { t } = useI18n();
const password = ref("");
const showPassword = ref(false);

async function handleConnect() {
  if (await auth.login(auth.email, password.value)) {
    password.value = "";
    emit("connected");
  }
}
</script>

<template>
  <div>
    <p class="text-sm font-medium text-violet-700 dark:text-violet-300 mb-4">
      {{ t("auth.connectHeading") }}
    </p>

    <form @submit.prevent="handleConnect" class="flex flex-col gap-4">
      <input
        v-model="auth.email"
        type="email"
        name="username"
        autocomplete="username"
        inputmode="email"
        :placeholder="t('auth.emailPlaceholder')"
        :aria-label="t('auth.emailPlaceholder')"
        :disabled="auth.isLoading"
        class="disabled:opacity-50 px-3 py-2 border border-violet-200 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-transparent"
      />
      <div class="relative">
        <input
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          name="password"
          autocomplete="current-password"
          :placeholder="t('auth.passwordPlaceholder')"
          :aria-label="t('auth.passwordPlaceholder')"
          :disabled="auth.isLoading"
          class="disabled:opacity-50 w-full px-3 py-2 pr-10 border border-violet-200 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-transparent"
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
        {{ auth.isLoading ? t("auth.connecting") : t("auth.connectButton") }}
      </button>

      <div class="relative flex items-center">
        <div class="grow border-t border-violet-200 dark:border-violet-800"></div>
        <span class="mx-3 text-xs text-violet-400 dark:text-violet-500">{{ t("auth.orSeparator") }}</span>
        <div class="grow border-t border-violet-200 dark:border-violet-800"></div>
      </div>

      <DemoLoginButton :disabled="auth.isLoading" />
    </form>

    <!-- Custody note: the true thing, always visible -->
    <p class="mt-4 text-xs text-gray-500 dark:text-gray-400 text-center">
      {{ t("auth.custodyNote") }}
      <router-link :to="{ name: 'explainer' }" class="font-medium text-violet-600 dark:text-violet-400 hover:underline">
        {{ t("explainer.linkLabel") }} →
      </router-link>
    </p>
    <p class="mt-2 text-[0.7rem] text-gray-400 dark:text-gray-500 text-center">
      {{ t("footer.notAffiliated") }}
      <a :href="REPO_URL" target="_blank" rel="noopener noreferrer" class="underline hover:text-gray-600 dark:hover:text-gray-300">
        {{ t("common.sourceCode") }}
      </a>
    </p>
  </div>
</template>
