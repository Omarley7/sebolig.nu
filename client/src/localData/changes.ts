import type { Appointment, Offer, RecipientState, RemovedState } from "@/types";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { appointmentChanges, movedToAppointments, offerChanges, same, type ChangeKind, type FoundChange } from "~/lib/changes";
import type { KeptData, Update } from "~/lib/localData";
import type { CursorData } from "./delta";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Unseen changes wait this long to be seen, and at most this many of them. */
const UNSEEN_KEPT_MS = 30 * DAY_MS;
const UNSEEN_CAP = 50;
/** Seen changes stay in the panel, greyed out, this long. */
const SEEN_KEPT_MS = 7 * DAY_MS;

/** A change in the log: what was found, when it was last found, and when the user saw it. */
export type Change = FoundChange & { id: string; at: string; seenAt: string | null };

/**
 * What a row in the panel opens: its card on its list's page, the copy of a card that left (kept
 * on its removal, with why it left), or nothing for a card that left before copies were kept.
 */
export type RowTarget =
  | { page: "appointments" | "offers"; itemId: string }
  | { copy: Appointment | Offer; kind: ChangeKind; state: RemovedState | null }
  | null;

/** An answer the user gave in SeBolig itself; see `answeredHere`. */
type OwnAnswer = { offerId: string; state: RecipientState; at: string };

/** The log as stored, under its own key of Local data. */
type StoredChanges = { changes: Change[]; ownAnswers: OwnAnswer[] };

const ageOf = (iso: string, now: Date) => now.getTime() - new Date(iso).getTime();
const newestFirst = (a: Change, b: Change) => new Date(b.at).getTime() - new Date(a.at).getTime();

/** Merges a change found again on a card into its unseen entry: the first value to the latest. Null once nothing is left of it. */
function mergedDetail(entry: Change, change: FoundChange): FoundChange["detail"] | null {
  const [old, now] = [entry.detail, change.detail];
  if (old.field === "message" && now.field === "message") return { ...now, count: old.count + now.count };
  if ("from" in old && "to" in now) {
    const detail = { ...now, from: old.from } as FoundChange["detail"];
    return "to" in detail && same(detail.from, detail.to) ? null : detail;
  }
  return now;
}

/**
 * What changed on the user's appointments and offers since earlier Automatic checks and
 * Refreshes: a log of changes, each unseen until the user opens its card. Kept as Local data,
 * under its own key (`kept`), so it is erased on disconnect.
 *
 * While a change is unseen there is one entry per card per field, merged from the first value to
 * the latest; a value changing back takes it away. A change to a card that is still unseen as new
 * folds into that. Once seen, the next change starts a new entry. Unseen changes are kept up to
 * 30 days (the latest 50), seen ones 7 days.
 */
