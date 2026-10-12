/**
 * Eval harness for the appointment extractor (#78): runs candidate models and prompts over
 * hand-labelled fixtures and prints correctness plus p50/p95 latency and tokens per candidate.
 *
 *   cd server && npx tsx --tsconfig tsconfig.json scripts/eval-extractor.ts [--runs 3] [--only a,b] [--openrouter] [--cases]
 *
 * Fixtures are `.scratch/extractor-fixtures/*.json` at the repo root (gitignored: they hold real
 * messages, which are personal data, and the repo is public). `collect-fixtures.ts` writes them
 * from findbolig.nu; one may also be written by hand. Each is a `Fixture`:
 *
 *   {
 *     "offerId": "…",
 *     "address": "…",                // only to help labelling
 *     "collected": "2026-10-13",     // the `today` the extractor is told
 *     "context": { "source": "thread", "messages": [{ "sent": "2026-10-01", "text": "…" }] }
 *              | { "source": "showingText", "text": "…" },
 *     "expected": { "date": "2026-10-20", "startTime": "16:00", "endTime": "17:00", "cancelled": false } | null,
 *     "note": "…"                    // optional: what the case covers, e.g. "svarfrist trap"
 *   }
 *
 * `expected` is filled in by hand; fixtures where it is still null are skipped. Every answer goes
 * through `acceptedDetails`, as in production, and for the current prompt it is also graded with
 * the quote check off, to show what the check removes.
 *
 * Keys come from `server/.env`: OPENAI_API_KEY, and OPENROUTER_API_KEY for `--openrouter`
 * candidates. OpenRouter is for this eval only: paid models, providers that neither keep nor train
 * on prompts, structured output required, one pinned provider per model with no fallbacks. Its
 * latencies include an extra hop, so they rank candidates; re-measure a winner on its direct API.
 */
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { OpenAI } from "openai";
import { zodResponseFormat, zodTextFormat } from "openai/helpers/zod";
import { Limiter } from "~/lib/limiter";
import {
  acceptedDetails,
  contextText,
  type AppointmentDetails,
  type ExtractedDetails,
  type ShowingContext,
} from "~/lib/llm/appointment-extractor";
import { extractionRequest, ExtractedDetailsSchema, PRODUCTION_MODEL } from "~/lib/llm/openai-extractor";
import { grade, summarize, type Grade, type Run } from "./eval-scoring";

type Fixture = {
  offerId: string;
  address?: string;
  collected: string;
  context: ShowingContext;
  expected: AppointmentDetails | null;
  note?: string;
};

type Request = { instructions: string; input: string };
type Answer = { answer: ExtractedDetails; inputTokens: number; outputTokens: number };
type Candidate = {
  name: string;
  /** `baseline` is the #77 prompt, frozen below; `current` is production's. */
  prompt: "baseline" | "current";
  openrouter?: boolean;
  call: (request: Request) => Promise<Answer>;
};

// The prompt and input as #77 shipped them, to measure the year and quote fixes against.
const BASELINE_PROMPT = `Du er en dansk tekst-analysator. Ekstraher dato og tidspunkt for en konkret planlagt fremvisning eller åbent hus.

Du får én af to kilder:
1. Beskeder fra udlejer om fremvisning eller åbent hus, ældste først
2. Annoncens fremvisningstekst

Vigtige regler:
- Fremvisningsteksten tæller kun hvis den giver en konkret dato OG et tidspunkt
- Hvis der er flere beskeder om fremvisning eller åbent hus, skal du bruge den seneste besked
- Hvis fremvisningen eller åbent hus er aflyst, returner cancelled som true, og date, startTime og endTime som tomme værdier
- Svarfrister (f.eks. "svarfrist for deltagelse er...") er IKKE fremvisningsdatoer - ignorer dem
- Udlejnings- og indflytningsdatoer (f.eks. "klar til udlejning pr...") er IKKE fremvisningsdatoer - ignorer dem
- Hvis der kun står at der VIL BLIVE indkaldt til åbent hus (fremtid/ubestemt), men ingen konkret dato og tid er fastsat, returner tomme værdier
- Datoen SKAL formateres som YYYY-MM-DD (f.eks. 2025-12-15)
- Starttiden SKAL formateres som HH:mm (f.eks. 16:00)
- Sluttiden SKAL formateres som HH:mm (f.eks. 16:00)
- Hvis der ikke findes nogen dato eller start- eller sluttid, returner tomme værdier for alle felter
- Antag at året er {currentYear} hvis det ikke er specificeret`;

