// findbolig.nu's own shapes, as the findbolig client reads them. Plain types: nothing checks them at runtime.

export type ApiOfferRecipient = {
  created: string;
  updated: string;
  accepted: string | null;
  declined: string | null;
  received: string | null;
  offerId: string;
  userId: string;
  state: "OfferReceived" | "OfferAccepted" | "OfferDeclined";
  internalState: string | null;
  note: string | null;
};

export type ApiOffer = {
  id: string;
  created: string; // ISO date string
  updated: string; // ISO date string
  number: number;
  offerText: string;
  showingText: string | null;
  internalNote: string | null;
  deadline: string | null;
  recipients?: ApiOfferRecipient[];
  recipientsCount?: number;
  winnerId: string | null;
  /** 'Draft', 'Published', 'Changed', 'Finished', 'Awarded', 'AwardedExternally', 'Released', 'RetiredFromAwarded' */
  state: string;
  organizationId: string;
  organization?: string;
  companyId: string;
  company?: string;
  residenceId?: string;
  propertyId?: string;
  residenceAddress?: string;
  residencePostalCode?: number;
  hasUnreadMessages?: boolean;
  unreadMessagesCount?: number;
  onlyForStudents?: boolean;
};

export type ApiOffersPage = {
  facets: unknown;
  totalResults: number;
  page: number;
  pageSize: number;
  results: ApiOffer[];
};

export type ApiUserData = {
  id: string;
  impersonator: string | null;
  email: string;
  roles: string[];
  landingPage: string | null;
  pensionFunds: unknown[];
  favorites: {
    properties: unknown[];
    residences: unknown[];
    projects: unknown[];
  };
  notifications: {
    locale: string;
    newItemsInInbox: boolean;
    newItemsInSearchAgent: boolean;
    changesToFavorites: boolean;
    sendEmail: boolean;
    sendSms: boolean;
    phoneNoForSms: string;
    email: string;
    fullName: string;
    frequency: number;
  };
};
