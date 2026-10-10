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
 * Reads appointment details out of findbolig.nu's free text. The OpenAI adapter does this with an
 * LLM; tests use the fake. Either may reject, which the offer listing walk counts as a failed
 * enrichment (the cursor is withheld and the client asks again).
 */
export interface AppointmentExtractor {
  /** From the message thread about an offer. `year` is assumed where a message leaves it out. */
  fromThread(thread: ApiMessageThreadFull, year: string): Promise<AppointmentDetails>;
  /** From an offer's `showingText`, the fallback when the thread names no date. */
  fromShowingText(showingText: string, year: string): Promise<AppointmentDetails>;
}
