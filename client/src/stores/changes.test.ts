import type { Appointment, AppointmentDelta, Offer } from "@/types";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { demoAppointments } from "~/data/appointments/demo";
import type { AppointmentsSource } from "~/data/appointments/source";
import type { OffersSource } from "~/data/offers/source";
import type { ChangeDetail, FoundChange } from "~/lib/changes";
import { appointmentsKind, checkAppointmentsOnAccept } from "~/localData/appointments";
import { changesStore, trackChanges } from "~/localData/changes";
import { offersKind } from "~/localData/offers";
import { localDataHarness, type HarnessOptions } from "~/test/localDataHarness";

const DAY = 24 * 60 * 60 * 1000;
const CARD = { addressLine1: "Vej 1", addressLine2: null, imageUrl: "img" };

function found(itemId: string, detail: ChangeDetail, kind: FoundChange["kind"] = "appointment"): FoundChange {
  return { kind, itemId, offerId: itemId, card: CARD, detail };
}

const position = (from: number, to: number): ChangeDetail => ({ field: "position", from, to });

function setup(options: HarnessOptions = {}) {
  const harness = localDataHarness(options);
  const useChanges = changesStore(harness.localData.keep("changes"));
  return { ...harness, useChanges, changes: useChanges() };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

it("recorded changes show newest first, count as unseen, and mark their cards", () => {
  const { changes } = setup();

  changes.record([found("a", position(5, 4))]);
  vi.advanceTimersByTime(1000);
  changes.record([found("b", { field: "added" }, "offer")]);

  expect(changes.changes.map((c) => [c.kind, c.itemId, c.detail.field])).toEqual([
    ["offer", "b", "added"],
    ["appointment", "a", "position"],
  ]);
  expect(changes.unseenCount).toBe(2);
  expect([changes.hasUnseen("appointment", "a"), changes.hasUnseen("offer", "a")]).toEqual([true, false]);
});

it("while unseen, a card's repeated change of one field is one entry from the first value to the latest", () => {
  const { changes } = setup();

  changes.record([found("a", position(5, 4))]);
  changes.record([found("a", position(4, 3))]);

  expect(changes.changes.map((c) => c.detail)).toEqual([position(5, 3)]);
});

it("a value changing back to where it was takes its unseen change away", () => {
  const { changes } = setup();

  changes.record([found("a", { field: "cancelled", from: false, to: true })]);
  changes.record([found("a", { field: "cancelled", from: true, to: false })]);

  expect(changes.changes).toEqual([]);
});

it("new messages add up while unseen, naming the latest", () => {
  const { changes } = setup();
  const gist = (excerpt: string) => ({ from: "landlord" as const, senderName: null, excerpt, hasAttachments: false });

  changes.record([found("a", { field: "message", count: 1, latest: gist("first") })]);
  changes.record([found("a", { field: "message", count: 2, latest: gist("third") })]);

  expect(changes.changes.map((c) => c.detail)).toEqual([{ field: "message", count: 3, latest: gist("third") }]);
});

it("other changes to a card that is still new fold into its being new", () => {
  const { changes } = setup();

  changes.record([found("a", { field: "added" })]);
  changes.record([found("a", position(5, 4))]);

  expect(changes.changes.map((c) => c.detail)).toEqual([{ field: "added" }]);
});

it("opening a card marks its changes seen; a later change starts a new entry", () => {
  const { changes } = setup();
  changes.record([found("a", position(5, 4)), found("b", position(2, 1))]);

  changes.markSeen("appointment", "a");
  vi.advanceTimersByTime(1000);
  changes.record([found("a", position(4, 3))]);

  expect(changes.unseenCount).toBe(2);
  expect(changes.changes.map((c) => [c.itemId, c.detail, c.seenAt !== null])).toEqual([
    ["a", position(4, 3), false],
    ["a", position(5, 4), true],
    ["b", position(2, 1), false],
  ]);
});

it("marking all seen clears the count; seen changes stay for 7 days", () => {
  const { changes } = setup();
  changes.record([found("a", position(5, 4)), found("b", position(2, 1))]);

  changes.markAllSeen();
  vi.advanceTimersByTime(7 * DAY - 1000);
  changes.record([]);
  expect([changes.unseenCount, changes.changes.length]).toEqual([0, 2]);

  vi.advanceTimersByTime(2000);
  changes.record([]);
  expect(changes.changes).toEqual([]);
});

it("unseen changes are kept for 30 days, and at most the latest 50", () => {
  const { changes } = setup();
  changes.record([found("old", position(5, 4))]);
  vi.advanceTimersByTime(30 * DAY + 1000);

  changes.record(Array.from({ length: 55 }, (_, i) => found(`n${i}`, position(5, 4))));

  expect(changes.changes).toHaveLength(50);
  expect(changes.changes.some((c) => c.itemId === "old")).toBe(false);
});

it("a row about a card still in its list opens it on its page, from any of the card's changes", () => {
  const { changes } = setup();
  changes.record([found("a", position(5, 4)), found("o", { field: "added" }, "offer")]);

  expect(changes.changes.map((c) => changes.rowTarget(c))).toEqual([
    { page: "appointments", itemId: "a" },
    { page: "offers", itemId: "o" },
  ]);
});

it("every row about a card that left opens the copy kept from when it left, saying why it left", () => {
  const { changes } = setup();
  const last = { id: "DEAS-O-a", offerId: "a" } as Appointment;
  changes.record([found("a", position(5, 4))]);
  vi.advanceTimersByTime(1000);
  changes.record([found("a", { field: "removed", state: "Released", last })]);

  expect(changes.changes.map((c) => changes.rowTarget(c))).toEqual([
    { copy: last, kind: "appointment", state: "Released" },
    { copy: last, kind: "appointment", state: "Released" },
  ]);
});

it("an offer that moved to appointments opens its appointment, and a card that left without a copy opens nothing", () => {
  const { changes } = setup();
  changes.record([
    { ...found("o", { field: "removed", state: "Finished" }, "offer"), offerId: "o-1" },
    found("old", { field: "removed", state: "Awarded" }),
  ]);

  expect(changes.changes.map((c) => changes.rowTarget(c))).toEqual([
    { page: "appointments", itemId: "DEAS-O-o-1" },
    null,
  ]);
});

it("an offer that left unaccepted opens the copy kept of it, not an appointment", () => {
  const { changes } = setup();
  const last = { id: "o", recipientState: "OfferDeclined" } as Offer;
  changes.record([{ ...found("o", { field: "removed", state: "Finished", last }, "offer"), offerId: "o-1" }]);

  expect(changes.rowTarget(changes.changes[0])).toEqual({ copy: last, kind: "offer", state: "Finished" });
});

it("changes survive a reload and are erased with the rest of Local data", () => {
  const first = setup();
  first.changes.record([found("a", position(5, 4))]);
  const stored = first.readStored("changes");

  setActivePinia(createPinia());
  const reloaded = setup({ stored: { changes: stored } });
  expect(reloaded.changes.unseenCount).toBe(1);

  reloaded.localData.eraseAll();
  expect([reloaded.changes.unseenCount, reloaded.readStored("changes")]).toEqual([0, null]);
});

it("an invitation stored before only accepting brought appointments is dropped on load; a new offer is kept", () => {
  const first = setup();
  first.changes.record([found("a", { field: "added" }), found("o", { field: "added" }, "offer")]);
  const stored = first.readStored("changes");

  setActivePinia(createPinia());
  const reloaded = setup({ stored: { changes: stored } });

  expect(reloaded.changes.changes.map((c) => [c.kind, c.itemId])).toEqual([["offer", "o"]]);
});

function appointment(offerId: string, overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: `DEAS-O-${offerId}`,
    offerId,
    date: "2026-10-25",
    start: "16:00",
    end: null,
    cancelled: false,
    residence: { addressLine1: "Vej", addressLine2: null, location: null },
    financials: { monthlyRentIncludingAconto: 8000, deposit: 24000 },
    imageUrl: "img",
    position: 5,
    recipientState: "OfferAccepted",
    accepted: "2026-10-01T00:00:00Z",
    declined: null,
    messageCount: 0,
    messages: [],
    ...overrides,
  } as Appointment;
}

