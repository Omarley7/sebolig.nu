import type { Appointment, Offer, RecipientState, UserData, WaitingList, WaitingListStatus } from "@/types";
import type { AppointmentDetails } from "~/lib/llm/openai-extractor";
import type { ApiOffer, ApiUserData } from "~/types/offers";
import type { ApiResidence, Residence } from "~/types/residences";
import type { ApiPositionForProperty, ApiPropertySearchResult, ApiResidenceApplication } from "~/types/waiting-lists";

export function mapAppointmentToDomain({
  offer,
  residence,
  details,
  position,
  messageCount,
}: {
  offer: ApiOffer;
  residence: Residence;
  details: AppointmentDetails;
  position: number | null;
  messageCount: number;
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
      adressLine1: residence.addressLine1,
      adressLine2: residence.addressLine2,
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
    messageCount,
  };
}

export function mapOfferToDomain({
  offer,
  residence,
  position,
}: {
  offer: ApiOffer;
  residence: Residence;
  position: number | null;
}): Offer {
  const recipientState: RecipientState =
    (offer.recipients?.[0]?.state as RecipientState) ?? "OfferReceived";

  return {
    id: offer.id,
    residence: {
      adressLine1: residence.addressLine1,
      adressLine2: residence.addressLine2,
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

export function apiResidenceToDomain(apiResidence: ApiResidence): Residence {
  return {
    id: apiResidence.entityInfo.id,
    propertyId: apiResidence.entityInfo.propertyId,
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
    petsAllowed: apiResidence.factsModel.petsAllowed,
    createdAt: new Date(apiResidence.factsModel.residence.created),
    updatedAt: new Date(apiResidence.factsModel.residence.updated),
  };
}

export function apiUserDataToDomain(apiUserData: ApiUserData, cookies?: string[]): UserData & { cookies: string[] } {
  return {
    email: apiUserData.email,
    fullName: apiUserData.notifications.fullName,
    cookies: cookies || [],
  };
}