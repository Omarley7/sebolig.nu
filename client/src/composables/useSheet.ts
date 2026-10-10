import { onMounted, onUnmounted, reactive } from "vue";

/** A layer opened on top of a sheet: gallery, financials, confirm dialog. */
export interface SheetPopup {
  readonly isOpen: boolean;
  open(): void;
  close(): void;
}

export interface PopupOptions {
  /** Whether Esc may close the popup right now. Back always can. */
  escapable?: () => boolean;
}

export interface Sheet {
  /** False before the slide-in and from the moment the sheet starts closing. */
  readonly visible: boolean;
  popup(options?: PopupOptions): SheetPopup;
  /** Closes every open popup and the sheet, removing all history entries they added. */
  close(): void;
}

interface Layer {
  state: SheetPopup & { isOpen: boolean };
  escapable: () => boolean;
}

// Each history entry the sheet adds records how many popups were open on it,
// so a popstate tells exactly which layers to close however the events are timed.
const LAYER_KEY = "sheetLayer";

function layerOf(state: unknown): number | undefined {
  const layer = (state as Record<string, unknown> | null)?.[LAYER_KEY];
  return typeof layer === "number" ? layer : undefined;
}

/**
 * Back button and Esc handling for a bottom sheet and the popups opened from it.
 * Call it in the detail sheet's setup and pass the result to <BottomSheet :sheet>.
 *
 * Back and Esc close the top popup first, then the sheet. Back never changes the route:
 * the sheet and each popup sit on history entries of their own on top of the page's.
 */
export function useSheet(): Sheet {
  const stack: Layer[] = [];

  const sheet = reactive({
    visible: false,
    popup,
    close,
  });

  function pushLayer() {
    history.pushState({ [LAYER_KEY]: stack.length }, "");
  }

  function popup(options: PopupOptions = {}): SheetPopup {
    const layer: Layer = {
      escapable: options.escapable ?? (() => true),
      state: reactive({
        isOpen: false,
        open() {
          if (layer.state.isOpen || !sheet.visible) return;
          layer.state.isOpen = true;
          stack.push(layer);
          pushLayer();
        },
        close() {
          if (!layer.state.isOpen) return;
          layer.state.isOpen = false;
          stack.splice(stack.indexOf(layer), 1);
          history.back();
        },
      }),
    };
    return layer.state;
  }

  function closeLayersAbove(depth: number) {
    while (stack.length > depth) stack.pop()!.state.isOpen = false;
  }

  function close() {
    finish(false);
  }

  function finish(viaPopState: boolean) {
    if (!sheet.visible) return;
    sheet.visible = false;
    window.removeEventListener("popstate", onPopState);
    window.removeEventListener("keydown", onKeydown);
    const added = stack.length + 1;
    closeLayersAbove(0);
    if (!viaPopState) history.go(-added);
  }

  function onPopState(event: PopStateEvent) {
    const depth = layerOf(event.state);
    if (depth === undefined) finish(true); // back past the sheet's own entry
    else closeLayersAbove(depth);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    const top = stack[stack.length - 1];
    if (!top) close();
    else if (top.escapable()) top.state.close();
  }

  onMounted(() => {
    window.addEventListener("popstate", onPopState);
    window.addEventListener("keydown", onKeydown);
    pushLayer();
    requestAnimationFrame(() => {
      sheet.visible = true;
    });
  });

  onUnmounted(() => {
    window.removeEventListener("popstate", onPopState);
    window.removeEventListener("keydown", onKeydown);
  });

  return sheet;
}