const NO_CHANGES: AppointmentDelta = { items: [], removedIds: [], latestUpdated: null, latestUpdatedIds: [], latestMessageAt: null, latestMessageThreadIds: [] };
const STORED_CURSOR = { latestUpdated: "2026-10-01T00:00:00Z", latestUpdatedIds: [], latestMessageAt: "2026-10-01T00:00:00Z", latestMessageThreadIds: [] };

function tracked(appointments: Partial<AppointmentsSource>, offers: Partial<OffersSource> = {}, options: HarnessOptions = {}) {
  const harness = setup(options);
  const appointmentsSource: AppointmentsSource = {
    sync: async () => ({ appointments: [appointment("1")], ...STORED_CURSOR }),
    fetchDelta: async () => NO_CHANGES,
    ...appointments,
  };
  const offersSource: OffersSource = {
    fetchActive: async () => ({ offers: [], latestUpdated: null, latestUpdatedIds: [] }),
    fetchDelta: async () => ({ items: [], removedIds: [], latestUpdated: null, latestUpdatedIds: [] }),
    respond: async (_id, answer) => (answer === "accept" ? "OfferAccepted" : "OfferDeclined"),
    ...offers,
  };
  const appointmentsStore = harness.localData.define(appointmentsKind({ live: appointmentsSource, demo: appointmentsSource }))();
  const offersStore = harness.localData.define(offersKind({ live: offersSource, demo: offersSource }))();
  trackChanges({ appointments: appointmentsStore, offers: offersStore, changes: harness.changes });
  checkAppointmentsOnAccept({ appointments: appointmentsStore, offers: offersStore });
  return { ...harness, appointmentsStore, offersStore };
}

