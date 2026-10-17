/**
 * Collects eval fixtures for `eval-extractor.ts` (#78) straight from findbolig.nu: logs in with
 * the maintainer's account and, for every Finished or Published offer with something to extract,
 * writes `.scratch/extractor-fixtures/<offerId>.json` (gitignored: real messages are personal data).
 *
 *   cd server && npx tsx --tsconfig tsconfig.json scripts/collect-fixtures.ts
 *
 * The login comes from the env vars or `server/.env`, else it asks for it. Nothing is stored but the fixtures.
 *
 * `expected` is left null for the maintainer to fill in by hand (format in `eval-extractor.ts`). A
 * fixture already on disk is left alone while its context is unchanged; when the thread has grown,
 * its context is replaced and `expected` reset, the old answer kept as `previousExpected`.
 */
import "~/lib/tls-setup";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { FindboligClient } from "~/lib/findbolig-client";
import { httpTransport } from "~/lib/http-transport";
import { Limiter } from "~/lib/limiter";
import { danishDate, showingContext } from "~/lib/llm/appointment-extractor";
import { credentials } from "./credentials";

const DIR = join(import.meta.dirname, "../../.scratch/extractor-fixtures");

async function main() {
  const { email, password } = await credentials();
  const client = await FindboligClient.connect(httpTransport, email, password);
  const { results: offers } = await client.searchOffers();
  const upcoming = offers.filter((offer) => offer.state === "Finished" || offer.state === "Published");
  console.log(`${offers.length} offers, ${upcoming.length} Finished or Published`);

  mkdirSync(DIR, { recursive: true });
  const collected = danishDate(new Date());
  const limiter = new Limiter(5);
  const counts = { new: 0, changed: 0, unchanged: 0, nothing: 0 };
  await Promise.all(
    upcoming.map((offer) =>
      limiter.run(async () => {
        const thread = await client.getThreadForOffer(offer.id);
        const context = thread && showingContext(thread, offer.showingText);
        if (!context) return counts.nothing++;
        const residence = offer.residenceId ? await client.getResidence(offer.residenceId).catch(() => null) : null;

        const file = join(DIR, `${offer.id}.json`);
        const old = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
        if (old && isDeepStrictEqual(old.context, context)) return counts.unchanged++;
        const fixture = {
          offerId: offer.id,
          address: residence ? `${residence.addressLine1}, ${residence.addressLine2}` : "",
          collected,
          context,
          expected: null,
          ...(old?.expected ? { previousExpected: old.expected } : {}),
          note: old?.note ?? "",
        };
        writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`);
        counts[old ? "changed" : "new"]++;
      }),
    ),
  );
  console.log(
    `${counts.new} new, ${counts.changed} changed (expected reset), ${counts.unchanged} unchanged, ${counts.nothing} with nothing to extract`,
  );
  console.log(`Fixtures in ${DIR}`);
}

await main();
