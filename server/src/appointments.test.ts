import { test } from "node:test";
import assert from "node:assert/strict";

import type { CachedAppointmentEntry } from "@/types";
import { getAppointmentUpdates, getUpcomingAppointments } from "./appointments";
import { FindboligClient } from "./lib/findbolig-client";
import { FakeFindbolig } from "./lib/fake-findbolig";
import { ENRICHMENT_CONCURRENCY } from "./lib/limiter";
import type { ShowingContext } from "./lib/llm/appointment-extractor";
import { FakeExtractor } from "./lib/llm/fake-extractor";
import { apiResidence } from "./lib/test-fixtures";
import type { ApiOffer } from "./types/offers";

const T = "2026-01-10T00:00:00.000Z";
const BEFORE = { listing: { since: "2026-01-01T00:00:00.000Z", sinceIds: [] }, threads: { since: "2026-01-01T00:00:00.000Z", sinceIds: [] } };
/** findbolig.nu's thread list with no threads in it. */
const NO_THREADS = () => ({ json: { totalResults: 0, page: 0, pageSize: 100, results: [] } });
const FUTURE = "2099-06-01";

const OFFER: Partial<ApiOffer> = { id: "o1", residenceId: "r1", state: "Published", updated: T, showingText: null };

function thread(messageCount: number) {
  return {
    id: "t1",
    title: "Fremvisning",
    archived: false,
    created: T,
    relatedEntity: null,
    messages: Array.from({ length: messageCount }, (_, i) => ({ id: `m${i}`, body: "Åbent hus 1/6 kl. 16-17", created: T })),
  };
}

/** A client on a fake findbolig.nu with one Published offer whose thread has `messageCount` messages. */
function clientWithOneOffer(messageCount: number, offers: Partial<ApiOffer>[] = [OFFER]) {
  const fake = new FakeFindbolig()
    .addAccount("tenant@example.com", "pw", "Test Tenant")
    .on("POST /api/search/offers", () => ({ json: { facets: {}, totalResults: offers.length, page: 0, pageSize: 25, results: offers } }))
    .on("POST /api/communications/threads", NO_THREADS)
    .on("GET /api/models/residence/r1", () => ({ json: apiResidence() }))
    .on("GET /api/communications/messages/thread/related-to/o1", () => ({ json: thread(messageCount) }))
    .on("GET /api/search/waiting-lists/applicants/position-on-offer/o1", () => ({ json: 4 }));
  return FindboligClient.connect(fake, "tenant@example.com", "pw");
}

function cachedEntry(messageCount: number): CachedAppointmentEntry {
  return {
    offerId: "o1",
    messageCount,
    date: FUTURE,
    appointment: { offerId: "o1", date: FUTURE, start: "16:00", end: "17:00", cancelled: false } as CachedAppointmentEntry["appointment"],
  };
}

const extracted = () => ({ date: "2099-07-01", startTime: "10:00", endTime: "11:00", cancelled: false, quote: "Åbent hus 1/6 kl. 16-17" });

test("a delta reuses the cached extraction when the thread's message count is unchanged", async () => {
  const client = await clientWithOneOffer(3);
  const extractor = new FakeExtractor(extracted);

  const delta = await getAppointmentUpdates(client, extractor, BEFORE, [cachedEntry(3)]);

  assert.equal(extractor.calls, 0, "the LLM must not be paid for an unchanged thread");
  assert.equal(delta.items.length, 1);
  assert.deepEqual(
    { date: delta.items[0].date, start: delta.items[0].start, position: delta.items[0].position },
    { date: FUTURE, start: "16:00", position: 4 },
  );
  assert.equal(delta.latestUpdated, T);
});

test("a delta extracts again when the thread has new messages", async () => {
  const client = await clientWithOneOffer(4);
  const extractor = new FakeExtractor(extracted);

  const delta = await getAppointmentUpdates(client, extractor, BEFORE, [cachedEntry(3)]);

  assert.equal(extractor.calls, 1);
  assert.equal(delta.items[0].date, "2099-07-01");
  assert.equal(delta.items[0].messageCount, 4);
});

