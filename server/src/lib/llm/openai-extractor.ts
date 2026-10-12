import { OpenAI } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { Limiter } from "~/lib/limiter";
import { EMPTY_DETAILS, type AppointmentExtractor, type ShowingContext } from "./appointment-extractor";

export const ExtractedDetailsSchema = z.object({
  date: z
    .string()
    .describe(
      "The date of the open house in YYYY-MM-DD format (e.g., 2025-12-15). Empty string if not found.",
    ),
  startTime: z
    .string()
    .describe(
      "The start time of the open house in HH:mm format (e.g., 16:00). Empty string if not found.",
    ),
  endTime: z
    .string()
    .describe(
      "The end time of the open house in HH:mm format (e.g., 16:00). Empty string if not found.",
    ),
  cancelled: z
    .boolean()
    .describe(
      "Whether the open house is cancelled. True if cancelled, false if not.",
    ),
  quote: z
    .string()
    .describe(
      "The exact text from the input that the date was read from, copied character for character. Empty string if there is no date.",
    ),
});

/**
 * How many LLM calls this server makes at once, across every Connection. Well above the
 * per-Connection findbolig.nu limit so the LLM never becomes the bottleneck of a sync, yet capped
 * so a full sync (or several at once) stays clear of the provider's rate limits.
 */
const LLM_CONCURRENCY = 16;
const llmLimiter = new Limiter(LLM_CONCURRENCY);

const EXTRACTION_PROMPT = `Du er en dansk tekst-analysator. Ekstraher dato og tidspunkt for en konkret planlagt fremvisning eller åbent hus.

Du får én af to kilder:
1. Beskeder fra udlejer om fremvisning eller åbent hus, ældste først, hver med den dato den blev sendt
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
- Hvis året ikke står, så vælg det år der lægger fremvisningen på eller efter den dag beskeden blev sendt (for fremvisningsteksten: i dag). En besked sendt 2026-12-28 om "åbent hus d. 3/1" betyder 2027-01-03. Det samme gælder "i morgen", "på tirsdag" o.l.
- Kopier i quote den nøjagtige tekst som datoen står i, tegn for tegn som i kilden`;

/** The instructions and input one extraction sends, for production and the eval harness alike. */
export function extractionRequest(context: ShowingContext, today: string) {
  const instructions = `${EXTRACTION_PROMPT}\n\nI dag er ${today}.`;
  const input =
    context.source === "thread"
      ? ["Beskeder om fremvisning/åbent hus (ældste først):", ...context.messages.map((m) => `Sendt ${m.sent}:\n${m.text}`)].join("\n\n")
      : `Annoncens fremvisningstekst:\n${context.text}`;
  return { instructions, input };
}

export type OpenAIModel = { model: string; effort: OpenAI.ReasoningEffort };

/** What production runs. Not "minimal": on real listings it read svarfrist and move-in dates as showings (#77). */
export const PRODUCTION_MODEL: OpenAIModel = { model: "gpt-5-nano-2025-08-07", effort: "low" };

/** The extractor production uses: OpenAI, reached with `apiKey`. The eval harness passes other models. */
export function openAIExtractor(apiKey: string | undefined, { model, effort } = PRODUCTION_MODEL): AppointmentExtractor {
  const openai = new OpenAI({ apiKey });
  return {
    extract: (context, today) =>
      llmLimiter.run(async () => {
        const response = await openai.responses.parse({
          model,
          reasoning: { effort },
          ...extractionRequest(context, today),
          text: {
            format: zodTextFormat(ExtractedDetailsSchema, "appointment_details"),
          },
        });
        return response.output_parsed ?? { ...EMPTY_DETAILS, quote: "" };
      }),
  };
}
