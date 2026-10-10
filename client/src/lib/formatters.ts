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
