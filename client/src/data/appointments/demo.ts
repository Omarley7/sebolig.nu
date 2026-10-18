import type { Appointment, ThreadMessage } from "@/types";
import MOCK_APPOINTMENTS from "~/data/MOCK_APPOINTMENTS.json";
import { demoCursor, demoDelay, noChanges } from "~/data/demo";
import { dateInDays } from "~/lib/dateHelper";
import type { AppointmentsSource } from "./source";

/** A moment `days` from now (negative: ago) at `time`, as findbolig.nu stamps a message. */
const sentAt = (days: number, time: string) => `${dateInDays(days)}T${time}:00Z`;

const notice = (days: number): ThreadMessage => ({
  from: "findbolig",
  senderName: null,
  sentAt: sentAt(days, "07:12"),
  body: "Kære boligsøgende\n\nDu har stået på venteliste til en bolig, som nu er blevet ledig. Du har derfor modtaget et boligtilbud, som du kan læse og besvare via 'Mine boligtilbud'.\n\nMed venlig hilsen\nFindbolig",
  hasAttachments: false,
});

/** A showing `days` from now, as a landlord writes it: "d. 11/10". */
const showingDay = (days: number) => `d. ${dateInDays(days).slice(8, 10)}/${dateInDays(days).slice(5, 7)}`;

const invitation = (days: number, when: string): ThreadMessage => ({
  from: "landlord",
  senderName: "Udlejningen",
  sentAt: sentAt(days, "09:30"),
  body: `Kære ansøger,\n\nDer er fremvisning ${when}. Lejemålet fremvises af nuværende lejer, så kom venligst præcis.\n\nGiv besked, hvis du ikke længere er interesseret.\n\nMed venlig hilsen\nUdlejningen`,
  hasAttachments: false,
});

/** Each sample appointment's thread, oldest first: the first has a message after its viewing. */
const threads: ThreadMessage[][] = [
  [
    notice(-14),
    invitation(-12, `${showingDay(-7)} kl. 16:00-16:20`),
    {
      from: "landlord",
      senderName: "Udlejningen",
      sentAt: sentAt(-2, "11:05"),
      body: "Tak fordi du kom til fremvisningen.\n\nØnsker du at søge boligen, så udfyld ansøgningsskemaet på www.example.dk/ansoeg senest fredag. Vi skal bruge lønsedler og en kopi af dit pas.",
      hasAttachments: true,
    },
  ],
  [notice(-6), invitation(-5, `${showingDay(0)} kl. 15:00-15:20`)],
  [notice(-4), invitation(-3, showingDay(0))],
  [notice(-3), invitation(-1, `${showingDay(7)} kl. 15:30-15:50`)],
  [notice(-1)],
];

/** Sample appointments for the Demo, with dates kept relative to today. */
export function demoAppointments(): AppointmentsSource {
  const dates: (string | null)[] = [dateInDays(-7), dateInDays(0), dateInDays(0), dateInDays(7)];
  const appointments = (MOCK_APPOINTMENTS as Appointment[]).map((appt, i) => ({
    ...appt,
    date: i < dates.length ? dates[i] : null,
    messages: threads[i] ?? [],
    messageCount: threads[i]?.length ?? 0,
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
