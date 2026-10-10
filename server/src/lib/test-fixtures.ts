/** A residence as findbolig.nu answers it, trimmed to the fields the domain mapping reads. For tests. */
export function apiResidence(id: string) {
  const at = "2026-01-01T00:00:00.000Z";
  return {
    entityInfo: {
      id,
      propertyId: "p1",
      title: "Hasselgården 3. tv",
      addressLine1: "Ålekistevej 59",
      addressLine2: "2720 Vanløse",
      location: null,
      media: { images: [], blueprints: [] },
    },
    factsModel: {
      residence: { area: 60, rooms: 2, availableFrom: null, created: at, updated: at },
      petsAllowed: false,
    },
    financialsModel: Object.fromEntries(
      ["monthlyRentIncludingAconto", "monthlyRentExcludingAconto", "prepaidRent", "aconto", "deposit", "firstPayment"].map(
        (k) => [k, { amount: 1 }],
      ),
    ),
  };
}
