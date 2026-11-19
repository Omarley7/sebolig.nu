import { reactive } from "vue";
import { useHistoryLayer } from "./useHistoryLayer";
import type { PopupOptions, Sheet, SheetPopup } from "./useSheet";

/**
 * A detail shown inline, in the desktop pane, rather than in a sheet: always visible, nothing to
 * close. Its popups (gallery, financials, confirm) are still layers that back and Esc close.
 */
export function usePane(): Sheet {
  return reactive({
    visible: true,
    closed: false,
    popup: (options: PopupOptions = {}): SheetPopup => useHistoryLayer(options),
    close() {},
  });
}
