import type { Appointment, CachedAppointmentEntry } from "@/types";
import { computed } from "vue";
import type { AppointmentsSource } from "~/data/appointments/source";
import type { LocalDataContext, LocalDataDefinition, Mode } from "~/lib/localData";
import { cursorKind, type CursorData } from "./delta";

type Appointments = CursorData<Appointment>;

/** Fills in fields that appointments stored by older versions predate. */
function reviveAppointment(stored: Appointment): Appointment {
  return {
    ...stored,
    offerId: stored.offerId ?? stored.id?.replace(/^DEAS-O-/, "") ?? "",
    messageCount: stored.messageCount ?? 0,
  };
}

/** What a full refresh tells the server it already knows, so unchanged threads aren't extracted again. */
function knownEntries(appointments: Appointment[]): CachedAppointmentEntry[] {
  return appointments.map((appointment) => ({
    offerId: appointment.offerId,
    messageCount: appointment.messageCount ?? 0,
    date: appointment.date,
    appointment,
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
        const { appointments, latestUpdated } = await source.sync(knownEntries(current?.items ?? []));
        return { items: appointments, latestUpdated };
      },
    }),
    expose: exposeAppointments,
  };
  return definition;
}

function exposeAppointments(ctx: LocalDataContext<Appointments, AppointmentsSource>) {
  return {
    appointments: computed(() => ctx.data.value?.items ?? []),
    updatedAt: computed(() => ctx.data.value?.updatedAt ?? null),
  };
}