test("the LLM erroring counts as failed: the appointment is left out and the cursor withheld", async () => {
  const client = await clientWithOneOffer(1);
  const extractor = new FakeExtractor(() => {
    throw new Error("OpenAI: 500");
  });

  const delta = await getAppointmentUpdates(client, extractor, BEFORE, []);

  assert.deepEqual(delta.items, []);
  assert.deepEqual(delta.removedIds, []);
  assert.equal(delta.latestUpdated, null);
});

test("an extraction with no date is still an appointment, without a date", async () => {
  const client = await clientWithOneOffer(1);

  const delta = await getAppointmentUpdates(client, new FakeExtractor(), BEFORE, []);

  assert.equal(delta.items.length, 1);
  assert.equal(delta.items[0].date, null);
  assert.equal(delta.latestUpdated, T);
});

test("a full sync leaves out offers that are not upcoming and hands out latestUpdatedIds", async () => {
  const client = await clientWithOneOffer(3, [OFFER, { id: "o2", residenceId: "r2", state: "Expired", updated: T }]);

  const sync = await getUpcomingAppointments(client, new FakeExtractor(extracted), [cachedEntry(3)]);

  assert.deepEqual(sync.appointments.map((a) => a.offerId), ["o1"]);
  assert.equal(sync.latestUpdated, T);
  assert.deepEqual(sync.latestUpdatedIds, ["o1", "o2"]);
});

/** A client on a fake findbolig.nu with `count` Published offers, each with a showing thread; `allThreadsFetched` settles once every thread has been fetched. */
async function clientWithOffers(count: number) {
  const offers = Array.from({ length: count }, (_, i) => ({ ...OFFER, id: `o${i}`, residenceId: `r${i}` }));
  const fake = new FakeFindbolig()
    .addAccount("tenant@example.com", "pw", "Test Tenant")
    .on("POST /api/search/offers", () => ({ json: { facets: {}, totalResults: count, page: 0, pageSize: 25, results: offers } }))
    .on("POST /api/communications/threads", NO_THREADS);
  let fetched = 0;
  let allFetched!: () => void;
  const allThreadsFetched = new Promise<void>((resolve) => (allFetched = resolve));
  for (const { id, residenceId } of offers) {
    fake
      .on(`GET /api/models/residence/${residenceId}`, () => ({ json: apiResidence() }))
      .on(`GET /api/communications/messages/thread/related-to/${id}`, () => {
        if (++fetched === count) allFetched();
        return { json: thread(1) };
      })
      .on(`GET /api/search/waiting-lists/applicants/position-on-offer/${id}`, () => ({ json: 4 }));
  }
  return { client: await FindboligClient.connect(fake, "tenant@example.com", "pw"), allThreadsFetched };
}

test("a slow extractor doesn't hold back findbolig.nu fetches for other offers", { timeout: 2000 }, async () => {
  const { client, allThreadsFetched } = await clientWithOffers(ENRICHMENT_CONCURRENCY + 3);
  // Each extraction waits until every offer's thread has been fetched. Were the LLM inside the
  // Connection's limit, the offers past the limit would never get fetched.
  const extractor = new FakeExtractor(async () => (await allThreadsFetched, extracted()));

  const sync = await getUpcomingAppointments(client, extractor, []);

  assert.equal(sync.appointments.length, ENRICHMENT_CONCURRENCY + 3);
  assert.equal(extractor.calls, ENRICHMENT_CONCURRENCY + 3);
});

