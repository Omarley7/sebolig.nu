import { createI18n } from "vue-i18n";
import da from "./locales/da.json";
import en from "./locales/en.json";

type MessageSchema = typeof da;

/** Every dot-path to a message, e.g. "offers.acceptSuccess"; a typo or a missing key fails the type check. */
type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];
export type MessageKey = Paths<MessageSchema>;

declare module "vue-i18n" {
  export interface DefineLocaleMessage extends MessageSchema {}
}

const i18n = createI18n<[MessageSchema], "da" | "en">({
  legacy: false,
  locale: "da",
  fallbackLocale: "en",
  // A missing message is a bug: loud in development, quietly falling back to English in production.
  // (locales.test.ts and the MessageKey type catch most of them before they get here.)
  missingWarn: import.meta.env.DEV,
  fallbackWarn: import.meta.env.DEV,
  missing: import.meta.env.DEV
    ? (locale, key) => console.error(`[i18n] Missing message "${key}" for locale "${locale}"`)
    : undefined,
  messages: {
    da,
    en,
  },
});

export default i18n;

export function useI18n() {
  return i18n.global;
}
