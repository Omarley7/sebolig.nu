import { blueprintImage, galleryImage } from "@/imageProxy";

/**
 * Pre-warms the image proxy's cache for listing images.
 *
 * findbolig.nu serves multi-MB originals and streams them erratically (the
 * same 8 MB file has been observed at 0.5s and 18s), so the proxy's first
 * transform of an image can take 10–18s. The proxy caches both the transform
 * (CDN, 1 year) and the fetched source, so requesting one transform per image
 * here makes every later size fast (<1s) for real users.
 *
 * Fire-and-forget: callers never await, failures are swallowed. State is a
 * best-effort in-memory dedupe set — a restart just re-warms already-cached
 * URLs, which is cheap.
 */

const IMAGE_BASE_URL = process.env.IMAGE_BASE_URL ?? "https://findbolig.nu";

const CONCURRENCY = 2; // be polite — each cold warm makes the proxy pull ~8 MB from findbolig
const REQUEST_TIMEOUT_MS = 30_000; // cold pulls have been observed at 18s
const MAX_WARMED_ENTRIES = 10_000;

/** Paths already queued or warmed. Reset wholesale if it grows unbounded. */
let warmed = new Set<string>();

const queue: string[] = [];
let activeWorkers = 0;

type WarmableItem = {
  images?: string[];
  blueprints?: string[];
} | null | undefined;

/**
 * Queues cache-warming requests for every image not warmed before.
 * Returns immediately; warming happens in the background.
 */
export function warmImages(items: WarmableItem[]): void {
  if (warmed.size > MAX_WARMED_ENTRIES) warmed = new Set();

  for (const item of items) {
    if (!item) continue;
    for (const path of item.images ?? []) enqueue(galleryImage(IMAGE_BASE_URL + path));
    for (const path of item.blueprints ?? []) enqueue(blueprintImage(IMAGE_BASE_URL + path));
  }

  while (activeWorkers < CONCURRENCY && queue.length > 0) {
    activeWorkers++;
    void runWorker();
  }
}

function enqueue(url: string): void {
  if (warmed.has(url)) return;
  warmed.add(url);
  queue.push(url);
}

async function runWorker(): Promise<void> {
  try {
    let url: string | undefined;
    while ((url = queue.shift()) !== undefined) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        // Drain the body so the proxy request fully completes and the socket is freed.
        await res.arrayBuffer();
        if (!res.ok) warmed.delete(url); // let a later batch retry
      } catch {
        warmed.delete(url); // timeout / network error — retry on next sighting
      }
    }
  } finally {
    activeWorkers--;
  }
}