test("with showing messages in the thread, only the thread goes to the extractor, in one call", async () => {
  const client = await clientWithOneOffer(2, [{ ...OFFER, showingText: "<p>Åbent hus 5/6 kl. 12-13</p>" }]);
  const seen: ShowingContext[] = [];
  const extractor = new FakeExtractor((context) => (seen.push(context), extracted()));

  await getAppointmentUpdates(client, extractor, BEFORE, []);

  assert.equal(extractor.calls, 1);
  const message = { sent: "2026-01-10", text: "Åbent hus 1/6 kl. 16-17" };
  assert.deepEqual(seen, [{ source: "thread", messages: [message, message] }]);
});

for (const [what, answer, date] of [
  ["a date and a time is kept", { date: "2099-07-01", startTime: "10:00", endTime: "", cancelled: false, quote: "Svarfrist" }, "2099-07-01"],
  // A svarfrist or move-in date read as a showing: no time, so not a showing.
  ["a date without a time is dropped", { date: "2099-07-01", startTime: "", endTime: "", cancelled: false, quote: "Svarfrist" }, null],
  ["a cancellation without a date is dropped", { date: "", startTime: "", endTime: "", cancelled: true, quote: "" }, null],
] as const) {
  test(`from the showing text alone, ${what}`, async () => {
    const client = await clientWithOneOffer(0, [{ ...OFFER, showingText: "Svarfrist for deltagelse i det åbne hus er: 12/10" }]);

    const delta = await getAppointmentUpdates(client, new FakeExtractor(() => answer), BEFORE, []);

    assert.equal(delta.items[0].date, date);
    assert.equal(delta.items[0].cancelled, false);
  });
}

test("from the thread, a date without a time is kept", async () => {
  const client = await clientWithOneOffer(1);
  const extractor = new FakeExtractor(() => ({ ...extracted(), startTime: "", endTime: "" }));

  const delta = await getAppointmentUpdates(client, extractor, BEFORE, []);

  assert.equal(delta.items[0].date, "2099-07-01");
});

test("a date whose quote is not in the thread is dropped: the model made it up", async () => {
  const client = await clientWithOneOffer(1);
  const extractor = new FakeExtractor(() => ({ ...extracted(), quote: "Åbent hus 1/7 kl. 10-11" }));

  const delta = await getAppointmentUpdates(client, extractor, BEFORE, []);

  assert.equal(delta.items[0].date, null);
});

test("the extractor is told today's date in Denmark", async () => {
  const client = await clientWithOneOffer(1);
  let told = "";
  const extractor = { extract: async (_: ShowingContext, today: string) => ((told = today), extracted()) };
  // Worked out apart from danishDate: the time zone makes it Danish, the Swedish locale writes YYYY-MM-DD.
  const dayInDenmark = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });

  const before = dayInDenmark();
  await getAppointmentUpdates(client, extractor, BEFORE, []);

  // Either side of midnight, should the test run across it.
  assert.ok([before, dayInDenmark()].includes(told), told);
});

test("with no showing text and nothing about a showing in the thread, the extractor is not called", async () => {
  const client = await clientWithOneOffer(0);
  const extractor = new FakeExtractor(extracted);

  const delta = await getAppointmentUpdates(client, extractor, BEFORE, []);

  assert.equal(extractor.calls, 0);
  assert.equal(delta.items.length, 1);
  assert.equal(delta.items[0].date, null);
});

// ── The thread walk ──────────────────────────────────────────────

const LISTING_SINCE = "2026-01-05T00:00:00.000Z";
const MESSAGES_SINCE = "2026-01-05T00:00:00.000Z";
const SINCE_BOTH = { listing: { since: LISTING_SINCE, sinceIds: [] }, threads: { since: MESSAGES_SINCE, sinceIds: [] } };
const QUIET = "2026-01-01T00:00:00.000Z"; // an offer `updated` older than the listing cursor
const NEW_MESSAGE = "2026-01-12T09:00:00.000Z";

type ThreadRow = { id: string; relatedEntity: string | null; relatedEntityType?: string; lastMessage: { id: string; body: string; created: string } | null };

