import type { Appointment, Residence } from "@/types";
import { formatCurrency, formatOfferFacts } from "~/lib/formatters";

type Translate = (key: string, params?: Record<string, unknown>) => string;

export type ShareLocale = "da" | "en";

/** What is shared, and how: all `item_shared` ever says about a share. */
export type ShareKind = "viewing" | "offer";
export type ShareMethod = "share_sheet" | "clipboard";

/** What the user chose to send next to the text. */
export type ShareOptions = { mapLink: boolean };

const INTL_LOCALE: Record<ShareLocale, string> = { da: "da-DK", en: "en-GB" };

/** The address on one line, "Ålekistevej 59, 2720 Vanløse"; a missing part is left out. */
function addressOf(residence: Residence): string {
  return [residence.addressLine1, residence.addressLine2].filter(Boolean).join(", ");
}

/** Google's documented Maps URL, searching for the address. */
function mapUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** "Tirsdag 20. oktober 2026, 16:00–17:00": absolute, because the text is read later. */
function whenLine(appointment: Appointment, t: Translate, locale: ShareLocale): string {
  if (!appointment.date) return "";
  // A bare date parses as UTC midnight; formatting it in UTC keeps the day.
  const day = new Date(appointment.date);
  const format = (options: Intl.DateTimeFormatOptions) =>
    day.toLocaleDateString(INTL_LOCALE[locale], { timeZone: "UTC", ...options });
  const weekday = format({ weekday: "long" });
  const date = `${weekday[0].toUpperCase()}${weekday.slice(1)} ${format({ day: "numeric", month: "long", year: "numeric" })}`;
  const { start, end } = appointment;
  const time = start && end ? `${start}–${end}` : start ? start : end ? t("appointments.until", { time: end }) : "";
  return time ? `${date}, ${time}` : date;
}

/** "12.564 kr./md · 3 værelser · 83 m²"; a missing part is left out. */
function factsLine(appointment: Appointment, t: Translate): string {
  const rent = appointment.financials?.monthlyRentIncludingAconto;
  const parts = [
    rent ? `${formatCurrency(rent)}/${t("financials.shortMonth")}` : "",
    formatOfferFacts({ rooms: appointment.rooms ?? null, area: appointment.area ?? null }, t),
  ];
  return parts.filter(Boolean).join(" · ");
}

/**
 * A viewing as the text sent to someone without SeBolig, in the app language. Only what a
 * partner needs to come along: never the user's name, queue position, the findbolig.nu link or
 * the landlord's messages.
 */
export function viewingShareText(appointment: Appointment, options: ShareOptions, t: Translate, locale: ShareLocale): string {
  const address = addressOf(appointment.residence);
  const lines = [
    t("share.viewing", { address }).trim(),
    whenLine(appointment, t, locale),
    factsLine(appointment, t),
    options.mapLink && address ? t("share.mapLine", { url: mapUrl(address) }) : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/** "plantegning-alekistevej-59.png": the floor plan's file name, in letters every app accepts. */
export function floorPlanFileName(street: string | null, t: Translate): string {
  const slug = (street ?? "")
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${[t("share.floorPlanFile"), slug].filter(Boolean).join("-")}.png`;
}
