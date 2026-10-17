import type { AppointmentDelta, CachedAppointmentEntry, SyncAppointmentsResponse } from "@/types";
import type { AppointmentsCursor } from "~/data/cursor";

/** Where appointments come from: findbolig.nu through our backend, or the Demo. */
export interface AppointmentsSource {
  /**
   * Every upcoming appointment. `known` is what is stored on the device: appointments whose
   * thread has not changed come back from it instead of being extracted again.
   */
  sync(known: CachedAppointmentEntry[]): Promise<SyncAppointmentsResponse>;
  /** Appointments changed since both cursors this same source handed out earlier. `known` is reused as for `sync`. */
  fetchDelta(cursor: AppointmentsCursor, known: CachedAppointmentEntry[]): Promise<AppointmentDelta>;
}
