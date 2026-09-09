import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick, type WritableComputedRef } from "vue";
import ConnectForm from "~/components/ConnectForm.vue";
import { useAuth } from "~/composables/useAuth";
import i18n from "~/i18n";
import router from "~/router";

vi.mock("posthog-js", () => ({
  default: { init: vi.fn(), identify: vi.fn() },
}));

// The approved copy from .scratch/connection-trust/spec.md (Vocabulary and copy), verbatim.
const APPROVED = {
  da: {
    heading: "Forbind din findbolig.nu-konto for at komme i gang",
    button: "Forbind med findbolig.nu",
    custodyNote:
      "SeBolig gemmer din adgangskode krypteret i din browser, så du forbliver forbundet i op til 30 dage. Intet gemmes på vores servere. Du kan afbryde når som helst. Sådan virker det →",
    nonAffiliation: "SeBolig er ikke tilknyttet findbolig.nu eller DEAS. Kildekode på GitHub.",
    passwordChangedHeading:
      "Din findbolig.nu-adgangskode ser ud til at være ændret, så forbindelsen er afbrudt og dine data på denne enhed er slettet. Forbind igen for at fortsætte.",
  },
  en: {
    heading: "Connect your findbolig.nu account to get started",
    button: "Connect with findbolig.nu",
    custodyNote:
      "SeBolig keeps your password encrypted in your browser so you stay connected for up to 30 days. Nothing is stored on our servers. You can disconnect at any time. How it works →",
    nonAffiliation: "SeBolig is not affiliated with findbolig.nu or DEAS. Source code on GitHub.",
    passwordChangedHeading:
      "Your findbolig.nu password seems to have changed, so the connection was ended and your data on this device was erased. Connect again to continue.",
  },
} as const;

// Same cast the app uses in useLocale.ts; vue-i18n types the global locale loosely.
const locale = i18n.global.locale as unknown as WritableComputedRef<"da" | "en">;

let unmount = () => {};

function mountConnectForm(target: "da" | "en") {
  locale.value = target;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const pinia = createPinia();
  setActivePinia(pinia);
  const app = createApp(ConnectForm).use(pinia).use(i18n).use(router);
  app.mount(host);
  unmount = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

function textOf(el: Element | null) {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

afterEach(() => unmount());

describe.each(["da", "en"] as const)("connect form in %s", (locale) => {
  const approved = APPROVED[locale];

  it("renders the approved heading and connect button", () => {
    const host = mountConnectForm(locale);
    expect(textOf(host.querySelector("p"))).toBe(approved.heading);
    expect(textOf(host.querySelector("button[type=submit]"))).toBe(approved.button);
  });

  it("explains a rejected password as its heading, in place of the normal one", async () => {
    const host = mountConnectForm(locale);
    useAuth().endedByPasswordChange = true;
    await nextTick();
    expect(textOf(host.querySelector("p"))).toBe(approved.passwordChangedHeading);
    expect(textOf(host)).not.toContain(approved.heading);
  });

  it("renders the custody note verbatim, with the Explainer linked", () => {
    const host = mountConnectForm(locale);
    const note = host.querySelector("[data-testid=custody-note]");
    expect(textOf(note)).toBe(approved.custodyNote);
    expect(note?.querySelector("a")?.getAttribute("href")).toBe(router.resolve({ name: "explainer" }).href);
  });

  it("renders the non-affiliation line verbatim, with the source code linked to GitHub", () => {
    const host = mountConnectForm(locale);
    const line = host.querySelector("[data-testid=non-affiliation]");
    expect(textOf(line)).toBe(approved.nonAffiliation);
    expect(line?.querySelector("a")?.getAttribute("href")).toMatch(/^https:\/\/github\.com\//);
  });
});

it("lets a password manager fill the form", async () => {
  const host = mountConnectForm("da");
  await nextTick();
  const email = host.querySelector("input[type=email]")!;
  expect(email.getAttribute("autocomplete")).toBe("username");
  expect(email.getAttribute("inputmode")).toBe("email");
  expect(host.querySelector("input[autocomplete=current-password]")).not.toBeNull();
});
