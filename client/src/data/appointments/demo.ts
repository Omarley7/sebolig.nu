import type { Appointment } from "@/types";
import MOCK_APPOINTMENTS from "~/data/MOCK_APPOINTMENTS.json";
import { demoCursor, demoDelay, noChanges } from "~/data/demo";
import { dateInDays } from "~/lib/dateHelper";
import type { AppointmentsSource } from "./source";

/** Sample appointments for the Demo, with dates kept relative to today. */
export function demoAppointments(): AppointmentsSource {
  const dates: (string | null)[] = [dateInDays(-7), dateInDays(0), dateInDays(0), dateInDays(7)];
  const appointments = (MOCK_APPOINTMENTS as Appointment[]).map((appt, i) => ({
    ...appt,
    date: i < dates.length ? dates[i] : null,
  }));

  return {
    async sync() {
      await demoDelay(1500);
      const cursor = demoCursor();
      // The Demo has no threads either: any instant serves as its thread cursor.
      return { appointments, ...cursor, latestMessageAt: cursor.latestUpdated, latestMessageThreadIds: [] };
    },
    fetchDelta: async () => ({ ...noChanges<Appointment>(), latestMessageAt: null, latestMessageThreadIds: [] }),
  };
}
