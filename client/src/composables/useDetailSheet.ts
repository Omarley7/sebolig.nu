import { computed, inject, nextTick, provide, reactive, ref, shallowRef, watch, type InjectionKey } from "vue";
import { useRoute, useRouter, type HistoryState } from "vue-router";
import { SHEET_ENTRY } from "./useSheet";

/** Opens an item's detail sheet, at the top or scrolled to a section the sheet names (like "thread"). */
type OpenDetail = (id: string, section?: string) => void;

const OPEN_DETAIL: InjectionKey<OpenDetail> = Symbol("openDetail");

/**
 * The one detail of a list: a bottom sheet on phones, the right-hand pane on desktop (`inline`).
 * Holds the open item's id and looks the item up by it, so the detail stays open when the item
 * moves to another group. Cards open it through useOpenDetail(); the list renders it once,
 * outside its groups:
 *
 *   <OfferDetailSheet v-if="detail.item" :offer="detail.item" :gone="detail.gone"
 *     @close="detail.onClose" @after-leave="detail.onAfterLeave" />
 *
 * The address names the open item, `?open=<id>` (Q26), at every width: the sheet's own history
 * entry is its list page with `?open=`, so back closes it and a reload or a shared link opens it
 * again. A link naming an item (the changes panel's, say) opens it once the item is there.
 *
 * The sheet passes `gone` to useSheet({ closeWhen }), so an item that disappears from the store
 * slides out the normal way, still showing its last-known state. A card can open the sheet at a
 * section (`openDetail(id, "thread")`); the sheet gets it as `detail.section`. `onOpen` runs for
 * every item the detail opens for, however it was opened.
 *
 * Inline, there is no sheet: `pane` is the item the address names, or else `fallback()`'s, and
 * opening an item replaces the address rather than adding a step.
 */
export function useDetailSheet<T>(
  lookup: (id: string) => T | undefined,
  {
    onOpen,
    inline = () => false,
    fallback = () => undefined,
  }: { onOpen?(id: string): void; inline?: () => boolean; fallback?: () => string | undefined } = {},
) {
  const mounted = ref(false);
  const shownId = ref<string | null>(null);
  const shownSection = ref<string | null>(null);
  // The item the user wants open, and where; null from the moment the sheet starts closing
  const wanted = ref<{ id: string; section: string | null } | null>(null);
  const lastKnown = shallowRef<T>();

  const route = useRoute();
  const router = useRouter();

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
    onOpen?.(id);
  }

  const openDetail: OpenDetail = (id, section) => {
    if (inline()) {
      void router.replace({ query: { ...route.query, open: id } });
      return;
    }
    wanted.value = { id, section: section ?? null };
    // While the sheet slides out, wait for the slide-out to finish, then mount it again
    if (!mounted.value) mount(id, section ?? null);
  };

  provide(OPEN_DETAIL, openDetail);
  // The sheet's history entry: this page, naming the item it shows.
  provide(SHEET_ENTRY, (state) => void router.push({ query: { ...route.query, open: shownId.value ?? undefined }, state: state as HistoryState }));

  const linked = computed(() => {
    const id = route.query.open;
    return typeof id === "string" && lookup(id) !== undefined ? id : null;
  });
  watch(
    [linked, inline],
    async ([id, isInline]) => {
      if (id === null || isInline || (mounted.value && shownId.value === id)) return;
      const { open: _, ...query } = route.query;
      // The sheet adds the entry naming the item itself, so back closes it.
      await router.replace({ query });
      openDetail(id);
    },
    { immediate: true },
  );

  const paneId = computed(() => {
    if (!inline()) return null;
    const id = linked.value ?? fallback();
    return id !== undefined && lookup(id) !== undefined ? id : null;
  });
  watch(paneId, (id) => id !== null && onOpen?.(id), { immediate: true });

  return reactive({
    /** The item to show, its last-known state once it is gone; undefined when no sheet is mounted. */
    item: computed(() => (mounted.value ? (current.value ?? lastKnown.value) : undefined)),
    /** True when the open item has disappeared from the store. */
    gone: computed(() => mounted.value && current.value === undefined),
    /** The section the sheet was opened at, or null for the top. */
    section: computed(() => (mounted.value ? shownSection.value : null)),
    /** Inline: the item the pane shows. */
    pane: computed(() => (paneId.value === null ? undefined : lookup(paneId.value))),
    /** Inline: the id of the item the pane shows, to outline its row. */
    paneId,
    /** Opens an item's detail, as a card does: for the page itself, like the map's "Se detaljer". */
    open: openDetail,
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
