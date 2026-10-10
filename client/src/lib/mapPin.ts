/** A location on the map, opened by id when the user taps "Se detaljer" in its popup. */
export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  label: string;
}
