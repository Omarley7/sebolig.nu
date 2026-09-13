import type { Appointment } from "@/types";
export function formatTimeSlot(appointment: Appointment, includeDate = false): string {
  if (!appointment.date) return "";
  const date = new Date(appointment.date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
  });
  const startTime = appointment.start;
  const endTime = appointment.end;
  if (!includeDate) return `${startTime} - ${endTime}`;
  return `d. ${date}, ${startTime} - ${endTime}`;
}
export function formatCurrency(amount: number): string {
  return amount.toLocaleString("da-DK", {
    style: "currency",
    currency: "DKK",
    minimumFractionDigits: 0,
  });
}
