import type {
  Appointment,
  AppointmentDelta,
  CachedAppointmentEntry,
  ConnectionEndedReason,
  SyncAppointmentsRequest,
  UserData,
} from "@/types";
import mockAppointmentsJson from "~/data/MOCK_APPOINTMENTS.json";

import config from "~/config";
import { dateInDays } from "~/lib/dateHelper";

const TIMEOUT_LOGIN = 25_000;
const TIMEOUT_APPOINTMENTS = 90_000;
const TIMEOUT_DELTA = 30_000;

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export class HttpError extends Error {
  readonly status: number;
  /** Why the server ended the Connection, when a 401 body says so. */
  readonly reason?: ConnectionEndedReason;
  constructor(message: string, status: number, reason?: ConnectionEndedReason) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.reason = reason;
  }

  /** Builds the error from a failed response, keeping the reason a 401 body carries. */
  static async fromResponse(res: Response, what: string): Promise<HttpError> {
    const reason = res.status === 401 ? await readEndedReason(res) : undefined;
    return new HttpError(`${what}: ${res.status}`, res.status, reason);
  }
}

/** The reason a 401 body carries, if it is one the client knows how to react to. */
export async function readEndedReason(res: Response): Promise<ConnectionEndedReason | undefined> {
  const body = await res.json().catch(() => null);
  const reason = body?.reason;
  return reason === "credentials_rejected" || reason === "findbolig_session_lost" ? reason : undefined;
}

export function isTimeoutError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof HttpError && error.status === 504) return true;
  return false;
}

export function handleApiError(
  error: unknown,
  toast: { warning: (msg: string, dur?: number) => void; error: (msg: string, dur?: number) => void },
  t: (key: string) => string,
  fallback: string = "An unexpected error occurred",
  timeoutKey: string = "errors.timeout",
) {
  if (isTimeoutError(error)) {
    toast.warning(t(timeoutKey), 8000);
  } else {
    toast.error(error instanceof Error ? error.message : fallback);
  }
}

const MOCK_DATES: (string | null)[] = [dateInDays(-7), dateInDays(0), dateInDays(0), dateInDays(7)];

export function applyMockAppointmentDates(appointments: Appointment[]): Appointment[] {
  return appointments.map((appt, i) => ({
    ...appt,
    date: i < MOCK_DATES.length ? MOCK_DATES[i] : null,
  }));
}

type AppointmentsPayload = {
  updatedAt: Date;
  appointments: Appointment[];
  latestUpdated: string | null;
};

export async function fetchAppointments(includeAll: boolean = false): Promise<AppointmentsPayload> {
  if (config.useMockData) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    return {
      updatedAt: new Date(),
      appointments: applyMockAppointmentDates(mockAppointmentsJson as Appointment[]),
      latestUpdated: new Date().toISOString(),
    };
  }

  try {
    const queryParam = includeAll ? "?includeAll=true" : "";
    const result = await fetchWithTimeout(
      `${config.backendDomain}/api/appointments/upcoming${queryParam}`,
      {
        method: "GET",
        credentials: "include",
      },
      TIMEOUT_APPOINTMENTS,
    );
    if (!result.ok) {
      throw await HttpError.fromResponse(result, "Failed to fetch appointments");
    }
    const data = (await result.json()) as { appointments: Appointment[]; latestUpdated: string | null };
    return { updatedAt: new Date(), appointments: data.appointments, latestUpdated: data.latestUpdated };
  } catch (error) {
    console.error("Failed to fetch appointments:", error);
    throw error;
  }
}

export async function syncAppointments(
  cached: CachedAppointmentEntry[],
  includeAll: boolean = false,
): Promise<AppointmentsPayload> {
  const body: SyncAppointmentsRequest = { cached, includeAll };
  const result = await fetchWithTimeout(
    `${config.backendDomain}/api/appointments/sync`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    },
    TIMEOUT_APPOINTMENTS,
  );
  if (!result.ok) {
    throw await HttpError.fromResponse(result, "Failed to sync appointments");
  }
  const data = (await result.json()) as { appointments: Appointment[]; latestUpdated: string | null };
  return { updatedAt: new Date(), appointments: data.appointments, latestUpdated: data.latestUpdated };
}

/**
 * Lightweight check for appointments changed since `since` (a `latestUpdated` cursor
 * previously returned by this same API — never a client-generated timestamp).
 * `sinceIds` is the matching `latestUpdatedIds` from that same previous response — it lets
 * the server tell apart appointments already reported at exactly `since` from ones that land
 * on that same timestamp afterwards, so equal-timestamp updates are never skipped or reprocessed.
 */
export async function fetchAppointmentDelta(
  since: string,
  includeAll: boolean = false,
  sinceIds: string[] = [],
): Promise<AppointmentDelta> {
  const queryParam = includeAll ? "&includeAll=true" : "";
  const sinceIdsParam = sinceIds.length > 0 ? `&sinceIds=${encodeURIComponent(sinceIds.join(","))}` : "";
  const res = await fetchWithTimeout(
    `${config.backendDomain}/api/appointments/delta?since=${encodeURIComponent(since)}${queryParam}${sinceIdsParam}`,
    { method: "GET", credentials: "include" },
    TIMEOUT_DELTA,
  );

  if (!res.ok) {
    throw await HttpError.fromResponse(res, "Failed to fetch appointment delta");
  }

  return (await res.json()) as AppointmentDelta;
}

export async function connect(email: string, password: string): Promise<UserData | null> {
  try {
    const result = await fetchWithTimeout(
      `${config.backendDomain}/api/auth/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      },
      TIMEOUT_LOGIN,
    );
    if (!result.ok) {
      throw await HttpError.fromResponse(result, "Failed to connect");
    }
    return await result.json();
  } catch (error) {
    console.error("Failed to connect:", error);
    throw error;
  }
}
