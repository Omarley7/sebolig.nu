import { describe, expect, it } from "vitest";
import { isDarkTheme, readThemePreference } from "./theme";

describe("theme preference", () => {
  it("defaults to Automatisk when nothing is stored", () => {
    expect(readThemePreference(null)).toBe("auto");
  });

  it("keeps a stored Lys or Mørk, as earlier versions stored them", () => {
    expect(readThemePreference("light")).toBe("light");
    expect(readThemePreference("dark")).toBe("dark");
    expect(readThemePreference("auto")).toBe("auto");
  });

  it("falls back to Automatisk for anything else", () => {
    expect(readThemePreference("purple")).toBe("auto");
  });

  it("follows the device only under Automatisk", () => {
    expect(isDarkTheme("auto", true)).toBe(true);
    expect(isDarkTheme("auto", false)).toBe(false);
    expect(isDarkTheme("dark", false)).toBe(true);
    expect(isDarkTheme("light", true)).toBe(false);
  });
});
