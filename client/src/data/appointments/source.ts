import type { Appointment, AppointmentDelta, CachedAppointmentEntry } from "@/types";
import type { Cursor, FullFetchCursor } from "~/data/cursor";

/** Where appointments come from: findbolig.nu through our backend, or the Demo. */
export interface AppointmentsSource {
  /**
   * Every upcoming appointment. `known` is what is stored on the device: appointments whose
   * thread has not changed come back from it instead of being extracted again.
   */
  sync(known: CachedAppointmentEntry[]): Promise<{ appointments: Appointment[] } & FullFetchCursor>;
  /** Appointments changed since a cursor this same source handed out earlier. `known` is reused as for `sync`. */
  fetchDelta(cursor: Cursor, known: CachedAppointmentEntry[]): Promise<AppointmentDelta>;
}
