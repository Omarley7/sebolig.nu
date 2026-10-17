/**
 * #87 decision 7: checks the thread walk on the maintainer's real account before merging.
 * Read-only towards findbolig.nu; it makes LLM calls (one full sync and one delta's worth).
 *
 *   cd server && npx tsx --tsconfig tsconfig.json scripts/verify-thread-walk.ts [--days 30]
 *
 * 1. Works out, from the raw listing and thread list and not through the walk, which upcoming
 *    offers (Finished/Published) changed in the last `--days`: by `updated`, by newest message, and
 *    the ones only a message moved (what the listing walk alone missed).
 * 2. Runs a full sync, then a delta from both cursors set `--days` back with nothing cached, then a
 *    repeat delta from the cursors that delta handed out, with the full sync's appointments cached.
 * 3. Checks the delta caught every expected offer, that its appointments match the full sync's,
 *    and that the repeat delta finds nothing and calls no LLM.
 *
 * The last block is counts only, for the issue. Mismatches are listed above it with offer ids and
 * dates: those stay in the terminal. The login and OPENAI_API_KEY come from `server/.env`.
 */
import "~/lib/tls-setup";
import { parseArgs } from "node:util";
import type { Appointment, CachedAppointmentEntry } from "@/types";
import { getAppointmentUpdates, getUpcomingAppointments } from "~/appointments";
import { FindboligClient } from "~/lib/findbolig-client";
import { httpTransport } from "~/lib/http-transport";
import type { AppointmentExtractor } from "~/lib/llm/appointment-extractor";
import { openAIExtractor } from "~/lib/llm/openai-extractor";
import { THREAD_PAGE_SIZE } from "~/offer-listing";
import type { ApiThreadSummary } from "~/types/threads";
import { credentials } from "./credentials";

const { values } = parseArgs({ options: { days: { type: "string", default: "30" } } });
const days = Number(values.days);
const since = new Date(Date.now() - days * 86_400_000).toISOString();

const { email, password } = await credentials();
const client = await FindboligClient.connect(httpTransport, email, password);
const openAI = openAIExtractor(process.env.OPENAI_API_KEY);
let llmCalls = 0;
const extractor: AppointmentExtractor = { extract: (context, today) => (llmCalls++, openAI.extract(context, today)) };

// ── 1. What should change, from the raw data ─────────────────────

const { results: offers } = await client.searchOffers();
const threads: ApiThreadSummary[] = [];
for (let page = 0; ; page++) {
  const { results, totalResults } = await client.listThreads({ page, pageSize: THREAD_PAGE_SIZE });
  threads.push(...results);
  if (results.length === 0 || threads.length >= totalResults) break;
}

const upcoming = offers.filter((offer) => offer.state === "Finished" || offer.state === "Published");
const newestMessage = new Map(
  threads.flatMap((t) => (t.relatedEntity && t.lastMessage ? [[t.relatedEntity, t.lastMessage.created] as const] : [])),
);
const after = (at: string | undefined) => at !== undefined && Date.parse(at) >= Date.parse(since);
const byUpdated = new Set(upcoming.filter((o) => after(o.updated)).map((o) => o.id));
const byMessage = new Set(upcoming.filter((o) => after(newestMessage.get(o.id))).map((o) => o.id));
const messageOnly = [...byMessage].filter((id) => !byUpdated.has(id));
const expected = new Set([...byUpdated, ...byMessage]);
// The snapshot's question, over all time: an upcoming offer whose newest message is newer than its `updated`.
const messageNewerThanUpdated = upcoming.filter((o) => {
  const message = newestMessage.get(o.id);
  return message !== undefined && Date.parse(message) - Date.parse(o.updated) > 60_000;
}).length;

// ── 2. The walks ─────────────────────────────────────────────────

console.log(`\nFull sync…`);
llmCalls = 0;
const full = await getUpcomingAppointments(client, extractor, []);
const fullLlmCalls = llmCalls;
const fullByOffer = new Map(full.appointments.map((a) => [a.offerId, a]));

