import type { Appointment, AppointmentDelta, CachedAppointmentEntry } from "@/types";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, expect, it } from "vitest";
import type { AppointmentsSource } from "~/data/appointments/source";
import { appointmentsKind } from "~/localData/appointments";
import { localDataHarness, type HarnessOptions } from "~/test/localDataHarness";

function appointment(offerId: string, overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: `DEAS-O-${offerId}`,
    offerId,
    title: `Showing ${offerId}`,
    date: "2026-10-10",
    start: "16:00",
    end: "17:00",
    messageCount: 1,
    ...overrides,
  } as Appointment;
}

/** Today's stored format for appointments_cache, written by the store before the Local data module. */
function storedAppointments(
  appointments: object[],
  cursor: { latestUpdated?: string | null; latestUpdatedIds?: string[] } = {},
) {
  return { updatedAt: "2026-10-01T08:00:00.000Z", appointments, ...cursor };
}

function fakeSource(overrides: Partial<AppointmentsSource> = {}): AppointmentsSource {
  return {
    sync: async () => ({ appointments: [], latestUpdated: null, latestUpdatedIds: [] }),
    fetchDelta: async () => ({ items: [], removedIds: [], latestUpdated: null, latestUpdatedIds: [] }),
    ...overrides,
  };
}

function setup(source: AppointmentsSource, options: HarnessOptions = {}) {
  const harness = localDataHarness(options);
  const useAppointments = harness.localData.define(appointmentsKind({ live: source, demo: source }));
  return { ...harness, store: useAppointments() };
}

beforeEach(() => {
  setActivePinia(createPinia());
});

it("the cheap check merges changed appointments by offer id, drops removed ones and moves the cursor", async () => {
  const delta: AppointmentDelta = {
    items: [appointment("2", { start: "18:00" })],
    removedIds: ["1"],
    latestUpdated: "2026-10-02T00:00:00Z",
    latestUpdatedIds: ["2"],
  };
  const { store, readStored } = setup(fakeSource({ fetchDelta: async () => delta }), {
    stored: {
      appointments_cache: storedAppointments([appointment("1"), appointment("2")], {
        latestUpdated: "2026-10-01T00:00:00Z",
      }),
    },
  });

  await store.init();

  expect(store.appointments.map((a) => [a.offerId, a.start])).toEqual([["2", "18:00"]]);
  expect(readStored("appointments_cache")).toMatchObject({ latestUpdated: "2026-10-02T00:00:00Z", latestUpdatedIds: ["2"] });
});

it("the cheap check sends what is stored too, so a changed offer with an unchanged thread is not extracted again", async () => {
  const sent: CachedAppointmentEntry[][] = [];
  const stored = appointment("1", { messageCount: 4 });
  const { store } = setup(
    fakeSource({ fetchDelta: async (_cursor, known) => (sent.push(known), { items: [], removedIds: [], latestUpdated: null, latestUpdatedIds: [] }) }),
    { stored: { appointments_cache: storedAppointments([stored], { latestUpdated: "2026-10-01T00:00:00Z" }) } },
  );

  await store.init();

  expect(sent).toEqual([[{ offerId: "1", messageCount: 4, date: "2026-10-10", appointment: stored }]]);
});

it("a full refresh stores the ids at the cursor it hands out", async () => {
  const { store, readStored } = setup(
    fakeSource({ sync: async () => ({ appointments: [appointment("1")], latestUpdated: "2026-10-02T00:00:00Z", latestUpdatedIds: ["1"] }) }),
  );

  await store.init();

  expect(readStored("appointments_cache")).toMatchObject({ latestUpdated: "2026-10-02T00:00:00Z", latestUpdatedIds: ["1"] });
});

it("a full refresh sends what is stored, so unchanged appointments are not extracted again", async () => {
  const sent: CachedAppointmentEntry[][] = [];
  const stored = appointment("1", { messageCount: 4 });
  const { store } = setup(
    fakeSource({ sync: async (known) => (sent.push(known), { appointments: [stored], latestUpdated: "2026-10-02T00:00:00Z", latestUpdatedIds: [] }) }),
    { stored: { appointments_cache: storedAppointments([stored], { latestUpdated: "2026-10-01T00:00:00Z" }) } },
  );
  await store.init();

  await store.refresh();

  expect(sent).toEqual([[{ offerId: "1", messageCount: 4, date: "2026-10-10", appointment: stored }]]);
});

it("appointments stored before offerId and messageCount existed still load", async () => {
  const { id, title, date, start, end } = appointment("77");
  const { store } = setup(fakeSource(), {
    connected: false,
    stored: { appointments_cache: storedAppointments([{ id, title, date, start, end }]) },
  });

  await store.init();

  expect(store.appointments[0]).toMatchObject({ offerId: "77", messageCount: 0 });
  expect(store.updatedAt).toEqual(new Date("2026-10-01T08:00:00.000Z"));
});
