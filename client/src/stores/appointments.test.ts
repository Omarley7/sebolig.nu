import type { Appointment, AppointmentDelta, CachedAppointmentEntry } from "@/types";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, expect, it, vi } from "vitest";
import { demoAppointments } from "~/data/appointments/demo";
import type { AppointmentsSource } from "~/data/appointments/source";
import type { Cursor } from "~/data/cursor";
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
    messages: [],
    ...overrides,
  } as Appointment;
}

/** Today's stored format for appointments_cache, written by the store before the Local data module. */
function storedAppointments(
  appointments: object[],
  cursor: { latestUpdated?: string | null; latestUpdatedIds?: string[]; latestMessageAt?: string | null; latestMessageThreadIds?: string[] } = {},
) {
  return { updatedAt: "2026-10-01T08:00:00.000Z", appointments, ...cursor };
}

/** A stored thread cursor, as a sync since the thread walk hands out. */
const THREAD_CURSOR = { latestMessageAt: "2026-10-01T09:00:00Z", latestMessageThreadIds: ["t1"] };
const NO_CHANGES: AppointmentDelta = { items: [], removedIds: [], latestUpdated: null, latestUpdatedIds: [], latestMessageAt: null, latestMessageThreadIds: [] };

function fakeSource(overrides: Partial<AppointmentsSource> = {}): AppointmentsSource {
  return {
    sync: async () => ({ appointments: [], latestUpdated: null, latestUpdatedIds: [], latestMessageAt: null, latestMessageThreadIds: [] }),
    fetchDelta: async () => NO_CHANGES,
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
    latestMessageAt: "2026-10-02T09:00:00Z",
    latestMessageThreadIds: ["t2"],
  };
  const { store, readStored } = setup(fakeSource({ fetchDelta: async () => delta }), {
    stored: {
      appointments_cache: storedAppointments([appointment("1"), appointment("2")], {
        latestUpdated: "2026-10-01T00:00:00Z",
        ...THREAD_CURSOR,
      }),
    },
  });

  await store.init();

  expect(store.appointments.map((a) => [a.offerId, a.start])).toEqual([["2", "18:00"]]);
  expect(readStored("appointments_cache")).toMatchObject({
    latestUpdated: "2026-10-02T00:00:00Z",
    latestUpdatedIds: ["2"],
    latestMessageAt: "2026-10-02T09:00:00Z",
    latestMessageThreadIds: ["t2"],
  });
});

it("the cheap check's update says why removed appointments left, without storing it", async () => {
  const delta: AppointmentDelta = { ...NO_CHANGES, removedIds: ["1"], removedStates: { "1": "Released" }, latestUpdated: "2026-10-02T00:00:00Z" };
  const { store, readStored } = setup(fakeSource({ fetchDelta: async () => delta }), {
    stored: { appointments_cache: storedAppointments([appointment("1"), appointment("2")], { latestUpdated: "2026-10-01T00:00:00Z", ...THREAD_CURSOR }) },
  });
  const removedStates: unknown[] = [];
  store.onUpdated(({ after }) => removedStates.push(after.removedStates));

  await store.init();

  expect(removedStates).toEqual([{ "1": "Released" }]);
  expect(readStored("appointments_cache")).not.toHaveProperty("removedStates");
});

it("the cheap check sends what is stored too, so a changed offer with an unchanged thread is not extracted again", async () => {
  const sent: CachedAppointmentEntry[][] = [];
  const stored = appointment("1", { messageCount: 4 });
  const { store } = setup(
    fakeSource({ fetchDelta: async (_cursor, known) => (sent.push(known), NO_CHANGES) }),
    { stored: { appointments_cache: storedAppointments([stored], { latestUpdated: "2026-10-01T00:00:00Z", ...THREAD_CURSOR }) } },
  );

  await store.init();

  const { messages: _, ...withoutMessages } = stored;
  expect(sent).toEqual([[{ offerId: "1", messageCount: 4, newestMessageAt: null, date: "2026-10-10", appointment: withoutMessages }]]);
});

it("a full refresh stores both cursors it hands out", async () => {
  const { store, readStored } = setup(
    fakeSource({ sync: async () => ({ appointments: [appointment("1")], latestUpdated: "2026-10-02T00:00:00Z", latestUpdatedIds: ["1"], ...THREAD_CURSOR }) }),
  );

  await store.init();

  expect(readStored("appointments_cache")).toMatchObject({ latestUpdated: "2026-10-02T00:00:00Z", latestUpdatedIds: ["1"], ...THREAD_CURSOR });
});

