import { getCurrentScope, onScopeDispose, reactive } from "vue";

/** An overlay that back and Esc close: a sheet, a popup on a sheet, the map. */
export interface HistoryLayer {
  readonly isOpen: boolean;
  /** Puts the layer on top of every open layer, on a history entry of its own. */
  open(): void;
  /** Closes the layer and every layer above it, removing the history entries they added. */
  close(): void;
}

export interface LayerOptions {
  /** Whether Esc may close the layer right now. Back always can. */
  escapable?: () => boolean;
  /** Runs whenever the layer closes, whether by back, Esc or close(). */
  onClose?: () => void;
}

interface Entry {
  state: HistoryLayer & { isOpen: boolean };
  escapable: () => boolean;
  onClose: () => void;
}

// One stack for the whole app. Each history entry a layer adds records how many layers
// were open with it on top, so a popstate tells exactly which layers to close.
const stack: Entry[] = [];
const DEPTH_KEY = "historyLayer";

function depthOf(state: unknown): number {
  const depth = (state as Record<string, unknown> | null)?.[DEPTH_KEY];
  return typeof depth === "number" ? depth : 0;
}

function closeAbove(depth: number) {
  while (stack.length > depth) {
    const entry = stack.pop()!;
    entry.state.isOpen = false;
    entry.onClose();
  }
  if (stack.length === 0) listen(false);
}

function onPopState(event: PopStateEvent) {
  closeAbove(depthOf(event.state));
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  const top = stack[stack.length - 1];
  if (top?.escapable()) top.state.close();
}

function listen(on: boolean) {
  if (on) {
    window.addEventListener("popstate", onPopState);
    window.addEventListener("keydown", onKeydown);
  } else {
    window.removeEventListener("popstate", onPopState);
    window.removeEventListener("keydown", onKeydown);
  }
}

/**
 * A layer in the app-wide stack of overlays. Back and Esc close the top layer first,
 * and back never changes the route while any layer is open.
 *
 * Called in a component's setup, the layer leaves the stack when the component unmounts.
 * History is left alone then: when a route change unmounts an open layer, undoing that
 * navigation would be worse than one leftover back step.
 */
export function useHistoryLayer(options: LayerOptions = {}): HistoryLayer {
  const entry: Entry = {
    escapable: options.escapable ?? (() => true),
    onClose: options.onClose ?? (() => {}),
    state: reactive({
      isOpen: false,
      open() {
        if (entry.state.isOpen) return;
        entry.state.isOpen = true;
        stack.push(entry);
        if (stack.length === 1) listen(true);
        history.pushState({ [DEPTH_KEY]: stack.length }, "");
      },
      close() {
        const index = stack.indexOf(entry);
        if (index === -1) return;
        const added = stack.length - index;
        closeAbove(index);
        history.go(-added);
      },
    }),
  };

  if (getCurrentScope()) {
    onScopeDispose(() => {
      const index = stack.indexOf(entry);
      if (index === -1) return;
      stack.splice(index, 1);
      entry.state.isOpen = false;
      if (stack.length === 0) listen(false);
    });
  }

  return entry.state;
}