console.log(`Delta from ${since} (${days} days back), nothing cached…`);
llmCalls = 0;
const back = { since, sinceIds: [] };
const delta = await getAppointmentUpdates(client, extractor, { listing: back, threads: back }, []);
const deltaLlmCalls = llmCalls;

console.log(`Repeat delta from the cursors it handed out, the full sync's appointments cached…`);
const known: CachedAppointmentEntry[] = full.appointments.map((appointment) => ({
  offerId: appointment.offerId,
  messageCount: appointment.messageCount ?? 0,
  date: appointment.date,
  appointment,
}));
llmCalls = 0;
const repeat =
  delta.latestUpdated && delta.latestMessageAt
    ? await getAppointmentUpdates(
        client,
        extractor,
        {
          listing: { since: delta.latestUpdated, sinceIds: delta.latestUpdatedIds },
          threads: { since: delta.latestMessageAt, sinceIds: delta.latestMessageThreadIds },
        },
        known,
      )
    : null;
const repeatLlmCalls = llmCalls;

// ── 3. Checks ────────────────────────────────────────────────────

const reported = new Set([...delta.items.map((a) => a.offerId), ...delta.removedIds]);
const notCaught = [...expected].filter((id) => !reported.has(id));
const messageOnlyCaught = messageOnly.filter((id) => reported.has(id)).length;

const shown = (a: Appointment | undefined) => (a ? `${a.date ?? "-"} ${a.start ?? "-"}-${a.end ?? "-"}${a.cancelled ? " cancelled" : ""}` : "absent");
const same = (a: Appointment, b: Appointment | undefined) =>
  !!b && a.date === b.date && a.start === b.start && a.end === b.end && a.cancelled === b.cancelled;
const mismatches = delta.items.filter((a) => !same(a, fullByOffer.get(a.offerId)));

if (notCaught.length || mismatches.length) console.log(`\nLocal only, not for the issue:`);
for (const id of notCaught) console.log(`  not caught by the delta: ${id}`);
for (const a of mismatches) console.log(`  differs: ${a.offerId}  delta ${shown(a)}  full sync ${shown(fullByOffer.get(a.offerId))}`);

const verdict = (ok: boolean) => (ok ? "PASS" : "FAIL");
const lines = [
  `Thread walk check (#87 decision 7), ${new Date().toISOString().slice(0, 10)}, cursors ${days} days back. Counts only.`,
  ``,
  `Account: ${offers.length} offers, ${upcoming.length} upcoming (Finished/Published), ${threads.length} threads.`,
  `Upcoming offers whose newest message is newer than their updated (all time): ${messageNewerThanUpdated}.`,
  `In the window: ${expected.size} upcoming offers changed; ${byUpdated.size} by updated, ${byMessage.size} by a message, ${messageOnly.length} by a message only.`,
  ``,
  `${verdict(notCaught.length === 0)}  The delta reported ${expected.size - notCaught.length} of ${expected.size} changed offers; ${messageOnlyCaught} of ${messageOnly.length} message-only ones.`,
  `${verdict(mismatches.length === 0)}  ${delta.items.length - mismatches.length} of ${delta.items.length} delta appointments match the full sync's (date, times, cancelled).`,
  `${verdict(!!delta.latestUpdated && !!delta.latestMessageAt)}  The delta handed out both cursors.`,
  repeat
    ? `${verdict(repeat.items.length === 0 && repeatLlmCalls === 0)}  The repeat delta reported ${repeat.items.length} appointments and made ${repeatLlmCalls} LLM calls.`
    : `SKIP  No repeat delta: a cursor was withheld.`,
  ``,
  `Full sync: ${full.appointments.length} appointments, ${fullLlmCalls} LLM calls. Delta: ${delta.items.length} appointments, ${delta.removedIds.length} removed, ${deltaLlmCalls} LLM calls.`,
];
console.log(`\n${lines.join("\n")}`);
