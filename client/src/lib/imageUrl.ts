import config from "~/config";

/** Full URL of an image findbolig.nu serves, from the path an offer, appointment or waiting list carries. */
export function imageUrl(imagePath: string | null | undefined): string {
  if (!imagePath) return "";
  return `${config.imageBaseUrl}${imagePath}`;
}
