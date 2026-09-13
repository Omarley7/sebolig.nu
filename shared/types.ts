export type Appointment = {
  id: string; // DEAS-O-{address-with-dashes} -or- // DEAS-{offerId}
  offerId: string; // The offer UUID from findbolig.nu
  title: string;
  date: string | null;
  start: string | null; // Appointment start time
  end: string | null; // Appointment end time
  cancelled: boolean;
  residence: Pick<Residence, "adressLine1" | "adressLine2" | "location">; // Provider spelled it wrong.
  financials: Financials;
  imageUrl: string;
  images: string[];
  blueprints: string[];
  position: number | null;
  recipientState: string | null;
  accepted: string | null;
  declined: string | null;
  messageCount?: number;
};

export type Financials = {
  monthlyRentIncludingAconto: number;
  monthlyRentExcludingAconto: number;
  utilityCosts: number;
  deposit: number;
  prepaidRent: number;
  firstPayment: number;
};

export type Residence = {
  id: string; // DEAS-R-{address-with-dashes} -or- // DEAS-{residenceId}
  adressLine1: string | null;
  adressLine2: string | null;
  location: { latitude: number; longitude: number } | null; // Latitude/Longitude
  blueprintUrl: string | null;
};

export type UserData = {
  email: string;
  fullName: string;
};

export type RecipientState = "OfferReceived" | "OfferAccepted" | "OfferDeclined";

export type Offer = {
  id: string;
  residence: Pick<Residence, "adressLine1" | "adressLine2" | "location">;
  deadline: string | null;
  availableFrom: string | null;
  rooms: number | null;
  area: number | null; // m²
  recipientState: RecipientState;
  company: string;
  financials: Financials;
  imageUrl: string;
  images: string[];
  blueprints: string[];
  position: number | null;
};

// Result of a lightweight "what changed since `latestUpdated`" check.
export type OfferDelta = {
  offers: Offer[]; // new/updated offers that are (still) Published
  removedIds: string[]; // previously-cached offers that changed out of Published
  latestUpdated: string | null; // new cursor to persist for the next delta check
};

export type CachedAppointmentEntry = {
  offerId: string;
  messageCount: number;
  date: string | null;
  appointment: Appointment;
};

export type SyncAppointmentsRequest = {
  cached: CachedAppointmentEntry[];
  includeAll: boolean;
};

export type WaitingListStatus = "Active" | "Passive";

export type WaitingList = {
  propertyId: string;
  status: WaitingListStatus;

  // Property metadata (from /api/search)
  propertyShortId: number;             // for building the findbolig.nu link
  name: string;                        // e.g. "Hasselgården"
  address: string;                     // e.g. "Ålekistevej 59. m. fl, 2720 Vanløse"
  city: string;
  postalCode: number;
  location: { latitude: number; longitude: number } | null;
  images: string[];                    // residence photos, [0] is hero
  blueprints: string[];

  // Rent / size range
  minRent: number;
  maxRent: number;
  minRooms: number;
  maxRooms: number;
  minArea: number;
  maxArea: number;
  residencesCount: number;             // total residences in property

  // User's application footprint
  residencesAppliedCount: number;
  bestPosition: number | null;
  appliedSince: string;                // ISO

  organization: {
    id: string;
    name: string;
    logoUrl: string | null;
  };
  company: {
    id: string;
    name: string;
    logoUrl: string | null;
  };
};

// Client-side persisted snapshot for status-flip detection
export type WaitingListSnapshot = {
  propertyId: string;
  status: WaitingListStatus;
  observedAt: string;
};
