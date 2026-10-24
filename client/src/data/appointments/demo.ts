import type { Appointment, AppointmentDelta, ThreadMessage } from "@/types";
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
const sampleThreads = (): ThreadMessage[][] => [
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

/** A landlord's follow-up for the Demo's first check to bring. */
const followUpMessage = (): ThreadMessage => ({
  from: "landlord",
  senderName: "Udlejningen",
  sentAt: new Date().toISOString(),
  body: "Kære ansøger,\n\nHusk at medbringe lønsedler og legitimation til fremvisningen. Der er desværre ingen parkering ved ejendommen.\n\nMed venlig hilsen\nUdlejningen",
  hasAttachments: false,
});

/**
 * Sample appointments for the Demo, with dates kept relative to today. The first cheap check
 * brings a few changes, so the Demo shows what changed too: the appointment waiting for a date
 * gets one, the one a week out gets a message from the landlord, and the past one is awarded to
 * someone else. Later checks bring nothing, and a Refresh fetches the changed appointments.
 */
export function demoAppointments(): AppointmentsSource {
  const dates: (string | null)[] = [dateInDays(-7), dateInDays(0), dateInDays(0), dateInDays(7)];
  const threads = sampleThreads();
  let appointments = (MOCK_APPOINTMENTS as Appointment[]).map((appt, i) => ({
    ...appt,
    date: i < dates.length ? dates[i] : null,
    messages: threads[i] ?? [],
    messageCount: threads[i]?.length ?? 0,
  }));
  let scripted = false;

  return {
    async sync() {
      await demoDelay(1500);
      const cursor = demoCursor();
      // The Demo has no threads either: any instant serves as its thread cursor.
      return { appointments, ...cursor, latestMessageAt: cursor.latestUpdated, latestMessageThreadIds: [] };
    },
    async fetchDelta() {
      const delta: AppointmentDelta = { ...noChanges<Appointment>(), latestMessageAt: null, latestMessageThreadIds: [] };
      if (scripted) return delta;
      scripted = true;
      const [awarded, , , messaged, waiting] = appointments;
      const items = [
        { ...waiting, date: dateInDays(3), start: "17:00", end: "17:30" },
        { ...messaged, messages: [...messaged.messages, followUpMessage()], messageCount: messaged.messageCount + 1 },
      ];
      const byId = new Map(items.map((appointment) => [appointment.offerId, appointment]));
      appointments = appointments.filter((a) => a !== awarded).map((a) => byId.get(a.offerId) ?? a);
      return { ...delta, items, removedIds: [awarded.offerId], removedStates: { [awarded.offerId]: "Awarded" } };
    },
  };
}
