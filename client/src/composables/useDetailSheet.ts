import { computed, inject, nextTick, provide, reactive, ref, shallowRef, watch, type InjectionKey } from "vue";

/** Opens an item's detail sheet, at the top or scrolled to a section the sheet names (like "thread"). */
type OpenDetail = (id: string, section?: string) => void;

const OPEN_DETAIL: InjectionKey<OpenDetail> = Symbol("openDetail");

/**
 * The one detail sheet of a list. Holds the open item's id and looks the item up by it,
 * so the sheet stays open when the item moves to another group. Cards open it through
 * useOpenDetail(); the list renders the sheet once, outside its groups:
 *
 *   <OfferDetailSheet v-if="detail.item" :offer="detail.item" :gone="detail.gone"
 *     @close="detail.onClose" @after-leave="detail.onAfterLeave" />
 *
 * The sheet passes `gone` to useSheet({ closeWhen }), so an item that disappears from
 * the store slides out the normal way, still showing its last-known state. A card can open
 * the sheet at a section (`openDetail(id, "thread")`); the sheet gets it as `detail.section`.
 */
export function useDetailSheet<T>(lookup: (id: string) => T | undefined) {
  const mounted = ref(false);
  const shownId = ref<string | null>(null);
  const shownSection = ref<string | null>(null);
  // The item the user wants open, and where; null from the moment the sheet starts closing
  const wanted = ref<{ id: string; section: string | null } | null>(null);
  const lastKnown = shallowRef<T>();

  const current = computed(() => (shownId.value == null ? undefined : lookup(shownId.value)));
  watch(current, (item) => {
    if (item !== undefined) lastKnown.value = item;
  });

  function mount(id: string, section: string | null) {
    const item = lookup(id);
    if (item === undefined) return;
    shownId.value = id;
    shownSection.value = section;
    lastKnown.value = item;
    mounted.value = true;
  }

  const openDetail: OpenDetail = (id, section) => {
    wanted.value = { id, section: section ?? null };
    // While the sheet slides out, wait for the slide-out to finish, then mount it again
    if (!mounted.value) mount(id, section ?? null);
  };

  provide(OPEN_DETAIL, openDetail);

  return reactive({
    /** The item to show, its last-known state once it is gone; undefined when no sheet is mounted. */
    item: computed(() => (mounted.value ? (current.value ?? lastKnown.value) : undefined)),
    /** True when the open item has disappeared from the store. */
    gone: computed(() => mounted.value && current.value === undefined),
    /** The section the sheet was opened at, or null for the top. */
    section: computed(() => (mounted.value ? shownSection.value : null)),
    onClose() {
      wanted.value = null;
    },
    async onAfterLeave() {
      mounted.value = false;
      shownId.value = null;
      const reopen = wanted.value;
      if (reopen == null) return;
      await nextTick();
      mount(reopen.id, reopen.section);
    },
  });
}

/** Opens the detail sheet of the list this card sits in. */
export function useOpenDetail(): OpenDetail {
  const openDetail = inject(OPEN_DETAIL);
  if (!openDetail) throw new Error("useOpenDetail() needs a list that calls useDetailSheet()");
  return openDetail;
}
