import type { Appointment, MessageSender, Offer, RecipientState, ThreadMessage, UserData, WaitingList, WaitingListStatus } from "@/types";
import { decodeEntities, type AppointmentDetails } from "~/lib/llm/appointment-extractor";
import type { ApiOffer, ApiUserData } from "~/types/offers";
import type { ApiResidence, ResidenceDetails } from "~/types/residences";
import type { ApiMessageThreadFull } from "~/types/threads";
import type { ApiPositionForProperty, ApiPropertySearchResult, ApiResidenceApplication } from "~/types/waiting-lists";

/** The sender id findbolig.nu signs its own notices with. */
const FINDBOLIG_SENDER_ID = "11111111-1111-1111-1111-111111111111";

/**
 * A message body as plain text: a paragraph ends in a blank line, `<br>` and the end of a div or
 * list item in a line break; every other tag is stripped (a link keeps its text), entities are decoded. Bodies that are plain text already
 * keep their line breaks.
 */
export function plainText(body: string): string {
  const text = body
    .replace(/<br\s*\/?>\n?/gi, "\n")
    .replace(/<\/p>\n?/gi, "\n\n")
    .replace(/<\/(div|li)>\n?/gi, "\n")
    .replace(/<[^>]*>?/g, "");
  return decodeEntities(text)
    .replace(/[ \t ]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** What an appointment holds of its offer's thread. */
export function mapThreadToDomain(thread: ApiMessageThreadFull, offer: ApiOffer): Pick<Appointment, "messageCount" | "messages"> {
  return { messageCount: thread.messages.length, messages: mapThreadMessages(thread, offer) };
}

/** An offer's thread as the client shows it, oldest first. `offer` tells the user's own messages apart. */
function mapThreadMessages(thread: ApiMessageThreadFull, offer: ApiOffer): ThreadMessage[] {
  const userId = offer.recipients?.[0]?.userId;
  return thread.messages
    .toSorted((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime())
    .map((message) => {
      const from: MessageSender =
        message.sender?.id === FINDBOLIG_SENDER_ID || message.sender?.name?.toLowerCase() === "findbolig"
          ? "findbolig"
          : userId && message.sender?.id === userId
            ? "you"
            : "landlord";
      return {
        from,
        senderName: from === "landlord" ? (message.sender?.name ?? null) : null,
        sentAt: message.created,
        body: plainText(message.body ?? ""),
        hasAttachments: (message.attachments?.length ?? 0) > 0,
      };
    });
}

export function mapAppointmentToDomain({
  offer,
  residence,
  details,
  position,
  thread,
}: {
  offer: ApiOffer;
  residence: ResidenceDetails;
  details: AppointmentDetails;
  position: number | null;
  thread: ApiMessageThreadFull;
}): Appointment {
  const recipient = offer.recipients?.[0];
  return {
    id: `DEAS-O-${offer.id}`,
    offerId: offer.id,
    title: residence.title,
    date: details.date || null,
    start: details.startTime || null,
    end: details.endTime || null,
    cancelled: details.cancelled,
    residence: {
      addressLine1: residence.addressLine1,
      addressLine2: residence.addressLine2,
      location: residence.location,
    },
    financials: {
      monthlyRentIncludingAconto: residence.monthlyRentIncludingAconto,
      monthlyRentExcludingAconto: residence.monthlyRentExcludingAconto,
      utilityCosts: residence.aconto,
      deposit: residence.deposit,
      prepaidRent: residence.prepaidRent,
      firstPayment: residence.firstPayment,
    },
    imageUrl: residence.images[0] || "",
    images: residence.images,
    blueprints: residence.blueprints,
    position,
    recipientState: recipient?.state ?? null,
    accepted: recipient?.accepted ?? null,
    declined: recipient?.declined ?? null,
    ...mapThreadToDomain(thread, offer),
  };
}

export function mapOfferToDomain({
  offer,
  residence,
  position,
}: {
  offer: ApiOffer;
  residence: ResidenceDetails;
  position: number | null;
}): Offer {
  const recipientState: RecipientState =
    (offer.recipients?.[0]?.state as RecipientState) ?? "OfferReceived";

  return {
    id: offer.id,
    residence: {
      addressLine1: residence.addressLine1,
      addressLine2: residence.addressLine2,
      location: residence.location,
    },
    deadline: offer.deadline ?? null,
    availableFrom: residence.availableFrom ?? null,
    rooms: residence.rooms ?? null,
    area: residence.area ?? null,
    recipientState,
    company: offer.company ?? offer.organization ?? "",
    financials: {
      monthlyRentIncludingAconto: residence.monthlyRentIncludingAconto,
      monthlyRentExcludingAconto: residence.monthlyRentExcludingAconto,
      utilityCosts: residence.aconto,
      deposit: residence.deposit,
      prepaidRent: residence.prepaidRent,
      firstPayment: residence.firstPayment,
    },
    imageUrl: residence.images[0] || "",
    images: residence.images,
    blueprints: residence.blueprints,
    position,
  };
}

/**
 * The position-for-property endpoint may return:
 *   - a bare number ("your best position is X")
 *   - { position: X }
 *   - an array of { residenceId, position } per applied residence
 * We accept all three and return the lowest (best) position or null.
 */
function extractBestPosition(raw: ApiPositionForProperty): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "object" && raw !== null) {
    if (Array.isArray(raw)) {
      const positions = raw
        .map((r: any) => (typeof r?.position === "number" ? r.position : null))
        .filter((n): n is number => n !== null && Number.isFinite(n));
      return positions.length ? Math.min(...positions) : null;
    }
    const single = (raw as any).position;
    if (typeof single === "number" && Number.isFinite(single)) return single;
  }
  return null;
}

export function mapWaitingListToDomain({
  applications,
  property,
  position,
}: {
  applications: ApiResidenceApplication[];   // all rows for one propertyId
  property: ApiPropertySearchResult;
  position: ApiPositionForProperty | null;
}): WaitingList {
  if (applications.length === 0) {
    throw new Error(`mapWaitingListToDomain called with empty applications for property ${property.id}`);
  }

  // Status: any-Active → Active, all-Passive → Passive (matches property-level set-active semantic)
  const status: WaitingListStatus = applications.some((a) => a.status === "Active") ? "Active" : "Passive";

  // appliedSince: earliest `created`
  const appliedSince = applications.reduce(
    (earliest, a) => (a.created < earliest ? a.created : earliest),
    applications[0].created,
  );

  return {
    propertyId: property.id,
    status,
    propertyShortId: property.shortId,
    name: property.name,
    address: property.propertyAddress,
    city: property.city,
    postalCode: property.postalCode,
    location: { latitude: property.latitude, longitude: property.longitude },
    images: property.media.images,
    blueprints: property.media.blueprints,
    minRent: property.minRent,
    maxRent: property.maxRent,
    minRooms: property.minRooms,
    maxRooms: property.maxRooms,
    minArea: property.minArea,
    maxArea: property.maxArea,
    residencesCount: property.residencesCount,
    residencesAppliedCount: applications.length,
    bestPosition: extractBestPosition(position),
    appliedSince,
    organization: {
      id: property.propertyOrganizationId,
      name: property.propertyOrganizationName,
      logoUrl: property.organizationLogo ?? null,
    },
    company: {
      id: property.propertyCompanyId,
      name: property.propertyCompanyName,
      logoUrl: property.companyLogo ?? null,
    },
  };
}

export function apiResidenceToDomain(apiResidence: ApiResidence): ResidenceDetails {
  return {
    title: apiResidence.entityInfo.title,
    addressLine1: apiResidence.entityInfo.addressLine1,
    addressLine2: apiResidence.entityInfo.addressLine2,
    area: apiResidence.factsModel.residence.area,
    rooms: apiResidence.factsModel.residence.rooms,
    monthlyRentIncludingAconto:
      apiResidence.financialsModel.monthlyRentIncludingAconto.amount,
    monthlyRentExcludingAconto:
      apiResidence.financialsModel.monthlyRentExcludingAconto.amount,
    prepaidRent: apiResidence.financialsModel.prepaidRent.amount,
    aconto: apiResidence.financialsModel.aconto.amount,
    deposit: apiResidence.financialsModel.deposit.amount,
    firstPayment: apiResidence.financialsModel.firstPayment.amount,
    availableFrom: apiResidence.factsModel.residence.availableFrom,
    location: apiResidence.entityInfo.location,
    images: apiResidence.entityInfo.media.images.map((image) => image.path),
    blueprints: apiResidence.entityInfo.media.blueprints.map(
      (blueprint) => blueprint.path
    ),
  };
}

export function apiUserDataToDomain(apiUserData: ApiUserData): UserData {
  return {
    email: apiUserData.email,
    fullName: apiUserData.notifications.fullName,
  };
}