import { OpenAI } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { ApiMessageThreadFull } from "~/types/threads";
import { EMPTY_DETAILS, type AppointmentDetails, type AppointmentExtractor } from "./appointment-extractor";

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

const EXTRACTION_PROMPT = `Du er en dansk tekst-analysator. Ekstraher dato og tidspunkt for fremvisning eller åbent hus fra beskeden.

Vigtige regler:
- Datoen SKAL formateres som YYYY-MM-DD (f.eks. 2025-12-15)
- Starttiden SKAL formateres som HH:mm (f.eks. 16:00)
- Sluttiden SKAL formateres som HH:mm (f.eks. 16:00)
- Hvis der ikke findes nogen dato eller start- eller sluttid, returner en tom dato og tidspunkt
- Hvis fremvisningen eller åbent hus er aflyst, returner cancelled som true, og date, startTime og endTime som tomme dato og tidspunkt
- Hvis der er flere beskeder om fremvisning eller åbent hus, skal du bruge den seneste besked
- Antag at året er {currentYear} hvis det ikke er specificeret`;

async function callLLMForAppointmentDetails(
  openai: OpenAI,
  context: string,
  currentYear: string,
): Promise<AppointmentDetails> {
  if (!context.trim()) {
    return EMPTY_DETAILS;
  }

  const response = await openai.responses.parse({
    model: "gpt-5-nano-2025-08-07",
    instructions: EXTRACTION_PROMPT.replace("{currentYear}", currentYear),
    input: `Ekstraher dato og tidspunkt fra følgende besked(er) om fremvisning/åbent hus:\n\n${context}`,
    text: {
      format: zodTextFormat(AppointmentDetailsSchema, "appointment_details"),
    },
  });

  return response.output_parsed ?? EMPTY_DETAILS;
}

async function extractAppointmentDetailsWithLLM(
  openai: OpenAI,
  thread: ApiMessageThreadFull,
  currentYear: string,
) {
  const messages = thread.messages.sort(
    (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime(),
  );

  // Remove all HTML tags from messages
  const cleanMessages = messages.map((message) => ({
    ...message,
    body: message.body.replace(/<[^>]*>?/g, ""),
  }));

  // Filter out messages where sender.name is findbolig
  const agentMessages = cleanMessages.filter(
    (message) => message.sender?.name?.toLowerCase() !== "findbolig",
  );

  // Filter to messages about showings (åbent hus or fremvisning)
  const showingMessages = agentMessages.filter((message) => {
    const body = message.body.toLowerCase();
    return body.includes("åbent hus") || body.includes("fremvisning");
  });

  if (showingMessages.length === 0) {
    return EMPTY_DETAILS;
  }

  const context = showingMessages.map((message) => message.body).join("\n\n");

  return callLLMForAppointmentDetails(openai, context, currentYear);
}

const SHOWING_TEXT_PROMPT = `Du er en dansk tekst-analysator. Ekstraher dato og tidspunkt for en konkret planlagt fremvisning eller åbent hus fra beskeden.

Vigtige regler:
- Du skal KUN returnere dato/tid hvis der er en konkret planlagt fremvisning med dato OG tidspunkt
- Svarfrister (f.eks. "svarfrist for deltagelse er...") er IKKE fremvisningsdatoer - ignorer dem
- Udlejningsdatoer (f.eks. "klar til udlejning pr...") er IKKE fremvisningsdatoer - ignorer dem
- Hvis beskeden kun nævner at der VIL BLIVE indkaldt til åbent hus (fremtid/ubestemt), men ingen konkret dato og tid er fastsat, returner tomme værdier
- Datoen SKAL formateres som YYYY-MM-DD (f.eks. 2025-12-15)
- Starttiden SKAL formateres som HH:mm (f.eks. 16:00)
- Sluttiden SKAL formateres som HH:mm (f.eks. 16:00)
- Hvis der ikke er en konkret dato med tilhørende tidspunkt, returner tomme værdier for alle felter
- Antag at året er {currentYear} hvis det ikke er specificeret`;

async function extractAppointmentDetailsFromShowingText(
  openai: OpenAI,
  showingText: string,
  currentYear: string,
): Promise<AppointmentDetails> {
  const cleanText = showingText.replace(/<[^>]*>?/g, "").trim();
  if (!cleanText) {
    return EMPTY_DETAILS;
  }

  const response = await openai.responses.parse({
    model: "gpt-5-nano-2025-08-07",
    instructions: SHOWING_TEXT_PROMPT.replace("{currentYear}", currentYear),
    input: `Ekstraher dato og tidspunkt for en konkret planlagt fremvisning/åbent hus fra følgende tekst:\n\n${cleanText}`,
    text: {
      format: zodTextFormat(AppointmentDetailsSchema, "appointment_details"),
    },
  });

  return response.output_parsed ?? EMPTY_DETAILS;
}

/** The extractor production uses: OpenAI, reached with `apiKey`. */
export function openAIExtractor(apiKey: string | undefined): AppointmentExtractor {
  const openai = new OpenAI({ apiKey });
  return {
    fromThread: (thread, year) => extractAppointmentDetailsWithLLM(openai, thread, year),
    fromShowingText: (showingText, year) => extractAppointmentDetailsFromShowingText(openai, showingText, year),
  };
}
