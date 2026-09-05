interface Config {
  backendDomain: string;
  useMockData: boolean;
  imageBaseUrl: string;
}

const config: Config = {
  backendDomain: import.meta.env.VITE_BACKEND_DOMAIN ?? "",
  useMockData: import.meta.env.VITE_USE_MOCK_DATA === "true",
  imageBaseUrl: import.meta.env.VITE_IMAGE_BASE_URL ?? "https://findbolig.nu",
};

/** Public source repository, linked from the footer and the Explainer. */
export const REPO_URL = "https://github.com/Omarley7/sebolig.nu";

export default config;
