import { onMounted, reactive, watch } from "vue";
import { useHistoryLayer, type HistoryLayer, type LayerOptions } from "./useHistoryLayer";

/** A layer opened on top of a sheet: gallery, financials, confirm dialog. */
export type SheetPopup = HistoryLayer;

export type PopupOptions = Pick<LayerOptions, "escapable">;

export interface SheetOptions {
  /** Closes the sheet the normal way, sliding out and unwinding history, once this turns true. */
  closeWhen?: () => boolean;
}

export interface Sheet {
  /** False before the slide-in and from the moment the sheet starts closing. */
  readonly visible: boolean;
  /** True from the moment the sheet starts closing, even if it never finished sliding in. */
  readonly closed: boolean;
  popup(options?: PopupOptions): SheetPopup;
  /** Closes every open popup and the sheet, removing all history entries they added. */
  close(): void;
}

/**
 * A bottom sheet and the popups opened from it, as layers in the app-wide history stack.
 * Call it in the detail sheet's setup and pass the result to <BottomSheet :sheet>.
 *
 * Back and Esc close the top popup first, then the sheet. Back never changes the route.
 */
export function useSheet(options: SheetOptions = {}): Sheet {
  const layer = useHistoryLayer({ onClose: markClosed });

  const sheet = reactive({
    visible: false,
    closed: false,
    popup,
    close,
  });

  function markClosed() {
    sheet.closed = true;
    sheet.visible = false;
  }

  function popup(options: PopupOptions = {}): SheetPopup {
    const popupLayer = useHistoryLayer(options);
    return {
      get isOpen() {
        return popupLayer.isOpen;
      },
      open() {
        if (!sheet.closed) popupLayer.open();
      },
      close: popupLayer.close,
    };
  }

  function close() {
    if (sheet.closed) return;
    if (layer.isOpen) layer.close();
    else markClosed();
  }

  if (options.closeWhen) {
    watch(options.closeWhen, (shouldClose) => {
      if (shouldClose) close();
    });
  }

  onMounted(() => {
    layer.open();
    requestAnimationFrame(() => {
      if (!sheet.closed) sheet.visible = true;
    });
  });

  return sheet;
}
