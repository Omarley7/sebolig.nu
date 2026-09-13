/**
 * Idle-time image prefetch.
 *
 * Warms the browser cache (and, as a side effect, the image proxy's CDN cache)
 * for images the user is likely to open next — e.g. the detail-sheet hero once
 * its card thumb is on screen, or blueprints once a sheet is open.
 *
 * Scheduled at idle so prefetches never compete with visible images.
 */

const requested = new Set<string>();

function schedule(fn: () => void): void {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(fn, { timeout: 3000 });
  } else {
    setTimeout(fn, 300);
  }
}

export function prefetchImages(urls: (string | undefined)[]): void {
  const fresh = urls.filter((u): u is string => !!u && !requested.has(u));
  if (fresh.length === 0) return;
  for (const url of fresh) requested.add(url);

  schedule(() => {
    for (const url of fresh) {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
    }
  });
}
