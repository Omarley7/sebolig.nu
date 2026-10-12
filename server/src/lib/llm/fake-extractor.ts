import { EMPTY_DETAILS, type AppointmentExtractor, type ExtractedDetails, type ShowingContext } from "./appointment-extractor";

/**
 * An extractor for tests: answers whatever `answer` returns (no details by default) and counts its
 * calls, so a test can tell whether the LLM would have been paid for.
 */
export class FakeExtractor implements AppointmentExtractor {
  calls = 0;

  constructor(
    private readonly answer: (context: ShowingContext) => ExtractedDetails | Promise<ExtractedDetails> = () => ({ ...EMPTY_DETAILS, quote: "" }),
  ) {}

  async extract(context: ShowingContext): Promise<ExtractedDetails> {
    this.calls++;
    return this.answer(context);
  }
}
