import { OpenAI } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { Limiter } from "~/lib/limiter";
import { EMPTY_DETAILS, type AppointmentExtractor, type ShowingContext } from "./appointment-extractor";

const AppointmentDetailsSchema = z.object({
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
});

/**
 * How many LLM calls this server makes at once, across every Connection. Well above the
 * per-Connection findbolig.nu limit so the LLM never becomes the bottleneck of a sync, yet capped
 * so a full sync (or several at once) stays clear of the provider's rate limits.
 */
const LLM_CONCURRENCY = 16;
const llmLimiter = new Limiter(LLM_CONCURRENCY);

const EXTRACTION_PROMPT = `Du er en dansk tekst-analysator. Ekstraher dato og tidspunkt for en konkret planlagt fremvisning eller åbent hus.

Du får to kilder:
1. Beskeder fra udlejer om fremvisning eller åbent hus, ældste først
2. Annoncens fremvisningstekst

Vigtige regler:
- Beskederne vinder: brug kun fremvisningsteksten hvis beskederne ikke giver nogen dato, og fremvisningsteksten giver en konkret dato OG et tidspunkt
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

function extractionInput({ messages, showingText }: ShowingContext): string {
  return [
    "Beskeder om fremvisning/åbent hus (ældste først):",
    messages.length ? messages.join("\n\n") : "(ingen)",
    "",
    "Annoncens fremvisningstekst:",
    showingText || "(ingen)",
  ].join("\n");
}

/** The extractor production uses: OpenAI, reached with `apiKey`. */
export function openAIExtractor(apiKey: string | undefined): AppointmentExtractor {
  const openai = new OpenAI({ apiKey });
  return {
    extract: (context, year) =>
      llmLimiter.run(async () => {
        const response = await openai.responses.parse({
          model: "gpt-5-nano-2025-08-07",
          reasoning: { effort: "minimal" },
          instructions: EXTRACTION_PROMPT.replace("{currentYear}", year),
          input: extractionInput(context),
          text: {
            format: zodTextFormat(AppointmentDetailsSchema, "appointment_details"),
          },
        });
        return response.output_parsed ?? EMPTY_DETAILS;
      }),
  };
}
