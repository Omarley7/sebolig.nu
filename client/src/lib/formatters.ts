import type { Appointment } from "@/types";
/**
 * The appointment's date and time as one line. Either time may be missing when
 * it could not be read from findbolig's messages; a missing part is left out.
 */
export function formatTimeSlot(
  appointment: Appointment,
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