it("a check's changes are recorded, but the first fetch after connecting finds none", async () => {
  const fresh = tracked({});
  await fresh.appointmentsStore.init();
  expect(fresh.changes.changes).toEqual([]);

  setActivePinia(createPinia());
  const { appointmentsStore, changes } = tracked(
    { fetchDelta: async () => ({ ...NO_CHANGES, removedIds: ["1"], removedStates: { "1": "Awarded" } }) },
    {},
    { stored: { appointments_cache: { updatedAt: "2026-10-01T00:00:00Z", appointments: [appointment("1")], ...STORED_CURSOR } } },
  );
  await appointmentsStore.init();

  expect(changes.changes.map((c) => [c.itemId, c.detail])).toEqual([
    ["DEAS-O-1", { field: "removed", state: "Awarded", last: expect.objectContaining({ offerId: "1" }) }],
  ]);
});

it("an answer the user gave in SeBolig is not reported as given on findbolig.nu when a later check brings it", () => {
  const { changes } = setup();
  changes.answeredHere("o", "OfferAccepted");

  changes.record([found("o", { field: "answer", from: "OfferReceived", to: "OfferAccepted" }, "offer")]);

  expect(changes.changes).toEqual([]);
});

it("accepting an offer in SeBolig checks appointments at once, cooldown or not, and its appointment arriving is no change", async () => {
  const offer = {
    id: "2",
    recipientState: "OfferReceived",
    residence: { addressLine1: null, addressLine2: null, location: null },
    financials: { monthlyRentIncludingAconto: 8000, deposit: 24000 },
  };
  let accepted = false;
  const { appointmentsStore, offersStore, changes } = tracked(
    { fetchDelta: async () => ({ ...NO_CHANGES, items: accepted ? [appointment("2")] : [] }) },
    { respond: async () => ((accepted = true), "OfferAccepted") },
    {
      stored: {
        appointments_cache: { updatedAt: "2026-10-01T00:00:00Z", appointments: [appointment("1")], ...STORED_CURSOR },
        offers_cache: { updatedAt: "2026-10-01T00:00:00Z", offers: [offer], latestUpdated: "2026-10-01T00:00:00Z", latestUpdatedIds: [] },
      },
    },
  );
  await Promise.all([offersStore.init(), appointmentsStore.init()]);

  await offersStore.acceptOffer("2");

  await vi.waitFor(() => expect(appointmentsStore.appointments.map((a) => a.offerId)).toEqual(["1", "2"]));
  expect(changes.changes).toEqual([]);
});

it("declining an offer in SeBolig doesn't check appointments", async () => {
  let deltas = 0;
  const { appointmentsStore, offersStore } = tracked(
    { fetchDelta: async () => (deltas++, NO_CHANGES) },
    {},
    {
      stored: {
        appointments_cache: { updatedAt: "2026-10-01T00:00:00Z", appointments: [appointment("1")], ...STORED_CURSOR },
        offers_cache: { updatedAt: "2026-10-01T00:00:00Z", offers: [{ id: "2", recipientState: "OfferReceived" }], latestUpdated: "2026-10-01T00:00:00Z", latestUpdatedIds: [] },
      },
    },
  );
  await appointmentsStore.init();

  await offersStore.declineOffer("2");
  await appointmentsStore.init();

  expect(deltas).toBe(1);
});

it("in the Demo, the first check brings a viewing date, a landlord message and an awarded viewing; later checks nothing", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout"] });
  vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
  const { appointmentsStore, changes } = tracked(demoAppointments());
  const connecting = appointmentsStore.init();
  await vi.runAllTimersAsync();
  await connecting;
  expect(changes.changes).toEqual([]);

  vi.advanceTimersByTime(61_000);
  await appointmentsStore.init();
  vi.advanceTimersByTime(61_000);
  await appointmentsStore.init();

  expect(changes.changes.map((c) => c.detail).sort((a, b) => a.field.localeCompare(b.field))).toEqual([
    expect.objectContaining({ field: "message", count: 1, latest: expect.objectContaining({ from: "landlord" }) }),
    expect.objectContaining({ field: "removed", state: "Awarded" }),
    expect.objectContaining({ field: "viewing", from: { date: null, start: null, end: null } }),
  ]);
});
