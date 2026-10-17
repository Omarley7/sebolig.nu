/**
 * Saves a snapshot of the maintainer's whole findbolig.nu account, for checks and for comparing
 * one day's account with another's: every offer (old ones too) with its thread, residence and
 * position, plus the waiting lists. Read-only: it never accepts, declines or sends anything.
 *
 *   cd server && npx tsx --tsconfig tsconfig.json scripts/snapshot-account.ts
 *   cd server && npx tsx --tsconfig tsconfig.json scripts/snapshot-account.ts <snapshot.json>
 *
 * The first form writes `.scratch/account-snapshots/<time>.json` (gitignored: real messages are
 * personal data), then runs the checks in `snapshot-analysis.ts` over it. The second only reruns
 * the checks on a snapshot already on disk. The login comes from the env vars or `server/.env`,
 * else it asks for it.
 */
import "~/lib/tls-setup";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FindboligClient } from "~/lib/findbolig-client";
import { httpTransport } from "~/lib/http-transport";
import { Limiter } from "~/lib/limiter";
import { credentials } from "./credentials";
import { messagesAfterUpdated, type OfferWithThread } from "./snapshot-analysis";

const DIR = join(import.meta.dirname, "../../.scratch/account-snapshots");

/** One failed call is recorded in the snapshot rather than losing the whole run. */
async function attempt<T>(errors: string[], what: string, call: () => Promise<T>): Promise<T | null> {
  try {
    return await call();
  } catch (error) {
    errors.push(`${what}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function takeSnapshot() {
  const { email, password } = await credentials();
  const client = await FindboligClient.connect(httpTransport, email, password);
  const limiter = new Limiter(5);
  const errors: string[] = [];
  const takenAt = new Date().toISOString();

  const { results: offers } = await client.searchOffers();
  console.log(`${offers.length} offers`);
  const offerEntries = await Promise.all(
    offers.map((offer) =>
      limiter.run(async () => {
        const [thread, residence, position] = await Promise.all([
          attempt(errors, `thread ${offer.id}`, () => client.getThreadForOffer(offer.id)),
          offer.residenceId
            ? attempt(errors, `residence ${offer.residenceId}`, () => client.getResidence(offer.residenceId!))
            : null,
          attempt(errors, `position ${offer.id}`, () => client.getPositionOnOffer(offer.id)),
        ]);
        return { offer, thread, residence, position };
      }),
    ),
  );

  const applications = await client.getResidenceApplications();
  const propertyIds = [...new Set(applications.map((application) => application.propertyId))];
  const properties = await client.searchPropertiesByIds(propertyIds);
  const positions = await Promise.all(
    propertyIds.map((propertyId) =>
      limiter.run(async () => ({
        propertyId,
        position: await attempt(errors, `waiting-list position ${propertyId}`, () =>
          client.getPositionForProperty(propertyId),
        ),
      })),
    ),
  );
  console.log(`${applications.length} waiting-list applications across ${propertyIds.length} properties`);

  const snapshot = { takenAt, offers: offerEntries, waitingLists: { applications, properties, positions }, errors };
  mkdirSync(DIR, { recursive: true });
  const file = join(DIR, `${takenAt.replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Snapshot in ${file}${errors.length ? ` (${errors.length} calls failed, listed under "errors")` : ""}`);
  return snapshot;
}

function report(snapshot: { takenAt: string; offers: OfferWithThread[] }) {
  const result = messagesAfterUpdated(snapshot.offers);
  console.log(`\n#87: does a new thread message bump the offer's updated? (snapshot ${snapshot.takenAt})`);
  console.log(`  offers with messages:                     ${result.withMessages}`);
  console.log(`  latest message newer than offer.updated:  ${result.latestAfterUpdated}`);
  console.log(`  latest message newer than recipient's:    ${result.latestAfterRecipientUpdated}`);
  for (const example of result.examples) {
    console.log(
      `  ${example.offerId}  updated ${example.updated}  recipient ${example.recipientUpdated}  message ${example.latestMessage}`,
    );
  }
}

const existing = process.argv[2];
report(existing ? JSON.parse(readFileSync(existing, "utf8")) : await takeSnapshot());