export function changesStore(kept: KeptData) {
  return defineStore("changes", () => {
    const log = ref<Change[]>([]);
    const ownAnswers = ref<OwnAnswer[]>([]);
    let ids = 0;

    function load() {
      try {
        const stored = JSON.parse(kept.read() ?? "null") as StoredChanges | null;
        // Older versions recorded a new appointment as an invitation. Only accepting brings one now,
        // which the offer already tells, so those rows go.
        const isInvitation = (c: Change) => c.kind === "appointment" && c.detail.field === "added";
        log.value = Array.isArray(stored?.changes) ? stored.changes.filter((c) => !isInvitation(c)) : [];
        ownAnswers.value = Array.isArray(stored?.ownAnswers) ? stored.ownAnswers : [];
      } catch {
        log.value = [];
        ownAnswers.value = [];
      }
    }

    /** Drops what is too old or over the cap, and stores the rest. */
    function save(now = new Date()) {
      const unseen = log.value
        .filter((c) => c.seenAt === null && ageOf(c.at, now) <= UNSEEN_KEPT_MS)
        .sort(newestFirst)
        .slice(0, UNSEEN_CAP);
      const keep = new Set([...unseen, ...log.value.filter((c) => c.seenAt !== null && ageOf(c.seenAt, now) <= SEEN_KEPT_MS)]);
      log.value = log.value.filter((c) => keep.has(c));
      ownAnswers.value = ownAnswers.value.filter((a) => ageOf(a.at, now) <= UNSEEN_KEPT_MS);
      kept.write(JSON.stringify({ changes: log.value, ownAnswers: ownAnswers.value } satisfies StoredChanges));
    }

    const unseenOf = (kind: ChangeKind, itemId: string) => log.value.filter((c) => c.seenAt === null && c.kind === kind && c.itemId === itemId);

    /** Adds what a check or refresh found to the log; see the merging rule above. */
    function record(found: FoundChange[]) {
      const now = new Date();
      const at = now.toISOString();
      for (const change of found) {
        const { detail } = change;
        if (detail.field === "answer" && ownAnswers.value.some((a) => a.offerId === change.offerId && a.state === detail.to)) continue;
        const unseen = unseenOf(change.kind, change.itemId);
        const added = unseen.find((c) => c.detail.field === "added");
        if (added && detail.field !== "removed") {
          Object.assign(added, { card: change.card, at });
          continue;
        }
        const entry = unseen.find((c) => c.detail.field === detail.field);
        if (!entry) {
          log.value.push({ ...change, id: `${now.getTime()}-${ids++}`, at, seenAt: null });
          continue;
        }
        const next = mergedDetail(entry, change);
        if (next) Object.assign(entry, { detail: next, card: change.card, at });
        else log.value = log.value.filter((c) => c !== entry);
      }
      save(now);
    }

    function markSeen(kind: ChangeKind, itemId: string) {
      const unseen = unseenOf(kind, itemId);
      if (unseen.length === 0) return;
      const seenAt = new Date().toISOString();
      for (const change of unseen) change.seenAt = seenAt;
      save();
    }

    function markAllSeen() {
      const seenAt = new Date().toISOString();
      for (const change of log.value) change.seenAt ??= seenAt;
      save();
    }

    /**
     * Notes an answer the user gave in SeBolig. The offer itself changes in Local data at once, but a
     * check that started before the answer can bring back the offer as it was, and the next one the
     * answer: that is not an answer given on findbolig.nu.
     */
    function answeredHere(offerId: string, state: RecipientState) {
      ownAnswers.value.push({ offerId, state, at: new Date().toISOString() });
      save();
    }

    /**
     * What tapping a change's row opens, going by the card's latest change: once a card has left,
     * every row about it opens the copy kept from then. An offer that moved to appointments (it was
     * accepted) opens its appointment instead.
     */
    function rowTarget(change: Change): RowTarget {
      const latest = log.value.filter((c) => c.kind === change.kind && c.itemId === change.itemId).sort(newestFirst)[0] ?? change;
      if (latest.detail.field !== "removed") return { page: change.kind === "appointment" ? "appointments" : "offers", itemId: change.itemId };
      const { state, last } = latest.detail;
      // An appointment's id, as findbolig.nu's offer id makes it (see mapAppointmentToDomain).
      if (movedToAppointments(change.kind, state, last)) return { page: "appointments", itemId: `DEAS-O-${change.offerId}` };
      return last ? { copy: last, kind: change.kind, state } : null;
    }

    kept.onErase(() => {
      log.value = [];
      ownAnswers.value = [];
    });

    load();

    return {
      /** Every change still kept, newest first. */
      changes: computed(() => [...log.value].sort(newestFirst)),
      unseenCount: computed(() => log.value.filter((c) => c.seenAt === null).length),
      /** Whether the card has a change the user has not seen: it gets a dot. */
      hasUnseen: (kind: ChangeKind, itemId: string) => unseenOf(kind, itemId).length > 0,
      rowTarget,
      record,
      markSeen,
      markAllSeen,
      answeredHere,
    };
  });
}

/** A Local data store of cursor data, as far as tracking its changes goes. */
type Updating<T> = { onUpdated(listener: (update: Update<CursorData<T>>) => void): void };

/** Records what each check or refresh of appointments and offers changed in the changes log. */
export function trackChanges({
  appointments,
  offers,
  changes,
}: {
  appointments: Updating<Appointment>;
  offers: Updating<Offer> & { onAnswered(listener: (offerId: string, state: RecipientState) => void): void };
  changes: { record(found: FoundChange[]): void; answeredHere(offerId: string, state: RecipientState): void };
}) {
  appointments.onUpdated(({ before, after }) => changes.record(appointmentChanges(before, after)));
  offers.onUpdated(({ before, after }) => changes.record(offerChanges(before, after)));
  offers.onAnswered((offerId, state) => changes.answeredHere(offerId, state));
}
