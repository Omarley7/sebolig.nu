// findbolig.nu's own shapes, as the findbolig client reads them. Plain types: nothing checks them at runtime.

export type ApiResidenceApplication = {
  residenceId: string;
  propertyId: string;
  companyId: string;
  userId: string;
  inactiveDate: string | null;
  status: "Active" | "Passive";
  created: string;
};

/** Property search results carry many more fields; only the ones we consume are typed. */
export type ApiPropertySearchResult = {
  id: string; // propertyId
  shortId: number;
  name: string;
  street: string;
  number?: number | string | null;
  postalCode: number;
  postalCodeName: string;
  city: string;
  propertyAddress: string;
  latitude: number;
  longitude: number;
  media: { images: string[]; blueprints: string[] };
  companyLogo?: string | null;
  organizationLogo?: string | null;
  propertyOrganizationId: string;
  propertyOrganizationName: string;
  propertyCompanyId: string;
  propertyCompanyName: string;
  residencesCount: number;
  minRooms: number;
  maxRooms: number;
  minArea: number;
  maxArea: number;
  minRent: number;
  maxRent: number;
};

export type ApiPropertySearchPage = {
  facets: unknown;
  totalResults: number;
  page: number;
  pageSize: number;
  results: ApiPropertySearchResult[];
};

// Position-for-property — exact shape unknown until first call.
// The mapper handles either a bare number, or an array of {residenceId, position}.
// Define a permissive type and narrow at the mapper.
export type ApiPositionForProperty =
  | number
  | { residenceId: string; position: number }[]
  | { position: number }
  | unknown;
