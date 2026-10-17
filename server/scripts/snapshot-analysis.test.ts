import { test } from "node:test";
import assert from "node:assert/strict";

import type { ApiOffer } from "~/types/offers";
import type { ApiMessageThreadFull } from "~/types/threads";
import { messagesAfterUpdated } from "./snapshot-analysis";

function offer(id: string, updated: string, recipientUpdated?: string): ApiOffer {
  return {
    id,
    updated,
    recipients: recipientUpdated ? [{ updated: recipientUpdated }] : undefined,
  } as ApiOffer;
}

function thread(...created: string[]): ApiMessageThreadFull {
  return { messages: created.map((at, i) => ({ id: `m${i}`, body: "", created: at })) } as ApiMessageThreadFull;
}

test("an offer whose latest message is newer than its updated counts as a message that didn't bump it", () => {
  const result = messagesAfterUpdated([
    { offer: offer("a", "2026-01-01T10:00:00Z"), thread: thread("2026-01-01T09:00:00Z", "2026-01-05T12:00:00Z") },
  ]);
  assert.equal(result.withMessages, 1);
  assert.equal(result.latestAfterUpdated, 1);
  assert.deepEqual(result.examples.map((e) => e.offerId), ["a"]);
});

test("an offer updated at or after its latest message does not count", () => {
  const result = messagesAfterUpdated([
    { offer: offer("a", "2026-01-05T12:00:00Z"), thread: thread("2026-01-05T12:00:00Z") },
    { offer: offer("b", "2026-02-01T00:00:00Z"), thread: thread("2026-01-05T12:00:00Z") },
  ]);
  assert.equal(result.withMessages, 2);
  assert.equal(result.latestAfterUpdated, 0);
  assert.deepEqual(result.examples, []);
});

test("a message within a minute after updated counts as the same write, not a newer one", () => {
  const result = messagesAfterUpdated([
    { offer: offer("a", "2026-01-05T12:00:00Z"), thread: thread("2026-01-05T12:00:30Z") },
  ]);
  assert.equal(result.latestAfterUpdated, 0);
});

test("offers without a thread or without messages are left out", () => {
  const result = messagesAfterUpdated([
    { offer: offer("a", "2026-01-01T00:00:00Z"), thread: null },
    { offer: offer("b", "2026-01-01T00:00:00Z"), thread: thread() },
  ]);
  assert.equal(result.withMessages, 0);
});

test("the recipient's own updated is compared separately", () => {
  const result = messagesAfterUpdated([
    {
      offer: offer("a", "2026-01-01T00:00:00Z", "2026-01-10T00:00:00Z"),
      thread: thread("2026-01-05T00:00:00Z"),
    },
  ]);
  assert.equal(result.latestAfterUpdated, 1);
  assert.equal(result.latestAfterRecipientUpdated, 0);
});

test("examples are the newest messages first, at most five", () => {
  const entries = Array.from({ length: 7 }, (_, i) => ({
    offer: offer(`o${i}`, "2026-01-01T00:00:00Z"),
    thread: thread(`2026-01-0${i + 2}T00:00:00Z`),
  }));
  const result = messagesAfterUpdated(entries);
  assert.equal(result.latestAfterUpdated, 7);
  assert.deepEqual(result.examples.map((e) => e.offerId), ["o6", "o5", "o4", "o3", "o2"]);
});
