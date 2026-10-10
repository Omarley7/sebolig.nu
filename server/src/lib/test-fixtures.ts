/** A residence as findbolig.nu answers it, trimmed to the fields the domain mapping reads. For tests. */
export function apiResidence() {
  return {
    entityInfo: {
      title: "Hasselgården 3. tv",
      addressLine1: "Ålekistevej 59",
      addressLine2: "2720 Vanløse",
      location: null,
      media: { images: [], blueprints: [] },
    },
    factsModel: {
      residence: { area: 60, rooms: 2, availableFrom: null },
    },
    financialsModel: Object.fromEntries(
      ["monthlyRentIncludingAconto", "monthlyRentExcludingAconto", "prepaidRent", "aconto", "deposit", "firstPayment"].map(
        (k) => [k, { amount: 1 }],
      ),
    ),
  };
}
