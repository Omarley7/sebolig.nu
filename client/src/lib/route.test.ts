import { describe, expect, it } from "vitest";
import { routeUrl } from "./route";

const IPHONE = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15", maxTouchPoints: 5 };
const IPAD = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", maxTouchPoints: 5 };
const MAC = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", maxTouchPoints: 0 };
const ANDROID = { userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0", maxTouchPoints: 5 };

const PLACE = { addressLine1: "Nitivej 6, 2. tv", addressLine2: "2000 Frederiksberg", location: { latitude: 55.68, longitude: 12.53 } };

describe("Rute", () => {
  it("opens Apple Maps directions on an iPhone or iPad", () => {
    expect(routeUrl(PLACE, IPHONE)).toBe("https://maps.apple.com/?daddr=55.68,12.53");
    expect(routeUrl(PLACE, IPAD)).toBe("https://maps.apple.com/?daddr=55.68,12.53");
  });

  it("opens Google Maps directions everywhere else", () => {
    expect(routeUrl(PLACE, ANDROID)).toBe("https://www.google.com/maps/dir/?api=1&destination=55.68,12.53");
    expect(routeUrl(PLACE, MAC)).toBe("https://www.google.com/maps/dir/?api=1&destination=55.68,12.53");
  });

  it("goes by the address when the residence has no location", () => {
    const place = { ...PLACE, location: null };

    expect(routeUrl(place, ANDROID)).toBe("https://www.google.com/maps/dir/?api=1&destination=Nitivej%206%2C%202.%20tv%2C%202000%20Frederiksberg");
    expect(routeUrl(place, IPHONE)).toBe("https://maps.apple.com/?daddr=Nitivej%206%2C%202.%20tv%2C%202000%20Frederiksberg");
  });
});
