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
      return { appointments, ...demoCursor() };
    },
    fetchDelta: async () => noChanges<Appointment>(),
  };
}
