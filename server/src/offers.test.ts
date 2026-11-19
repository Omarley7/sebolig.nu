import { test } from "node:test";
import assert from "node:assert/strict";

import { FindboligClient } from "./lib/findbolig-client";
import { FakeFindbolig } from "./lib/fake-findbolig";
import { apiResidence } from "./lib/test-fixtures";
import { getActiveOffers, getOfferUpdates } from "./offers";
import type { ApiOffer, ApiOfferRecipient } from "./types/offers";

const T = "2026-01-10T00:00:00.000Z";
const BEFORE = { since: "2026-01-01T00:00:00.000Z", sinceIds: [] };

/** An offer the user has not answered yet, in findbolig.nu's `state`. */
function offer(id: string, state: string): Partial<ApiOffer> {
  return { id, residenceId: `r-${id}`, state, updated: T, recipients: [{ userId: "u1", state: "OfferReceived" } as ApiOfferRecipient] };
}

/** A client on a fake findbolig.nu listing `offers`, each with a residence and a position. */
async function clientWithOffers(offers: Partial<ApiOffer>[]) {
  const fake = new FakeFindbolig()
    .addAccount("tenant@example.com", "pw", "Test Tenant")
    .on("POST /api/search/offers", () => ({ json: { facets: {}, totalResults: offers.length, page: 0, pageSize: 25, results: offers } }));
  for (const { id, residenceId } of offers) {
    fake
      .on(`GET /api/models/residence/${residenceId}`, () => ({ json: apiResidence() }))
      .on(`GET /api/search/waiting-lists/applicants/position-on-offer/${id}`, () => ({ json: 4 }));
  }
  return FindboligClient.connect(fake, "tenant@example.com", "pw");
}

test("an offer the landlord edited after sending it (Changed) is still open, like a Published one", async () => {
  const client = await clientWithOffers([offer("sent", "Published"), offer("edited", "Changed"), offer("closed", "Finished")]);

  const { offers } = await getActiveOffers(client);

  assert.deepEqual(offers.map((o) => o.id).sort(), ["edited", "sent"]);
});

test("a delta keeps an offer that went from Published to Changed, instead of reporting it removed", async () => {
  const client = await clientWithOffers([offer("edited", "Changed")]);

  const delta = await getOfferUpdates(client, BEFORE);

  assert.deepEqual([delta.items.map((o) => o.id), delta.removedIds], [["edited"], []]);
});
