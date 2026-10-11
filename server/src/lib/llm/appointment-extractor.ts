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

/**
 * The text a showing is read from: the thread's messages about a showing, oldest first, and the
 * offer's `showingText`. HTML is stripped from both; empty strings mean there was none.
 */
export type ShowingContext = { messages: string[]; showingText: string };

const stripHtml = (text: string) => text.replace(/<[^>]*>?/g, "").trim();

/**
 * Picks out of `thread` and `showingText` what an extractor needs: the landlord's messages that
 * mention "åbent hus" or "fremvisning" (findbolig.nu's own notices left out), and the showing
 * text. Null when there is neither, so no LLM call is paid for.
 */
export function showingContext(thread: ApiMessageThreadFull, showingText: string | null): ShowingContext | null {
  const messages = thread.messages
    .toSorted((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime())
    .filter((message) => message.sender?.name?.toLowerCase() !== "findbolig")
    .map((message) => stripHtml(message.body))
    .filter((body) => body.toLowerCase().includes("åbent hus") || body.toLowerCase().includes("fremvisning"));
  const text = stripHtml(showingText ?? "");
  return messages.length === 0 && !text ? null : { messages, showingText: text };
}

/**
 * Reads appointment details out of findbolig.nu's free text, in one call per appointment. The
 * OpenAI adapter does this with an LLM; tests use the fake. Either may reject, which the offer
 * listing walk counts as a failed enrichment (the cursor is withheld and the client asks again).
 */
export interface AppointmentExtractor {
  /**
   * From the thread's showing messages and the offer's showing text together. The thread wins;
   * the showing text counts only when the thread names no date and it gives a concrete date and
   * time. `year` is assumed where the text leaves it out.
   */
  extract(context: ShowingContext, year: string): Promise<AppointmentDetails>;
}
