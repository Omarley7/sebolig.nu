/**
 * Checks run over an account snapshot (`snapshot-account.ts`). Pure, so they can be tested and
 * rerun on a snapshot already on disk.
 */
import type { ApiOffer } from "~/types/offers";
import type { ApiMessageThreadFull } from "~/types/threads";

/** A message this close after `updated` is taken as part of the same write. */
const SAME_WRITE_MS = 60_000;
const MAX_EXAMPLES = 5;

export type OfferWithThread = { offer: ApiOffer; thread: ApiMessageThreadFull | null };

/**
 * #87: does a new thread message bump the offer's `updated`? The delta check only sees offers
 * whose `updated` moved, so every offer whose latest message is newer than its `updated` is a
 * message the delta would have missed. The user's own recipient row has an `updated` too, compared
 * separately in case that is the one that moves.
 */
export function messagesAfterUpdated(entries: OfferWithThread[]) {
  const after = (message: string, updated: string | undefined) =>
    updated !== undefined && Date.parse(message) - Date.parse(updated) > SAME_WRITE_MS;

  const withMessages = entries.flatMap(({ offer, thread }) => {
    const latest = thread?.messages
      .map((message) => message.created)
      .reduce<string | undefined>((max, at) => (max === undefined || Date.parse(at) > Date.parse(max) ? at : max), undefined);
    return latest ? [{ offer, latest }] : [];
  });
  const missed = withMessages.filter(({ offer, latest }) => after(latest, offer.updated));

  return {
    withMessages: withMessages.length,
    latestAfterUpdated: missed.length,
    latestAfterRecipientUpdated: withMessages.filter(({ offer, latest }) => after(latest, offer.recipients?.[0]?.updated))
      .length,
    examples: missed
      .sort((a, b) => Date.parse(b.latest) - Date.parse(a.latest))
      .slice(0, MAX_EXAMPLES)
      .map(({ offer, latest }) => ({
        offerId: offer.id,
        updated: offer.updated,
        recipientUpdated: offer.recipients?.[0]?.updated ?? null,
        latestMessage: latest,
      })),
  };
}
