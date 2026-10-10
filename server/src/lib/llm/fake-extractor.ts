import type { ApiMessageThreadFull } from "~/types/threads";
import { EMPTY_DETAILS, type AppointmentDetails, type AppointmentExtractor } from "./appointment-extractor";

/**
 * An extractor for tests: answers whatever `answer` returns (no details by default) and counts its
 * calls, so a test can tell whether the LLM would have been paid for.
 */
export class FakeExtractor implements AppointmentExtractor {
  calls = 0;

  constructor(
    private readonly answer: (input: { thread?: ApiMessageThreadFull; showingText?: string }) => AppointmentDetails | Promise<AppointmentDetails> =
      () => EMPTY_DETAILS,
  ) {}

  async fromThread(thread: ApiMessageThreadFull): Promise<AppointmentDetails> {
    this.calls++;
    return this.answer({ thread });
  }

  async fromShowingText(showingText: string): Promise<AppointmentDetails> {
    this.calls++;
    return this.answer({ showingText });
  }
}