function threadRow(id: string, offerId: string | null, lastMessageAt: string | null): ThreadRow {
  return {
    id,
    relatedEntity: offerId,
    relatedEntityType: offerId ? "Offer" : undefined,
    lastMessage: lastMessageAt ? { id: `${id}-last`, body: "Åbent hus 1/6 kl. 16-17", created: lastMessageAt } : null,
  };
}

/**
 * A fake findbolig.nu account: `offers` in the listing (updated desc), `threads` in the thread list
 * (newest last message first), and each offer's own thread with `messageCount` messages. Offers can
 * also be looked up by id, like findbolig.nu's `searchOffers` with an id filter.
 */
async function account({ offers, threads, messageCount = 1 }: { offers: Partial<ApiOffer>[]; threads: ThreadRow[]; messageCount?: number }) {
  const fake = new FakeFindbolig()
    .addAccount("tenant@example.com", "pw", "Test Tenant")
    .on("POST /api/search/offers", (req) => {
      const { page = 0, pageSize = 25, filters = {} } = req.body as { page?: number; pageSize?: number; filters?: { id?: string[] } };
      const matching = filters.id ? offers.filter((o) => filters.id!.includes(o.id!)) : offers;
      return { json: { facets: {}, totalResults: matching.length, page, pageSize, results: matching.slice(page * pageSize, (page + 1) * pageSize) } };
    })
    .on("POST /api/communications/threads", (req) => {
      const { page = 0, pageSize = 100 } = req.body as { page?: number; pageSize?: number };
      return { json: { totalResults: threads.length, page, pageSize, results: threads.slice(page * pageSize, (page + 1) * pageSize) } };
    });
  for (const { id, residenceId } of offers) {
    fake
      .on(`GET /api/models/residence/${residenceId}`, () => ({ json: apiResidence() }))
      .on(`GET /api/communications/messages/thread/related-to/${id}`, () => ({ json: thread(messageCount) }))
      .on(`GET /api/search/waiting-lists/applicants/position-on-offer/${id}`, () => ({ json: 4 }));
  }
  return { fake, client: await FindboligClient.connect(fake, "tenant@example.com", "pw") };
}

const searchesById = (fake: FakeFindbolig) =>
  fake.requests.filter((r) => r.path === "/api/search/offers" && (r.body as { filters?: { id?: string[] } }).filters?.id);

test("a delta picks up an offer whose thread got a new message, although its updated did not move", async () => {
  const { client } = await account({
    offers: [{ ...OFFER, updated: QUIET }],
    threads: [threadRow("t1", "o1", NEW_MESSAGE)],
    messageCount: 4,
  });
  const extractor = new FakeExtractor(extracted);

  const delta = await getAppointmentUpdates(client, extractor, SINCE_BOTH, [cachedEntry(3)]);

  assert.deepEqual(delta.items.map((a) => [a.offerId, a.date, a.messageCount]), [["o1", "2099-07-01", 4]]);
  assert.equal(extractor.calls, 1);
  assert.deepEqual([delta.latestMessageAt, delta.latestMessageThreadIds], [NEW_MESSAGE, ["t1"]]);
});

test("an offer changed in both walks is enriched once, without looking it up by id", async () => {
  const { fake, client } = await account({
    offers: [{ ...OFFER, updated: NEW_MESSAGE }],
    threads: [threadRow("t1", "o1", NEW_MESSAGE)],
  });
  const extractor = new FakeExtractor(extracted);

  const delta = await getAppointmentUpdates(client, extractor, SINCE_BOTH, []);

  assert.deepEqual(delta.items.map((a) => a.offerId), ["o1"]);
  assert.equal(extractor.calls, 1);
  assert.equal(searchesById(fake).length, 0);
});

