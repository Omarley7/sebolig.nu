// findbolig.nu's own shapes, as the findbolig client reads them. Plain types: nothing checks them at runtime.

type Location = { latitude: number; longitude: number };

type Media = { id: string; path: string };

type Amount = {
  amount: number;
  currency: { symbol: string | null; isoCode: number };
};

/**
 * A residence model (GET /api/models/residence/:id). findbolig.nu answers with far more
 * (descriptions, facilities, map and FAQ content); only the fields the domain mapping reads
 * are typed.
 */
export type ApiResidence = {
  entityInfo: {
    title: string;
    addressLine1: string;
    addressLine2: string;
    location: Location;
    media: { images: Media[]; blueprints: Media[] };
  };
  factsModel: {
    residence: {
      area: number;
      rooms: number;
      availableFrom: string | null;
    };
  };
  financialsModel: {
    monthlyRentIncludingAconto: Amount;
    monthlyRentExcludingAconto: Amount;
    prepaidRent: Amount;
    aconto: Amount;
    deposit: Amount;
    firstPayment: Amount;
  };
};

/** What the server keeps of a residence while it builds offers and appointments from it. */
export type ResidenceDetails = {
  title: string;
  addressLine1: string;
  addressLine2: string;
  area: number;
  rooms: number;
  monthlyRentIncludingAconto: number;
  monthlyRentExcludingAconto: number;
  prepaidRent: number;
  aconto: number;
  deposit: number;
  firstPayment: number;
  availableFrom: string | null;
  location: Location;
  images: string[];
  blueprints: string[];
};
