import type { Appointment, Offer } from "@/types";
/**
 * The appointment's date and time as one line. Either time may be missing when
 * it could not be read from findbolig's messages; a missing part is left out.
 */
export function formatTimeSlot(
  appointment: Pick<Appointment, "date" | "start" | "end">,
  t: (key: string, params?: Record<string, unknown>) => string,
  includeDate = false,
): string {
  if (!appointment.date) return "";
  const { start, end } = appointment;
  const time =
    start && end ? `${start} - ${end}` : start ? start : end ? t("appointments.until", { time: end }) : "";
  if (!includeDate) return time;
  const date = new Date(appointment.date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
  });
  return time ? `d. ${date}, ${time}` : `d. ${date}`;
}
export function formatCurrency(amount: number): string {
  return amount.toLocaleString("da-DK", {
    style: "currency",
    currency: "DKK",
    minimumFractionDigits: 0,
  });
}

const SENT_AT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Copenhagen",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** When a message was sent, as "09/10 15:05" in Danish time. */
export function formatSentAt(sentAt: string): string {
  const part = (type: Intl.DateTimeFormatPartTypes) => SENT_AT.formatToParts(new Date(sentAt)).find((p) => p.type === type)?.value;
  return `${part("day")}/${part("month")} ${part("hour")}:${part("minute")}`;
}

const LONG_DATE = new Intl.DateTimeFormat("da-DK", {
  timeZone: "Europe/Copenhagen",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** A date as "1. december 2026" in Danish time. */
export function formatDate(date: string): string {
  return LONG_DATE.format(new Date(date));
}

/** An offer's rooms and size as one line, "3 værelser · 78 m²"; a missing part is left out. */
export function formatOfferFacts(
  offer: Pick<Offer, "rooms" | "area">,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  const parts: string[] = [];
  if (offer.rooms != null) parts.push(t("offers.rooms", { count: offer.rooms }));
  if (offer.area != null) parts.push(formatArea(offer.area, t));
  return parts.join(" · ");
}

type Translate = (key: string, params?: Record<string, unknown>) => string;

/** Kroner without øre, grouped the Danish way: "13.564". */
export function formatKr(amount: number): string {
  return Math.round(amount).toLocaleString("da-DK");
}

/** A monthly rent as rows show it: "13.564 kr./md", never wrapped apart. */
export function formatRent(amount: number, t: Translate): string {
  return `${formatKr(amount)}\u00a0${t("financials.krPerMonth")}`;
}

/** A size in whole square metres, "53 m²" for 53.15, never wrapped apart. */
export function formatArea(area: number, t: Translate): string {
  return t("offers.area", { value: Math.round(area) });
}

/** Where and how big, as a card's second line (Q16): "2000 Frederiksberg · 3 vær. · 79 m²"; a missing part is left out. */
export function formatPlaceFacts(
  { addressLine2, rooms, area }: { addressLine2: string | null; rooms: number | null; area: number | null },
  t: Translate,
): string {
  const parts: string[] = [];
  if (addressLine2) parts.push(addressLine2);
  if (rooms != null) parts.push(t("common.roomsShort", { count: rooms }));
  if (area != null) parts.push(formatArea(area, t));
  return parts.join(" · ");
}

/** A short date in the user's language: "18. nov." / "18 Nov". */
export function formatShortDate(date: string | Date, locale: string): string {
  return new Date(date).toLocaleDateString(locale === "en" ? "en-GB" : "da-DK", { day: "numeric", month: "short" });
}