test("a repeat delta from the thread cursor it handed out finds nothing, but a thread landing on that same instant is caught", async () => {
  const seen = threadRow("t1", "o1", NEW_MESSAGE);
  const arrival = threadRow("t2", "o2", NEW_MESSAGE);
  const offers = [{ ...OFFER, updated: QUIET }, { ...OFFER, id: "o2", residenceId: "r2", updated: QUIET }];
  const cursors = { ...SINCE_BOTH, threads: { since: NEW_MESSAGE, sinceIds: ["t1"] } };

  const quiet = await account({ offers, threads: [seen] });
  const nothing = await getAppointmentUpdates(quiet.client, new FakeExtractor(extracted), cursors, []);
  assert.deepEqual(nothing.items, []);
  assert.equal(searchesById(quiet.fake).length, 0, "nothing changed: no offer is looked up");
  assert.deepEqual([nothing.latestMessageAt, nothing.latestMessageThreadIds], [NEW_MESSAGE, ["t1"]]);

  // findbolig.nu's tie-break order shifted: the new thread comes first.
  const tied = await account({ offers, threads: [arrival, seen] });
  const caught = await getAppointmentUpdates(tied.client, new FakeExtractor(extracted), cursors, []);
  assert.deepEqual(caught.items.map((a) => a.offerId), ["o2"]);
  assert.deepEqual([...caught.latestMessageThreadIds].sort(), ["t1", "t2"]);
});

test("a thread whose offer is no longer upcoming is reported removed, and a thread with no offer is left out", async () => {
  const { fake, client } = await account({
    offers: [{ ...OFFER, state: "Expired", updated: QUIET }],
    threads: [threadRow("t0", null, NEW_MESSAGE), threadRow("t1", "o1", NEW_MESSAGE)],
  });

  const delta = await getAppointmentUpdates(client, new FakeExtractor(extracted), SINCE_BOTH, []);

  assert.deepEqual([delta.items, delta.removedIds], [[], ["o1"]]);
  assert.deepEqual(searchesById(fake).map((r) => (r.body as { filters: { id: string[] } }).filters.id), [["o1"]]);
  assert.deepEqual([...delta.latestMessageThreadIds].sort(), ["t0", "t1"]);
});

test("an enrichment failing withholds both cursors", async () => {
  const { client } = await account({ offers: [{ ...OFFER, updated: QUIET }], threads: [threadRow("t1", "o1", NEW_MESSAGE)] });
  const extractor = new FakeExtractor(() => {
    throw new Error("OpenAI: 500");
  });

  const delta = await getAppointmentUpdates(client, extractor, SINCE_BOTH, []);

  assert.deepEqual(delta.items, []);
  assert.deepEqual([delta.latestUpdated, delta.latestMessageAt, delta.latestMessageThreadIds], [null, null, []]);
});

test("a thread list page failing fails the delta", async () => {
  const { fake, client } = await account({ offers: [{ ...OFFER, updated: QUIET }], threads: [] });
  fake.on("POST /api/communications/threads", () => ({ status: 503 }));

  await assert.rejects(getAppointmentUpdates(client, new FakeExtractor(extracted), SINCE_BOTH, []));
});

test("a full sync hands out the thread cursor it read before enrichment, so a message arriving mid-sync is caught next time", async () => {
  const threads = [threadRow("t1", "o1", NEW_MESSAGE)];
  const { fake, client } = await account({ offers: [{ ...OFFER, updated: QUIET }], threads });
  // While o1 is being enriched, a new message lands in another thread.
  fake.on("GET /api/communications/messages/thread/related-to/o1", () => {
    threads.unshift(threadRow("t2", "o2", "2026-01-12T09:30:00.000Z"));
    return { json: thread(1) };
  });

  const sync = await getUpcomingAppointments(client, new FakeExtractor(extracted), []);

  assert.deepEqual(sync.appointments.map((a) => a.offerId), ["o1"]);
  assert.deepEqual([sync.latestMessageAt, sync.latestMessageThreadIds], [NEW_MESSAGE, ["t1"]]);
});
