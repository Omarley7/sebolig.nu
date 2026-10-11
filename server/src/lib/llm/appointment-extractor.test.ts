import { test } from "node:test";
import assert from "node:assert/strict";

import type { ApiMessage, ApiMessageThreadFull } from "~/types/threads";
import { showingContext } from "./appointment-extractor";

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

test("keeps only showing-related messages from the landlord, oldest first, with HTML stripped", () => {
  const context = showingContext(
    thread([
      { body: "<p>Ny tid: <b>fremvisning</b> 3/6 kl. 10</p>", created: "2026-01-03T00:00:00.000Z" },
      { body: "Tak for din ansøgning", created: "2026-01-01T00:00:00.000Z" },
      { body: "Åbent hus 1/6 kl. 16-17", created: "2026-01-02T00:00:00.000Z" },
      { body: "Husk åbent hus", sender: { id: "s", name: "Findbolig" }, created: "2026-01-04T00:00:00.000Z" },
    ]),
    null,
  );

  assert.deepEqual(context, { messages: ["Åbent hus 1/6 kl. 16-17", "Ny tid: fremvisning 3/6 kl. 10"], showingText: "" });
});

test("does not reorder the thread it was given", () => {
  const given = thread([
    { id: "late", body: "fremvisning", created: "2026-01-02T00:00:00.000Z" },
    { id: "early", body: "fremvisning", created: "2026-01-01T00:00:00.000Z" },
  ]);

  showingContext(given, null);

  assert.deepEqual(given.messages.map((m) => m.id), ["late", "early"]);
});

test("carries the offer's showing text, HTML stripped, next to the thread", () => {
  const context = showingContext(thread([{ body: "Tak for din ansøgning" }]), "<p>Åbent hus 5/6 kl. 12-13</p>");

  assert.deepEqual(context, { messages: [], showingText: "Åbent hus 5/6 kl. 12-13" });
});

test("is null when there is neither relevant thread text nor showing text, so the LLM is not called", () => {
  assert.equal(showingContext(thread([{ body: "Tak for din ansøgning" }]), null), null);
  assert.equal(showingContext(thread([]), "  <br>  "), null);
});
