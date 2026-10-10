import type { Appointment, AppointmentDelta, AppointmentDeltaRequest, SyncAppointmentsRequest } from "@/types";
import type { FullFetchCursor } from "~/data/cursor";
import { api } from "~/data/http";
import type { AppointmentsSource } from "./source";

const TIMEOUT_APPOINTMENTS = 90_000;
const TIMEOUT_DELTA = 30_000;

export const httpAppointments: AppointmentsSource = {
  sync(known) {
    const body: SyncAppointmentsRequest = { cached: known };
    return api<{ appointments: Appointment[] } & FullFetchCursor>("/api/appointments/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: TIMEOUT_APPOINTMENTS,
      failureMessage: "Failed to sync appointments",
    });
  },

  fetchDelta(cursor, known) {
    const body: AppointmentDeltaRequest = { since: cursor.latestUpdated, sinceIds: cursor.latestUpdatedIds, cached: known };
    return api<AppointmentDelta>("/api/appointments/delta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: TIMEOUT_DELTA,
      failureMessage: "Failed to fetch appointment delta",
    });
  },
};
