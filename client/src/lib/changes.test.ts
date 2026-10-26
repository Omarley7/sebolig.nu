import type { Appointment, Financials, Offer, ThreadMessage } from "@/types";
import { expect, it } from "vitest";
import type { CursorData } from "~/localData/delta";
import { appointmentChanges, offerChanges } from "./changes";

const CURSOR = { latestUpdated: "2026-10-01T00:00:00Z", latestUpdatedIds: [] };
const MONEY = { monthlyRentIncludingAconto: 8000, deposit: 24000 } as Financials;

function data<T>(items: T[], extra: Partial<CursorData<T>> = {}): CursorData<T> {
  return { updatedAt: new Date("2026-10-01T00:00:00Z"), items, cursor: CURSOR, ...extra };
}

const message = (from: ThreadMessage["from"], sentAt: string, body: string): ThreadMessage => ({
  from,
  senderName: from === "landlord" ? "Udlejningen" : null,
  sentAt,
  body,
  hasAttachments: false,
});

const INVITATION = message("landlord", "2026-10-01T09:00:00Z", "Der er fremvisning.");

function appointment(offerId: string, overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: `DEAS-O-${offerId}`,
    offerId,
    title: "Showing",
    rooms: 2,
    area: 60,
    date: "2026-10-10",
    start: "16:00",
    end: "16:20",
    cancelled: false,
    residence: { addressLine1: `Vej ${offerId}`, addressLine2: "2200 København N", location: null },
    financials: MONEY,
    imageUrl: `img-${offerId}`,
    images: [],
    blueprints: [],
    position: 5,
    recipientState: "OfferAccepted",
    accepted: "2026-09-30T09:00:00Z",
    declined: null,
    messageCount: 1,
    messages: [INVITATION],
    ...overrides,
  };
}

function offer(id: string, overrides: Partial<Offer> = {}): Offer {
  return {
    id,
    residence: { addressLine1: `Vej ${id}`, addressLine2: null, location: null },
    deadline: "2026-10-20",
    availableFrom: "2026-12-01",
    rooms: 2,
    area: 60,
    recipientState: "OfferReceived",
    company: "Boligselskabet",
    financials: MONEY,
    imageUrl: `img-${id}`,
    images: [],
    blueprints: [],
    position: 5,
    ...overrides,
  };
}

/** Just what each change says, without the card copy. */
const details = (changes: { itemId: string; detail: unknown }[]) => changes.map(({ itemId, detail }) => [itemId, detail]);

it("an appointment's viewing getting a date, moving, being cancelled and coming back on are each a change", () => {
  const before = data([
    appointment("unset", { date: null, start: null, end: null }),
    appointment("moved"),
    appointment("off"),
    appointment("on", { cancelled: true }),
  ]);
  const after = data([
    appointment("unset", { date: "2026-10-12", start: "15:00", end: null }),
    appointment("moved", { start: "17:00" }),
    appointment("off", { cancelled: true }),
    appointment("on"),
  ]);

  expect(details(appointmentChanges(before, after))).toEqual([
    ["DEAS-O-unset", { field: "viewing", from: { date: null, start: null, end: null }, to: { date: "2026-10-12", start: "15:00", end: null } }],
    ["DEAS-O-moved", { field: "viewing", from: { date: "2026-10-10", start: "16:00", end: "16:20" }, to: { date: "2026-10-10", start: "17:00", end: "16:20" } }],
    ["DEAS-O-off", { field: "cancelled", from: false, to: true }],
    ["DEAS-O-on", { field: "cancelled", from: true, to: false }],
  ]);
});

it("an appointment losing its date is not a change", () => {
  const before = data([appointment("1")]);
  const after = data([appointment("1", { date: null })]);

  expect(appointmentChanges(before, after)).toEqual([]);
});

