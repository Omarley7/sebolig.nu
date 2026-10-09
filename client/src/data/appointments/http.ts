import type { Appointment, AppointmentDelta, SyncAppointmentsRequest } from "@/types";
import { api, deltaQuery } from "~/data/http";
import type { AppointmentsSource } from "./source";

const TIMEOUT_APPOINTMENTS = 90_000;
const TIMEOUT_DELTA = 30_000;

export const httpAppointments: AppointmentsSource = {
  sync(known) {
    const body: SyncAppointmentsRequest = { cached: known, includeAll: false };
    return api<{ appointments: Appointment[]; latestUpdated: string | null }>("/api/appointments/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: TIMEOUT_APPOINTMENTS,
      failureMessage: "Failed to sync appointments",
    });
  },

  fetchDelta: (cursor) =>
    api<AppointmentDelta>(`/api/appointments/delta?${deltaQuery(cursor)}`, {
      timeoutMs: TIMEOUT_DELTA,
      failureMessage: "Failed to fetch appointment delta",
    }),
};