function baselineRequest(context: ShowingContext, today: string): Request {
  return {
    instructions: BASELINE_PROMPT.replace("{currentYear}", today.slice(0, 4)),
    input: [
      "Beskeder om fremvisning/åbent hus (ældste først):",
      context.source === "thread" ? context.messages.map((m) => m.text).join("\n\n") : "(ingen)",
      "",
      "Annoncens fremvisningstekst:",
      context.source === "showingText" ? context.text : "(ingen)",
    ].join("\n"),
  };
}

function openAICandidate(name: string, prompt: Candidate["prompt"], model: string, effort: OpenAI.ReasoningEffort): Candidate {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return {
    name,
    prompt,
    async call(request) {
      const response = await openai.responses.parse({
        model,
        reasoning: { effort },
        ...request,
        text: { format: zodTextFormat(ExtractedDetailsSchema, "appointment_details") },
      });
      if (!response.output_parsed) throw new Error("no parsed output");
      return {
        answer: response.output_parsed,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      };
    },
  };
}

/** A candidate through OpenRouter's OpenAI-compatible chat API, pinned to `provider`. */
function openRouterCandidate(name: string, model: string, provider: string, effort?: OpenAI.ReasoningEffort): Candidate {
  const openrouter = new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1" });
  return {
    name,
    prompt: "current",
    openrouter: true,
    async call({ instructions, input }) {
      const body = {
        model,
        messages: [
          { role: "system" as const, content: instructions },
          { role: "user" as const, content: input },
        ],
        response_format: zodResponseFormat(ExtractedDetailsSchema, "appointment_details"),
        // OpenRouter's own fields; the SDK passes them through.
        provider: {
          order: [provider],
          allow_fallbacks: false,
          require_parameters: true,
          data_collection: "deny",
          zdr: true,
        },
        ...(effort ? { reasoning: { effort } } : {}),
      };
      const response = await openrouter.chat.completions.parse(body as Parameters<typeof openrouter.chat.completions.parse>[0]);
      const parsed = response.choices[0]?.message.parsed;
      if (!parsed) throw new Error(`no parsed output: ${response.choices[0]?.message.content?.slice(0, 80) ?? "empty"}`);
      return {
        answer: parsed as ExtractedDetails,
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      };
    },
  };
}

// Model ids for OpenRouter: check https://openrouter.ai/models before a run.
const CANDIDATES: Candidate[] = [
  openAICandidate("baseline: gpt-5-nano low", "baseline", PRODUCTION_MODEL.model, "low"),
  openAICandidate("gpt-5-nano low", "current", PRODUCTION_MODEL.model, "low"),
  openAICandidate("gpt-6-luna none", "current", "gpt-6-luna", "none"),
  openAICandidate("gpt-6-luna low", "current", "gpt-6-luna", "low"),
  openRouterCandidate("haiku-5.5 (OR)", "anthropic/claude-haiku-5.5", "anthropic"),
  openRouterCandidate("gpt-oss-20b low (OR)", "openai/gpt-oss-20b", "groq", "low"),
];

/** Calls in flight per candidate: enough to finish in reasonable time, few enough not to skew latency. */
const CONCURRENCY = 4;

function loadFixtures(dir: string): Fixture[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(readFileSync(join(dir, file), "utf8")) as Fixture);
}

const show = (d: AppointmentDetails) => (d.cancelled ? "cancelled" : [d.date, d.startTime, d.endTime].join(" ").trim() || "(none)");
const MARK: Record<Grade, string> = { correct: "✓", wrong: "✗", miss: "·", error: "!" };

