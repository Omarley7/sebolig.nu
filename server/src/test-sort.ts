import "dotenv/config";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

// session.ts throws at import time unless COOKIE_SECRET is set.
process.env.COOKIE_SECRET ||= "x".repeat(32);

import { fetchOffers, login, UpstreamHttpError } from "./findbolig-service";
import { parseCookies } from "./lib/session";
import "./lib/tls-setup";
import type { ApiOffer } from "./types/offers";

// Candidate sort fields to test on /api/search/offers
const CANDIDATE_SORT_FIELDS = [
  "created",
  "updated",
  "deadline",
  "number",
  "state",
  "residenceAddress",
  "residencePostalCode",
  "recipientsCount",
  "id",
];

function parseCliArgs() {
  const args = process.argv.slice(2);
  const options: Record<string, string> = {};

  for (const arg of args) {
    if (arg.startsWith("--")) {
      const [key, ...values] = arg.slice(2).split("=");
      options[key] = values.join("=");
    }
  }

  return options;
}

function summarizeOffer(offer: ApiOffer): string {
  return `[#${offer.number}] state: ${offer.state.padEnd(10)} | created: ${offer.created ?? "null"} | updated: ${offer.updated ?? "null"} | deadline: ${offer.deadline ?? "null"}`;
}

async function readFromStdin(prompt: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    return (await rl.question(prompt)).trim();
  } finally {
    rl.close();
  }
}

async function testSortOption(cookies: string, orderBy: string, orderDirection: "asc" | "desc") {
  process.stdout.write(`Testing: orderBy="${orderBy}" orderDirection="${orderDirection}" ... `);
  try {
    const page = await fetchOffers(cookies, {
      orderBy,
      orderDirection,
      pageSize: 10,
    });

    console.log(`✅ OK (Total: ${page.totalResults}, Page items: ${page.results.length})`);
    if (page.results.length > 0) {
      console.log(`   Sample results (first ${Math.min(3, page.results.length)}):`);
      for (const item of page.results.slice(0, 3)) {
        console.log(`     - ${summarizeOffer(item)}`);
      }
    } else {
      console.log(`   (No offers returned in account)`);
    }
    console.log();
    return { orderBy, orderDirection, success: true, count: page.totalResults };
  } catch (err) {
    if (err instanceof UpstreamHttpError) {
      console.log(`❌ HTTP ${err.status}: ${err.message}`);
    } else if (err instanceof Error) {
      console.log(`❌ Error: ${err.message}`);
    } else {
      console.log(`❌ Error:`, err);
    }
    console.log();
    return { orderBy, orderDirection, success: false, error: err };
  }
}

async function main() {
  const cliArgs = parseCliArgs();

  if (cliArgs.password || cliArgs.cookies) {
    console.error("Do not pass secrets via CLI args. Use env vars or stdin prompts instead.");
    process.exit(1);
  }

  const email = cliArgs.email || process.env.FINDBOLIG_EMAIL;
  let password = process.env.FINDBOLIG_PASSWORD;
  let cookies = process.env.FINDBOLIG_COOKIES;

  if (!cookies && !password && email) {
    password = await readFromStdin("FINDBOLIG_PASSWORD: ");
  }

  if (!cookies && !email && !password) {
    cookies = await readFromStdin("FINDBOLIG_COOKIES (optional): ");
  }

  if (!cookies) {
    if (!email || !password) {
      console.error("Missing credentials to test FindBolig API sorting.");
      console.error("");
      console.error("Usage:");
      console.error("  Option 1 (via env vars in server/.env):");
      console.error("    FINDBOLIG_EMAIL=your@email.com");
      console.error("    FINDBOLIG_PASSWORD=yourpassword");
      console.error("    npm run test:sort --workspace=server");
      console.error("");
      console.error("  Option 2 (prompt for password via stdin):");
      console.error("    FINDBOLIG_EMAIL=your@email.com npx tsx src/test-sort.ts");
      console.error("");
      console.error("  Option 3 (prompt for cookies via stdin):");
      console.error("    npx tsx src/test-sort.ts");
      console.error("");
      console.error("  Option 4 (test a specific custom field):");
      console.error("    FINDBOLIG_EMAIL=... npx tsx src/test-sort.ts --orderBy=deadline --orderDirection=asc");
      process.exit(1);
    }

    console.log(`Logging in as ${email}...`);
    const loginResult = await login(email, password);
    if (!loginResult || !loginResult.cookies || loginResult.cookies.length === 0) {
      console.error("❌ Login failed. Please check your credentials.");
      process.exit(1);
    }
    cookies = parseCookies(loginResult.cookies);
    console.log("✅ Authenticated successfully.\n");
  } else {
    console.log("Using provided cookies.\n");
  }

  // If a specific orderBy was passed via CLI:
  if (cliArgs.orderBy) {
    const dir = (cliArgs.orderDirection === "asc" ? "asc" : "desc") as "asc" | "desc";
    await testSortOption(cookies, cliArgs.orderBy, dir);
    return;
  }

  console.log("=== Testing Sorting Options on /api/search/offers ===\n");

  for (const field of CANDIDATE_SORT_FIELDS) {
    for (const dir of ["desc", "asc"] as const) {
      await testSortOption(cookies, field, dir);
    }
  }

  console.log("=== Testing Complete ===");
}

main().catch((err) => {
  console.error("Unexpected failure:", err);
  process.exit(1);
});
