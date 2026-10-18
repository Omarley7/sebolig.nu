import type { Appointment, Offer } from "@/types";
import { getDeadlineUrgency } from "~/lib/deadlineUrgency";
import { formatCurrency, formatDate, formatOfferFacts, formatTimeSlot } from "~/lib/formatters";

type Translate = (key: string, params?: Record<string, unknown>) => string;

/** A location on the map, opened by id when the user taps "Se detaljer" in its popup. */
export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  label: string;
  /** Shown muted under the label: the rest of the address. */
  sublabel: string | null;
  /** Further lines, already formatted, shown in order under the address. */
  details: string[];
}

const rent = (amount: number, t: Translate) => `${formatCurrency(amount)} / ${t("financials.shortMonth")}`;

/** An appointment's pin, or null when its residence has no location. */
export function appointmentPin(appointment: Appointment, t: Translate): MapPin | null {
  const { id, title, residence, financials } = appointment;
  if (!residence.location) return null;
  return {
    id,
    lat: residence.location.latitude,
    lng: residence.location.longitude,
    label: residence.addressLine1 ?? title,
    sublabel: residence.addressLine2,
    // The full date even when grouped by day: on the map the pin has lost its group
    details: [
      ...(appointment.cancelled ? [t("appointments.cancelled")] : []),
      appointment.date ? formatTimeSlot(appointment, t, true) : t("appointments.noDate"),
      rent(financials.monthlyRentIncludingAconto, t),
    ],
  };
}

/** An offer's pin, or null when its residence has no location. */
export function offerPin(offer: Offer, t: Translate): MapPin | null {
  const { id, residence, financials } = offer;
  if (!residence.location) return null;
  return {
    id,
    lat: residence.location.latitude,
    lng: residence.location.longitude,
    label: residence.addressLine1 ?? "",
    sublabel: residence.addressLine2,
    details: [
      formatOfferFacts(offer, t),
      offer.deadline ? `${t("offers.deadline")}: ${getDeadlineUrgency(offer.deadline, t).relative}` : "",
      offer.availableFrom ? `${t("offers.availableFrom")}: ${formatDate(offer.availableFrom)}` : "",
      rent(financials.monthlyRentIncludingAconto, t),
    ].filter(Boolean),
  };
}
