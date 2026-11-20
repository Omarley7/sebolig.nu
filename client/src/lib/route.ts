import type { Residence } from "@/types";

/** What tells an Apple device apart: an iPadOS Safari says "Macintosh", but has a touch screen. */
export type Platform = { userAgent: string; maxTouchPoints: number };

function isApple({ userAgent, maxTouchPoints }: Platform): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/**
 * Directions to a residence (Q18): Apple Maps on an iPhone or iPad, Google Maps elsewhere. Goes by
 * the residence's location, or its address when it has none.
 */
export function routeUrl(residence: Residence, platform: Platform = navigator): string {
  const { location, addressLine1, addressLine2 } = residence;
  const to = location
    ? `${location.latitude},${location.longitude}`
    : encodeURIComponent([addressLine1, addressLine2].filter(Boolean).join(", "));
  return isApple(platform) ? `https://maps.apple.com/?daddr=${to}` : `https://www.google.com/maps/dir/?api=1&destination=${to}`;
}