async function main() {
  const { values } = parseArgs({
    options: {
      runs: { type: "string", default: "3" },
      only: { type: "string" },
      openrouter: { type: "boolean", default: false },
      cases: { type: "boolean", default: false },
      fixtures: { type: "string", default: join(import.meta.dirname, "../../.scratch/extractor-fixtures") },
    },
  });
  const runs = Number(values.runs);
  const only = values.only?.split(",");
  const candidates = CANDIDATES.filter(
    (c) => (only ? only.some((name) => c.name.includes(name)) : true) && (values.openrouter || !c.openrouter),
  );

  const all = loadFixtures(values.fixtures);
  const fixtures = all.filter((f) => f.expected);
  console.log(`${fixtures.length} labelled fixtures (${all.length - fixtures.length} without expected skipped), ${runs} runs each\n`);

  const table: string[] = [];
  for (const candidate of candidates) {
    const limiter = new Limiter(CONCURRENCY);
    const checked: Run[] = [];
    const quoteDropped = { correct: 0, wrong: 0 };
    const lines = await Promise.all(
      fixtures.map(async (fixture) => {
        const expected = fixture.expected!;
        const request =
          candidate.prompt === "baseline"
            ? baselineRequest(fixture.context, fixture.collected)
            : extractionRequest(fixture.context, fixture.collected);
        const results = await Promise.all(
          Array.from({ length: runs }, () =>
            limiter.run(async () => {
              const started = performance.now();
              try {
                const { answer, inputTokens, outputTokens } = await candidate.call(request);
                const ms = Math.round(performance.now() - started);
                // The baseline has no quote; for the current prompt, also grade with the check off.
                const unchecked = acceptedDetails(fixture.context, { ...answer, quote: contextText(fixture.context) });
                const got = candidate.prompt === "baseline" ? unchecked : acceptedDetails(fixture.context, answer);
                const g = grade(expected, got);
                const gUnchecked = grade(expected, unchecked);
                if (g !== gUnchecked && (gUnchecked === "correct" || gUnchecked === "wrong")) quoteDropped[gUnchecked]++;
                checked.push({ grade: g, ms, inputTokens, outputTokens });
                return { g, got };
              } catch (error) {
                checked.push({ grade: "error", ms: 0, inputTokens: 0, outputTokens: 0 });
                return { g: "error" as Grade, got: null, error: String(error).slice(0, 120) };
              }
            }),
          ),
        );
        const marks = results.map((r) => MARK[r.g]).join("");
        const off = results
          .filter((r) => r.g !== "correct")
          .map((r) => ("error" in r ? r.error : show(r.got!)))
          .join(" | ");
        return `  ${marks}  ${fixture.offerId}${fixture.note ? ` (${fixture.note})` : ""}${off ? `  expected ${show(expected)}, got ${off}` : ""}`;
      }),
    );

    const s = summarize(checked);
    console.log(`${candidate.name}: ${s.correct}/${s.runs} correct, ${s.wrong} wrong, ${s.miss} miss, ${s.error} error`);
    if (candidate.prompt === "current") {
      console.log(`  quote check dropped ${quoteDropped.wrong} wrong and ${quoteDropped.correct} correct answers`);
    }
    if (values.cases) console.log(lines.join("\n"));
    else console.log(lines.filter((line) => !/^ {2}✓+ /.test(line)).join("\n"));
    console.log();
    table.push(
      `| ${candidate.name} | ${s.correct}/${s.runs} | ${s.wrong} | ${s.miss} | ${s.error} | ${s.p50Ms} | ${s.p95Ms} | ${s.meanInputTokens} / ${s.meanOutputTokens} |`,
    );
  }

  console.log("| candidate | correct | wrong | miss | error | p50 ms | p95 ms | tokens in / out |");
  console.log("|---|---|---|---|---|---|---|---|");
  console.log(table.join("\n"));
}

await main();
