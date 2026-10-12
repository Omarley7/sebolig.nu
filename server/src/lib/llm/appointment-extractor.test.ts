import { test } from "node:test";
import assert from "node:assert/strict";

import type { ApiMessage, ApiMessageThreadFull } from "~/types/threads";
import { acceptedDetails, EMPTY_DETAILS, showingContext, type ShowingContext } from "./appointment-extractor";

function thread(messages: Partial<ApiMessage>[]): ApiMessageThreadFull {
  return {
    id: "t1",
    title: "Fremvisning",
    archived: false,
    created: "2026-01-01T00:00:00.000Z",
    relatedEntity: null,
    messages: messages.map((m, i) => ({ id: `m${i}`, body: "", created: "2026-01-01T00:00:00.000Z", ...m })),
  };
}

test("keeps only showing-related messages from the landlord, oldest first, with HTML stripped and their sent date", () => {
  const context = showingContext(
    thread([
      { body: "<p>Ny tid: <b>fremvisning</b> 3/6 kl. 10</p>", created: "2026-01-03T00:00:00.000Z" },
      { body: "Tak for din ansøgning", created: "2026-01-01T00:00:00.000Z" },
      { body: "Åbent hus 1/6 kl. 16-17", created: "2026-01-02T00:00:00.000Z" },
      { body: "Husk åbent hus", sender: { id: "s", name: "Findbolig" }, created: "2026-01-04T00:00:00.000Z" },
    ]),
    null,
  );

  assert.deepEqual(context, {
    source: "thread",
    messages: [
      { sent: "2026-01-02", text: "Åbent hus 1/6 kl. 16-17" },
      { sent: "2026-01-03", text: "Ny tid: fremvisning 3/6 kl. 10" },
    ],
  });
});

test("a message's sent date is the date in Denmark, not in UTC", () => {
  const context = showingContext(thread([{ body: "Åbent hus 3/1 kl. 12", created: "2026-12-31T23:30:00.000Z" }]), null);

  assert.deepEqual(context, { source: "thread", messages: [{ sent: "2027-01-01", text: "Åbent hus 3/1 kl. 12" }] });
});

test("does not reorder the thread it was given", () => {
  const given = thread([
    { id: "late", body: "fremvisning", created: "2026-01-02T00:00:00.000Z" },
    { id: "early", body: "fremvisning", created: "2026-01-01T00:00:00.000Z" },
  ]);

  showingContext(given, null);

  assert.deepEqual(given.messages.map((m) => m.id), ["late", "early"]);
});

test("falls back to the offer's showing text, HTML stripped, when no message is about a showing", () => {
  const context = showingContext(thread([{ body: "Tak for din ansøgning" }]), "<p>Åbent hus 5/6 kl. 12-13</p>");

  assert.deepEqual(context, { source: "showingText", text: "Åbent hus 5/6 kl. 12-13" });
});

test("leaves the showing text out when the thread has messages about a showing: the thread wins", () => {
  const context = showingContext(thread([{ body: "Åbent hus 1/6 kl. 16-17" }]), "Svarfrist for deltagelse i det åbne hus er: 12/10");

  assert.deepEqual(context, { source: "thread", messages: [{ sent: "2026-01-01", text: "Åbent hus 1/6 kl. 16-17" }] });
});

test("is null when there is neither relevant thread text nor showing text, so the LLM is not called", () => {
  assert.equal(showingContext(thread([{ body: "Tak for din ansøgning" }]), null), null);
  assert.equal(showingContext(thread([]), "  <br>  "), null);
});

const THREAD: ShowingContext = { source: "thread", messages: [{ sent: "2026-05-20", text: "Der er åbent hus d. 1/6 kl. 16-17.\nVel mødt" }] };
const SHOWING_TEXT: ShowingContext = { source: "showingText", text: "Åbent hus 5/6 kl. 12-13. Svarfrist 1/6" };
const answer = (fields: Partial<Parameters<typeof acceptedDetails>[1]>) => ({ ...EMPTY_DETAILS, quote: "", ...fields });

test("an answer whose quote appears in the thread is accepted, without the quote", () => {
  const details = acceptedDetails(THREAD, answer({ date: "2026-06-01", startTime: "16:00", endTime: "17:00", quote: "åbent hus d. 1/6 kl. 16-17" }));

  assert.deepEqual(details, { date: "2026-06-01", startTime: "16:00", endTime: "17:00", cancelled: false });
});

test("the quote check ignores case and differences in whitespace", () => {
  const details = acceptedDetails(THREAD, answer({ date: "2026-06-01", startTime: "16:00", quote: "ÅBENT  HUS d. 1/6 kl.\t16-17. Vel  mødt" }));

  assert.equal(details.date, "2026-06-01");
});

test("a date whose quote is not in the input is dropped: the model made it up", () => {
  assert.deepEqual(acceptedDetails(THREAD, answer({ date: "2026-06-02", startTime: "10:00", quote: "åbent hus 2/6 kl. 10" })), EMPTY_DETAILS);
  assert.deepEqual(acceptedDetails(THREAD, answer({ date: "2026-06-01", startTime: "16:00", quote: "" })), EMPTY_DETAILS);
});

test("a cancellation without a date from the thread needs no quote", () => {
  assert.deepEqual(acceptedDetails(THREAD, answer({ cancelled: true })), { ...EMPTY_DETAILS, cancelled: true });
});

test("from the showing text, a quoted date with a time is accepted", () => {
  const details = acceptedDetails(SHOWING_TEXT, answer({ date: "2026-06-05", startTime: "12:00", endTime: "13:00", quote: "Åbent hus 5/6 kl. 12-13" }));

  assert.equal(details.date, "2026-06-05");
});

test("from the showing text, a date without a time or a bare cancellation is dropped", () => {
  // A svarfrist or move-in date read as a showing has no time.
  assert.deepEqual(acceptedDetails(SHOWING_TEXT, answer({ date: "2026-06-01", quote: "Svarfrist 1/6" })), EMPTY_DETAILS);
  assert.deepEqual(acceptedDetails(SHOWING_TEXT, answer({ cancelled: true })), EMPTY_DETAILS);
});
