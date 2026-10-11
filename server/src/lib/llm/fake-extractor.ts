import { EMPTY_DETAILS, type AppointmentDetails, type AppointmentExtractor, type ShowingContext } from "./appointment-extractor";

/**
 * An extractor for tests: answers whatever `answer` returns (no details by default) and counts its
 * calls, so a test can tell whether the LLM would have been paid for.
 */
export class FakeExtractor implements AppointmentExtractor {
  calls = 0;

  constructor(
    private readonly answer: (context: ShowingContext) => AppointmentDetails | Promise<AppointmentDetails> = () => EMPTY_DETAILS,
  ) {}

  async extract(context: ShowingContext): Promise<AppointmentDetails> {
    this.calls++;
    return this.answer(context);
  }
}
