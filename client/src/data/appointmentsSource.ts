import type { Appointment, CachedAppointmentEntry, SyncAppointmentsRequest, UserData } from "@/types";
import mockAppointmentsJson from "~/data/MOCK_APPOINTMENTS.json";

import config from "~/config";
import { dateInDays } from "~/lib/dateHelper";

const TIMEOUT_LOGIN = 25_000;
const TIMEOUT_APPOINTMENTS = 90_000;

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
  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
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

export async function fetchAppointments(includeAll: boolean = false): Promise<{
  updatedAt: Date;
  appointments: Appointment[];
}> {
  if (config.useMockData) {
    console.log("Using mock server data");
    await new Promise((resolve) => setTimeout(resolve, 800));
    return {
      updatedAt: new Date(),
      appointments: applyMockAppointmentDates(mockAppointmentsJson as Appointment[]),
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
      throw new HttpError(`Failed to fetch appointments: ${result.status}`, result.status);
    }
    const data = await result.json();
    return { updatedAt: new Date(), appointments: data as Appointment[] };
  } catch (error) {
    console.error("Failed to fetch appointments:", error);
    throw error;
  }
}

export async function syncAppointments(
  cached: CachedAppointmentEntry[],
  includeAll: boolean = false,
): Promise<{
  updatedAt: Date;
  appointments: Appointment[];
}> {
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
    throw new HttpError(`Failed to sync appointments: ${result.status}`, result.status);
  }
  const data = await result.json();
  return { updatedAt: new Date(), appointments: data as Appointment[] };
}

export async function login(email: string, password: string): Promise<UserData | null> {
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
      throw new HttpError(`Failed to login: ${result.status}`, result.status);
    }
    return await result.json();
  } catch (error) {
    console.error("Failed to login:", error);
    throw error;
  }
}
