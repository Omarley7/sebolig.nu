import { computed, inject, nextTick, provide, reactive, ref, shallowRef, watch, type InjectionKey } from "vue";

const OPEN_DETAIL: InjectionKey<(id: string) => void> = Symbol("openDetail");

/**
 * The one detail sheet of a list. Holds the open item's id and looks the item up by it,
 * so the sheet stays open when the item moves to another group. Cards open it through
 * useOpenDetail(); the list renders the sheet once, outside its groups:
 *
 *   <OfferDetailSheet v-if="detail.item" :offer="detail.item" :gone="detail.gone"
 *     @close="detail.onClose" @after-leave="detail.onAfterLeave" />
 *
 * The sheet passes `gone` to useSheet({ closeWhen }), so an item that disappears from
 * the store slides out the normal way, still showing its last-known state.
 */
export function useDetailSheet<T>(lookup: (id: string) => T | undefined) {
  const mounted = ref(false);
  const shownId = ref<string | null>(null);
  // The item the user wants open; null from the moment the sheet starts closing
  const wantedId = ref<string | null>(null);
  const lastKnown = shallowRef<T>();

  const current = computed(() => (shownId.value == null ? undefined : lookup(shownId.value)));
  watch(current, (item) => {
    if (item !== undefined) lastKnown.value = item;
  });

  function mount(id: string) {
    const item = lookup(id);
    if (item === undefined) return;
    shownId.value = id;
    lastKnown.value = item;
    mounted.value = true;
  }

  function openDetail(id: string) {
    wantedId.value = id;
    // While the sheet slides out, wait for the slide-out to finish, then mount it again
    if (!mounted.value) mount(id);
  }

  provide(OPEN_DETAIL, openDetail);

  return reactive({
    /** The item to show, its last-known state once it is gone; undefined when no sheet is mounted. */
    item: computed(() => (mounted.value ? (current.value ?? lastKnown.value) : undefined)),
    /** True when the open item has disappeared from the store. */
    gone: computed(() => mounted.value && current.value === undefined),
    onClose() {
      wantedId.value = null;
    },
    async onAfterLeave() {
      mounted.value = false;
      shownId.value = null;
      const reopen = wantedId.value;
      if (reopen == null) return;
      await nextTick();
      mount(reopen);
    },
  });
}

/** Opens the detail sheet of the list this card sits in. */
export function useOpenDetail(): (id: string) => void {
  const openDetail = inject(OPEN_DETAIL);
  if (!openDetail) throw new Error("useOpenDetail() needs a list that calls useDetailSheet()");
  return openDetail;
}
