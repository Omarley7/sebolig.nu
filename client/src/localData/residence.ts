import type { Residence } from "@/types";

/** A residence as offers and appointments stored it before the address fields were spelled right. */
type StoredResidence = Residence & { adressLine1?: string | null; adressLine2?: string | null };

/** Moves the misspelled address fields older versions stored over to today's names. */
export function reviveResidence(stored: Residence): Residence {
  const { adressLine1, adressLine2, ...residence } = stored as StoredResidence;
  return {
    ...residence,
    addressLine1: residence.addressLine1 ?? adressLine1 ?? null,
    addressLine2: residence.addressLine2 ?? adressLine2 ?? null,
  };
}
