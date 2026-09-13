/**
 * Re-export of the shared image proxy presets.
 *
 * The implementation lives in shared/ so the server can build identical URLs
 * when pre-warming the image proxy's cache (see server/src/lib/image-warmer.ts).
 */
export { galleryImage, blueprintImage, compactThumb } from "@/imageProxy";