it("new messages from others are one change, naming the latest; the user's own messages are not", () => {
  const before = data([appointment("1"), appointment("2")]);
  const after = data([
    appointment("1", {
      messages: [INVITATION, message("findbolig", "2026-10-02T09:00:00Z", "Påmindelse"), message("landlord", "2026-10-03T09:00:00Z", "  Fremvisningen\n er  flyttet til fredag.")],
    }),
    appointment("2", { messages: [INVITATION, message("you", "2026-10-02T09:00:00Z", "Jeg kommer")] }),
  ]);

  expect(details(appointmentChanges(before, after))).toEqual([
    [
      "DEAS-O-1",
      {
        field: "message",
        count: 2,
        latest: { from: "landlord", senderName: "Udlejningen", excerpt: "Fremvisningen er flyttet til fredag.", hasAttachments: false },
      },
    ],
  ]);
});

it("position, rent or deposit are changes; an answer is not, as it's the offer's to tell", () => {
  const before = data([appointment("1"), appointment("2")]);
  const after = data([
    appointment("1", { position: 3, financials: { ...MONEY, deposit: 25000 } }),
    appointment("2", { recipientState: "OfferDeclined", declined: "2026-10-02T09:00:00Z" }),
  ]);

  expect(details(appointmentChanges(before, after))).toEqual([
    ["DEAS-O-1", { field: "position", from: 5, to: 3 }],
    ["DEAS-O-1", { field: "financials", from: { rent: 8000, deposit: 24000 }, to: { rent: 8000, deposit: 25000 } }],
  ]);
});

it("a new appointment is not a change, as only accepting brings one; a removed one keeps its card as it was and says why it left", () => {
  const before = data([appointment("gone"), appointment("withdrawn")]);
  const after = data([appointment("new")], { removedStates: { withdrawn: "Released" } });

  const changes = appointmentChanges(before, after);

  expect(details(changes)).toEqual([
    ["DEAS-O-gone", { field: "removed", state: null, last: before.items[0] }],
    ["DEAS-O-withdrawn", { field: "removed", state: "Released", last: before.items[1] }],
  ]);
  expect(changes[1]).toMatchObject({
    kind: "appointment",
    offerId: "withdrawn",
    card: { addressLine1: "Vej withdrawn", addressLine2: "2200 København N", imageUrl: "img-withdrawn" },
  });
});

it("a refresh that withheld its cursor left failed items out: their absence is not a removal", () => {
  const before = data([appointment("1"), appointment("2")]);
  const after = data([appointment("1")], { cursor: null });

  expect(appointmentChanges(before, after)).toEqual([]);
});

it("after a refresh that withheld its cursor, items it left out coming back are not new", () => {
  const before = data([appointment("1")], { cursor: null });
  const after = data([appointment("1"), appointment("2")]);

  expect(appointmentChanges(before, after)).toEqual([]);
});

it("an appointment stored before threads were kept gets no message change when its thread arrives", () => {
  const before = data([appointment("1", { messages: undefined })]);
  const after = data([appointment("1", { messages: [INVITATION, message("landlord", "2026-10-03T09:00:00Z", "Hej")] })]);

  expect(appointmentChanges(before, after)).toEqual([]);
});

it("an offer's deadline, move-in date, rent, position and answer are changes; new and removed offers too", () => {
  const before = data([offer("1"), offer("2"), offer("moved"), offer("lost")]);
  const after = data(
    [
      offer("1", { deadline: "2026-10-22", availableFrom: "2027-01-01", position: 2 }),
      offer("2", { recipientState: "OfferAccepted", financials: { ...MONEY, monthlyRentIncludingAconto: 8100 } }),
      offer("new"),
    ],
    { removedStates: { moved: "Finished", lost: "AwardedExternally" } },
  );

  expect(details(offerChanges(before, after))).toEqual([
    ["1", { field: "deadline", from: "2026-10-20", to: "2026-10-22" }],
    ["1", { field: "moveIn", from: "2026-12-01", to: "2027-01-01" }],
    ["1", { field: "position", from: 5, to: 2 }],
    ["2", { field: "financials", from: { rent: 8000, deposit: 24000 }, to: { rent: 8100, deposit: 24000 } }],
    ["2", { field: "answer", from: "OfferReceived", to: "OfferAccepted" }],
    ["new", { field: "added" }],
    ["moved", { field: "removed", state: "Finished", last: before.items[2] }],
    ["lost", { field: "removed", state: "AwardedExternally", last: before.items[3] }],
  ]);
});
