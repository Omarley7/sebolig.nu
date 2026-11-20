import { readonly, ref } from "vue";

/** The time now, ticking once a minute: enough for deadlines, "updated … ago" and today's agenda. */
const now = ref(new Date());
setInterval(() => (now.value = new Date()), 60_000);

export function useNow() {
  return readonly(now);
}
