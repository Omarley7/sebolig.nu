interface Config {
  backendDomain: string;
  /** A demo build: the app is always the Demo and never talks to findbolig.nu or our backend. */
  demoMode: boolean;
  imageBaseUrl: string;
}

const config: Config = {
  backendDomain: import.meta.env.VITE_BACKEND_DOMAIN ?? "",
  demoMode: import.meta.env.VITE_DEMO_MODE === "true",
  imageBaseUrl: import.meta.env.VITE_IMAGE_BASE_URL ?? "https://findbolig.nu",
};

/** Public source repository, linked from the footer and the Explainer. */
export const REPO_URL = "https://github.com/Omarley7/sebolig.nu";

export default config;
