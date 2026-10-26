import type { Appointment, CachedAppointmentEntry, RecipientState } from "@/types";
import { computed } from "vue";
import type { AppointmentsSource } from "~/data/appointments/source";
import type { LocalDataContext, LocalDataDefinition, Mode } from "~/lib/localData";
import { cursorKind, type CursorData } from "./delta";
import { reviveResidence } from "./residence";

type Appointments = CursorData<Appointment>;

/** The answer an appointment carries: its recipient state, or what its accepted/declined stamps say. */
function answerOf({ recipientState, accepted, declined }: Appointment): RecipientState | null {
  if (recipientState) return recipientState as RecipientState;
  return accepted ? "OfferAccepted" : declined ? "OfferDeclined" : null;
}

/**
 * Fills in fields that appointments stored by older versions predate. Older versions also kept
 * offers the user hadn't accepted: those whose answer is known go, quietly.
 */
function reviveAppointment(stored: Appointment): Appointment | null {
  const answer = answerOf(stored);
  if (answer && answer !== "OfferAccepted") return null;
  return {
    ...stored,
    offerId: stored.offerId ?? stored.id?.replace(/^DEAS-O-/, "") ?? "",
    messageCount: stored.messageCount ?? 0,
    residence: stored.residence && reviveResidence(stored.residence),
  };
}

/**
 * What a fetch tells the server it already knows, so unchanged threads aren't extracted again.
 * The messages stay on the device: only when the newest was sent goes along.
 */
function knownEntries(appointments: Appointment[]): CachedAppointmentEntry[] {
  return appointments.map(({ messages, ...appointment }) => ({
    offerId: appointment.offerId,
    messageCount: appointment.messageCount ?? 0,
    newestMessageAt: messages?.at(-1)?.sentAt ?? null,
    date: appointment.date,
    appointment,
  }));
}

/**
 * A past appointment the server echoes back comes without its thread: it keeps the messages
 * stored for it. After a full sync every appointment has a thread, if only an empty one.
 */
function keepMessages(fetched: Appointment[], stored: Appointment[]): Appointment[] {
  const storedById = new Map(stored.map((appointment) => [appointment.offerId, appointment]));
  return fetched.map((appointment) => ({
    ...appointment,
    messages: appointment.messages ?? storedById.get(appointment.offerId)?.messages ?? [],
  }));
}

export function appointmentsKind(sources: Record<Mode, AppointmentsSource>) {
  const definition: LocalDataDefinition<Appointments, AppointmentsSource, ReturnType<typeof exposeAppointments>> = {
    name: "appointments",
    key: "appointments_cache",
    failedKey: "appointments.refreshFailed",
    sources,
    ...cursorKind<Appointment, "appointments", AppointmentsSource>({
      itemsKey: "appointments",
      keyOf: (appointment) => appointment.offerId,
      reviveItem: reviveAppointment,
      async fetchEverything(current, source) {
        const { appointments, ...cursor } = await source.sync(knownEntries(current?.items ?? []));
        return { items: keepMessages(appointments, current?.items ?? []), ...cursor };
      },
      fetchChanges({ latestMessageAt, latestMessageThreadIds = [], ...cursor }, current, source) {
        // Stored before the thread walk, or before threads were kept: self-heal with one full sync.
        if (!latestMessageAt || current.items.some((appointment) => !appointment.messages)) return null;
        return source
          .fetchDelta({ ...cursor, latestMessageAt, latestMessageThreadIds }, knownEntries(current.items))
          .then((delta) => ({ ...delta, items: keepMessages(delta.items, current.items) }));
      },
    }),
    expose: exposeAppointments,
  };
  return definition;
}

/**
 * Accepting an offer in SeBolig makes it an appointment: check for it at once, rather than at the
 * next visit. Its arriving is no change (see `appointmentChanges`).
 */
export function checkAppointmentsOnAccept({
  appointments,
  offers,
}: {
  appointments: { checkNow(): Promise<void> };
  offers: { onAnswered(listener: (offerId: string, state: RecipientState) => void): void };
}) {
  offers.onAnswered((_offerId, state) => {
    if (state === "OfferAccepted") void appointments.checkNow();
  });
}

function exposeAppointments(ctx: LocalDataContext<Appointments, AppointmentsSource>) {
  return {
    appointments: computed(() => ctx.data.value?.items ?? []),
    updatedAt: computed(() => ctx.data.value?.updatedAt ?? null),
  };
}