it("the cheap check sends the stored thread cursor next to the listing cursor", async () => {
  const sent: Cursor[] = [];
  const { store } = setup(fakeSource({ fetchDelta: async (cursor) => (sent.push(cursor), NO_CHANGES) }), {
    stored: { appointments_cache: storedAppointments([appointment("1")], { latestUpdated: "2026-10-01T00:00:00Z", latestUpdatedIds: ["1"], ...THREAD_CURSOR }) },
  });

  await store.init();

  expect(sent).toEqual([{ latestUpdated: "2026-10-01T00:00:00Z", latestUpdatedIds: ["1"], ...THREAD_CURSOR }]);
});

it("a cheap check that withholds the cursors keeps both stored ones", async () => {
  const { store, readStored } = setup(fakeSource({ fetchDelta: async () => ({ ...NO_CHANGES, items: [appointment("2")] }) }), {
    stored: { appointments_cache: storedAppointments([appointment("1")], { latestUpdated: "2026-10-01T00:00:00Z", latestUpdatedIds: ["1"], ...THREAD_CURSOR }) },
  });

  await store.init();

  expect(readStored("appointments_cache")).toMatchObject({ latestUpdated: "2026-10-01T00:00:00Z", latestUpdatedIds: ["1"], ...THREAD_CURSOR });
});

it("appointments stored without a thread cursor take one full sync instead of the cheap check", async () => {
  let deltas = 0;
  const { store, readStored } = setup(
    fakeSource({
      fetchDelta: async () => (deltas++, NO_CHANGES),
      sync: async () => ({ appointments: [appointment("2")], latestUpdated: "2026-10-02T00:00:00Z", latestUpdatedIds: ["2"], ...THREAD_CURSOR }),
    }),
    { stored: { appointments_cache: storedAppointments([appointment("1")], { latestUpdated: "2026-10-01T00:00:00Z" }) } },
  );

  await store.init();

  expect(deltas).toBe(0);
  expect(store.appointments.map((a) => a.offerId)).toEqual(["2"]);
  expect(readStored("appointments_cache")).toMatchObject({ latestUpdated: "2026-10-02T00:00:00Z", ...THREAD_CURSOR });
});

