import { onMounted, onUnmounted } from "vue";

let lockCount = 0;

/**
 * Stops the page scrolling while the component is mounted. Only the root is locked: hiding
 * overflow on <body> as well makes <body> a scroll container of its own, and every sticky element
 * (the desktop detail pane, the rail, the header) then jumps back to its unscrolled place.
 */
export function useScrollLock() {
  onMounted(() => {
    lockCount++;
    if (lockCount === 1) document.documentElement.style.overflow = "hidden";
  });

  onUnmounted(() => {
    lockCount--;
    if (lockCount === 0) document.documentElement.style.overflow = "";
  });
}
