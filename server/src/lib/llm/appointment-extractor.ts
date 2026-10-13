import type { ApiMessageThreadFull } from "~/types/threads";

/** When and whether a showing takes place. Empty strings mean the field was not found. */
export type AppointmentDetails = {
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  startTime: string;
  /** HH:mm */
  endTime: string;
  cancelled: boolean;
};

export const EMPTY_DETAILS: AppointmentDetails = { date: "", startTime: "", endTime: "", cancelled: false };

/** An extractor's answer: the details plus `quote`, the exact text of the input the date was read from. */
export type ExtractedDetails = AppointmentDetails & { quote: string };

export const EMPTY_ANSWER: ExtractedDetails = { ...EMPTY_DETAILS, quote: "" };

/** A landlord's message, HTML stripped. `sent` (YYYY-MM-DD, Danish time) settles the year of "3/1" or "i morgen". */
export type ShowingMessage = { sent: string; text: string };

/**
 * The one source a showing is read from, HTML stripped: the thread's messages about a showing,
 * oldest first, or, when there are none, the offer's `showingText`. Never both: next to the
 * thread, the showing text's generic wording ("indkaldes der til et åbent hus") made the LLM miss
 * clear invitations in the thread.
 */
export type ShowingContext = { source: "thread"; messages: ShowingMessage[] } | { source: "showingText"; text: string };

// The named entities findbolig.nu's messages use; anything else numeric is decoded by number.
const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  aelig: "æ", oslash: "ø", aring: "å", AElig: "Æ", Oslash: "Ø", Aring: "Å",
};

const stripHtml = (text: string) =>
  text
    .replace(/<[^>]*>?/g, "")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, name: string) => {
      if (name[0] !== "#") return ENTITIES[name] ?? entity;
      const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    })
    .trim();

const DANISH_DAY = new Intl.DateTimeFormat("da-DK", { timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit", day: "2-digit" });

/** The date in Denmark, YYYY-MM-DD, of a moment: a `Date` or an ISO timestamp. */
export function danishDate(moment: string | Date): string {
  const part = (type: string) => DANISH_DAY.formatToParts(new Date(moment)).find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * Picks out of `thread` and `showingText` what an extractor needs: the landlord's messages that
 * mention "åbent hus" or "fremvisning" (findbolig.nu's own notices left out) or, failing those,
 * the showing text. Null when there is neither, so no LLM call is paid for.
 */
export function showingContext(thread: ApiMessageThreadFull, showingText: string | null): ShowingContext | null {
  const messages = thread.messages
    .toSorted((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime())
    .filter((message) => message.sender?.name?.toLowerCase() !== "findbolig")
    .map((message) => ({ sent: danishDate(message.created), text: stripHtml(message.body) }))
    .filter(({ text }) => text.toLowerCase().includes("åbent hus") || text.toLowerCase().includes("fremvisning"));
  if (messages.length > 0) return { source: "thread", messages };
  const text = stripHtml(showingText ?? "");
  return text ? { source: "showingText", text } : null;
}

const normalized = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

/** All the text of a context, which a quote must appear in. */
export const contextText = (context: ShowingContext) =>
  context.source === "thread" ? context.messages.map((m) => m.text).join("\n") : context.text;

/**
 * What of an extractor's answer is trusted, for production and the eval harness alike:
 *  - a date counts only when its `quote` appears in the input (case and whitespace aside), so a
 *    date the model made up is dropped (a cancellation stands). It can only remove, never add;
 *  - from the showing text, only a date with a time counts: its svarfrist and move-in dates are
 *    never showings, and it never cancels anything.
 */
export function acceptedDetails(context: ShowingContext, answer: ExtractedDetails): AppointmentDetails {
  const { quote, ...details } = answer;
  const input = normalized(contextText(context));
  if (details.date && !(normalized(quote) && input.includes(normalized(quote)))) {
    return { ...EMPTY_DETAILS, cancelled: context.source === "thread" && details.cancelled };
  }
  if (context.source === "showingText" && !(details.date && (details.startTime || details.endTime))) return EMPTY_DETAILS;
  return details;
}

/**
 * Reads appointment details out of findbolig.nu's free text, in one call per appointment. The
 * OpenAI adapter does this with an LLM; tests use the fake. Either may reject, which the offer
 * listing walk counts as a failed enrichment (the cursor is withheld and the client asks again).
 */
export interface AppointmentExtractor {
  /**
   * From the thread's showing messages or the offer's showing text. `today` (YYYY-MM-DD) dates the
   * showing text, as each message's sent date does a message. Callers pass the answer through
   * `acceptedDetails`.
   */
  extract(context: ShowingContext, today: string): Promise<ExtractedDetails>;
}