it("a full refresh sends what is stored, so unchanged appointments are not extracted again", async () => {
  const sent: CachedAppointmentEntry[][] = [];
  const stored = appointment("1", { messageCount: 4 });
  const { store } = setup(
    fakeSource({ sync: async (known) => (sent.push(known), { appointments: [stored], latestUpdated: "2026-10-02T00:00:00Z", latestUpdatedIds: [], ...THREAD_CURSOR }) }),
    { stored: { appointments_cache: storedAppointments([stored], { latestUpdated: "2026-10-01T00:00:00Z", ...THREAD_CURSOR }) } },
  );
  await store.init();

  await store.refresh();

  const { messages: _, ...withoutMessages } = stored;
  expect(sent).toEqual([[{ offerId: "1", messageCount: 4, newestMessageAt: null, date: "2026-10-10", appointment: withoutMessages }]]);
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

it("appointments stored with the misspelled address fields still show their address", async () => {
  const location = { latitude: 55.7, longitude: 12.5 };
  const { store } = setup(fakeSource(), {
    connected: false,
    stored: {
      appointments_cache: storedAppointments([
        { ...appointment("77"), residence: { adressLine1: "Ålekistevej 59", adressLine2: "2720 Vanløse", location } },
      ]),
    },
  });

  await store.init();

  expect(store.appointments[0].residence).toEqual({ addressLine1: "Ålekistevej 59", addressLine2: "2720 Vanløse", location });
});

it("stored appointments the user hasn't accepted are dropped on load, and those with no answer known are kept", async () => {
  const { store } = setup(fakeSource(), {
    connected: false,
    stored: {
      appointments_cache: storedAppointments([
        appointment("accepted", { recipientState: "OfferAccepted" }),
        appointment("pending", { recipientState: "OfferReceived" }),
        appointment("declined", { recipientState: "OfferDeclined", declined: "2026-10-01T08:00:00Z" }),
        // Stored before recipientState was kept: the stamps tell.
        appointment("stampedAccepted", { accepted: "2026-10-01T08:00:00Z" }),
        appointment("stampedDeclined", { declined: "2026-10-01T08:00:00Z" }),
        appointment("unknown"),
      ]),
    },
  });

  await store.init();

  expect(store.appointments.map((a) => a.offerId)).toEqual(["accepted", "stampedAccepted", "unknown"]);
});

it("the Demo's appointments are all offers the user accepted", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  const syncing = demoAppointments().sync([]);
  await vi.runAllTimersAsync();
  const { appointments } = await syncing;
  vi.useRealTimers();

  expect(appointments.map((a) => a.recipientState)).toEqual(appointments.map(() => "OfferAccepted"));
});

const message = (sentAt: string, body = "Kære ansøger") => ({ from: "landlord" as const, senderName: null, sentAt, body, hasAttachments: false });

it("what is sent leaves the messages out, saying only when the newest one was sent", async () => {
  const sent: CachedAppointmentEntry[][] = [];
  const messages = [message("2026-10-01T09:00:00Z"), message("2026-10-03T09:00:00Z")];
  const stored = appointment("1", { messageCount: 2, messages });
  const { store } = setup(
    fakeSource({ fetchDelta: async (_cursor, known) => (sent.push(known), NO_CHANGES) }),
    { stored: { appointments_cache: storedAppointments([stored], { latestUpdated: "2026-10-01T00:00:00Z", ...THREAD_CURSOR }) } },
  );

  await store.init();

  const { messages: _, ...withoutMessages } = stored;
  expect(sent).toEqual([[{ offerId: "1", messageCount: 2, newestMessageAt: "2026-10-03T09:00:00Z", date: "2026-10-10", appointment: withoutMessages }]]);
});

it("an appointment the server echoes back without its thread keeps the messages stored, in a check and a refresh", async () => {
  const messages = [message("2026-10-01T09:00:00Z")];
  const { messages: _, ...echoed } = appointment("1", { start: "18:00" });
  const { store } = setup(
    fakeSource({
      fetchDelta: async () => ({ ...NO_CHANGES, items: [echoed] }),
      sync: async () => ({ appointments: [echoed], latestUpdated: "2026-10-02T00:00:00Z", latestUpdatedIds: [], ...THREAD_CURSOR }),
    }),
    { stored: { appointments_cache: storedAppointments([appointment("1", { messages })], { latestUpdated: "2026-10-01T00:00:00Z", ...THREAD_CURSOR }) } },
  );

  await store.init();
  expect(store.appointments.map((a) => [a.start, a.messages])).toEqual([["18:00", messages]]);

  await store.refresh();
  expect(store.appointments.map((a) => a.messages)).toEqual([messages]);
});

it("a thread the server sends replaces the messages stored", async () => {
  const newer = [message("2026-10-01T09:00:00Z"), message("2026-10-05T09:00:00Z", "Sådan søger du")];
  const { store } = setup(fakeSource({ fetchDelta: async () => ({ ...NO_CHANGES, items: [appointment("1", { messages: newer })] }) }), {
    stored: { appointments_cache: storedAppointments([appointment("1", { messages: newer.slice(0, 1) })], { latestUpdated: "2026-10-01T00:00:00Z", ...THREAD_CURSOR }) },
  });

  await store.init();

  expect(store.appointments[0].messages).toEqual(newer);
});

it("appointments stored before threads were kept take one full sync instead of the cheap check", async () => {
  let deltas = 0;
  const { messages: _, ...storedBefore } = appointment("1");
  const { store } = setup(
    fakeSource({
      fetchDelta: async () => (deltas++, NO_CHANGES),
      sync: async () => ({ appointments: [appointment("1", { messages: [message("2026-10-01T09:00:00Z")] })], latestUpdated: "2026-10-02T00:00:00Z", latestUpdatedIds: [], ...THREAD_CURSOR }),
    }),
    { stored: { appointments_cache: storedAppointments([storedBefore], { latestUpdated: "2026-10-01T00:00:00Z", ...THREAD_CURSOR }) } },
  );

  await store.init();

  expect(deltas).toBe(0);
  expect(store.appointments[0].messages).toHaveLength(1);
});
