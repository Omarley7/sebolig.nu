import type { Appointment } from "@/types";

/** One day of the agenda: its date ("2026-11-19") and the viewings that day. */
export type AgendaDay = { date: string; items: Appointment[] };

/** Fremvisninger as one agenda (Q6): upcoming days, viewings still waiting for a date, and past ones. */
export type Agenda = { days: AgendaDay[]; awaitingDate: Appointment[]; past: Appointment[] };

const pad = (n: number) => String(n).padStart(2, "0");

/** A local date as the key appointments carry their date in, "2026-11-19". */
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const timeOf = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

const hasDate = (a: Appointment) => a.date !== null && a.date.trim() !== "";

/** Within a day: by start time, those without a time last. */
const byStart = (a: Appointment, b: Appointment) => {
  if (!a.start) return b.start ? 1 : 0;
  if (!b.start) return -1;
  return a.start.localeCompare(b.start);
};

/** Day, then start time. */
const chronological = (a: Appointment, b: Appointment) => a.date!.localeCompare(b.date!) || byStart(a, b);

/**
 * Sorts appointments into the agenda: viewings from today on by day (soonest first, by start time
 * within a day), those without a date under "Afventer dato", and those from before today under
 * "Tidligere", the latest first. A viewing earlier today stays in today.
 */
export function agenda(appointments: Appointment[], now: Date): Agenda {
  const today = dateKey(now);
  const awaitingDate = appointments.filter((a) => !hasDate(a));
  const dated = appointments.filter(hasDate);
  const past = dated.filter((a) => a.date! < today).sort((a, b) => chronological(b, a));
  const days = new Map<string, Appointment[]>();
  for (const a of dated.filter((a) => a.date! >= today).sort(chronological)) {
    days.set(a.date!, [...(days.get(a.date!) ?? []), a]);
  }
  return { days: [...days].map(([date, items]) => ({ date, items })), awaitingDate, past };
}

/** Whether a viewing is over: on a day before today, or earlier today than now. One without a time today is not. */
function isOver(a: Appointment, now: Date): boolean {
  const today = dateKey(now);
  if (a.date! !== today) return a.date! < today;
  const last = a.end ?? a.start;
  return last !== null && last < timeOf(now);
}

/** The hero on Hjem: the first viewing still to come that isn't cancelled, or null. */
export function nextViewing(appointments: Appointment[], now: Date): Appointment | null {
  return appointments.filter((a) => hasDate(a) && !a.cancelled && !isOver(a, now)).sort(chronological)[0] ?? null;
}
