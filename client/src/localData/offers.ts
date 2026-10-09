import type { Offer, RecipientState } from "@/types";
import { computed, ref } from "vue";
import type { OfferAnswer, OffersSource } from "~/data/offers/source";
import type { LocalDataContext, LocalDataDefinition, Mode } from "~/lib/localData";
import { cursorKind, type CursorData } from "./delta";

type Offers = CursorData<Offer>;

export function offersKind(sources: Record<Mode, OffersSource>) {
  const definition: LocalDataDefinition<Offers, OffersSource, ReturnType<typeof exposeOffers>> = {
    name: "offers",
    key: "offers_cache",
    failedKey: "offers.refreshFailed",
    sources,
    ...cursorKind<Offer, "offers", OffersSource>({
      itemsKey: "offers",
      keyOf: (offer) => offer.id,
      async fetchEverything(_current, source) {
        const { offers, latestUpdated } = await source.fetchActive();
        return { items: offers, latestUpdated };
      },
    }),
    expose: exposeOffers,
  };
  return definition;
}

function exposeOffers(ctx: LocalDataContext<Offers, OffersSource>) {
  const isActioning = ref(false);

  async function respond(offerId: string, answer: OfferAnswer): Promise<boolean> {
    isActioning.value = true;
    try {
      const recipientState: RecipientState = await ctx.source().respond(offerId, answer);
      ctx.mutate((offers) => ({
        ...offers,
        items: offers.items.map((o) => (o.id === offerId ? { ...o, recipientState } : o)),
      }));
      ctx.notify({ level: "success", key: answer === "accept" ? "offers.acceptSuccess" : "offers.declineSuccess" });
      return true;
    } catch (error) {
      await ctx.fail(error, { key: "offers.actionFailed" });
      return false;
    } finally {
      isActioning.value = false;
    }
  }

  return {
    offers: computed(() => ctx.data.value?.items ?? []),
    updatedAt: computed(() => ctx.data.value?.updatedAt ?? null),
    isActioning,
    acceptOffer: (offerId: string) => respond(offerId, "accept"),
    declineOffer: (offerId: string) => respond(offerId, "decline"),
  };
}
