import { createPinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { createApp } from "vue";
import App from "~/App.vue";
import { installConnectionGuard, installLocalData } from "~/app/wiring";
import { useDarkMode } from "~/composables/useDarkMode";
import { useLocale } from "~/composables/useLocale";
import i18n from "~/i18n";
import router from "~/router";
import "~/style.css";

const app = createApp(App);

const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);

app.use(pinia);
app.use(i18n);
app.use(router);
installLocalData();
installConnectionGuard();

// Initialize preferences (applies classes/attributes to <html> before mount)
useDarkMode();
useLocale();

app.mount("#app");
