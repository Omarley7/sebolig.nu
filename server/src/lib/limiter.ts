import type { FindboligClient } from "./findbolig-client";

/**
 * How many offers one Connection may have being enriched at once (each enrichment makes a few
 * findbolig.nu calls of its own).
 * Shared by every request on that Connection (offers, appointments and waiting lists load
 * together), not per request.
 */
export const ENRICHMENT_CONCURRENCY = 5;

/** Runs tasks with at most `limit` in flight, starting queued ones in arrival order. */
class Limiter {
  private active = 0;
  private readonly queue: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  get idle(): boolean {
    return this.active === 0 && this.queue.length === 0;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active < this.limit) this.active++;
    // A finishing task hands its slot straight to the next one, so `active` stays put.
    else await new Promise<void>((resolve) => this.queue.push(resolve));
    try {
      return await task();
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.active--;
    }
  }
}

/** One limiter per findbolig account with work in flight; dropped again once it is idle. */
const byConnection = new Map<string, Limiter>();

/** Runs `task` under the enrichment limit of `client`'s Connection. */
export async function limitedFor<T>(client: FindboligClient, task: () => Promise<T>): Promise<T> {
  const key = client.session.fbEmail.toLowerCase();
  let limiter = byConnection.get(key);
  if (!limiter) byConnection.set(key, (limiter = new Limiter(ENRICHMENT_CONCURRENCY)));
  try {
    return await limiter.run(task);
  } finally {
    // Another request may already have replaced an idle limiter under this key; leave that one be.
    if (limiter.idle && byConnection.get(key) === limiter) byConnection.delete(key);
  }
}
