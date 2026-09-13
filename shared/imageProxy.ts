/** Image transformation library with adapter-based URL rewriting. */

interface ImageParams {
    w: number;
    h: number;
    fit: string;
    q?: number;
    output: string;
}

interface ImageAdapter {
    /** Human-readable name for debugging / logging. */
    name: string;
    /** Return true if this adapter can handle the given source URL. */
    supports(url: string): boolean;
    /** Rewrite the URL so it returns a transformed image with the given params. */
    transform(url: string, params: ImageParams): string;
}

// ---------------------------------------------------------------------------
// Adapters (ordered by priority – first match wins)
// ---------------------------------------------------------------------------

/**
 * wsrv.nl – open-source image proxy that works with any publicly reachable URL.
 * Docs: https://wsrv.nl/docs/
 */
const wsrvAdapter: ImageAdapter = {
    name: "wsrv",
    supports: () => true, // universal fallback
    transform(url, params) {
        const qsObj: Record<string, string> = {
            url,
            w: String(params.w),
            h: String(params.h),
            fit: params.fit,
            output: params.output,
        };
        if (params.q) {
            qsObj.q = String(params.q);
        }
        const qs = new URLSearchParams(qsObj);
        return `https://wsrv.nl/?${qs.toString()}`;
    },
};

/** Registered adapters – checked in order; first `supports()` match is used. */
const adapters: ImageAdapter[] = [
    // Add domain-specific adapters above the universal fallback.
    wsrvAdapter,
];

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

function resolve(url: string, params: ImageParams): string {
    const adapter = adapters.find((a) => a.supports(url));
    if (!adapter) return url; // no adapter matched – return original
    return adapter.transform(url, params);
}

// ---------------------------------------------------------------------------
// Public presets
// ---------------------------------------------------------------------------

const GALLERY_PARAMS: ImageParams = {
    w: 800,
    h: 600,
    fit: "cover",
    q: 75,
    output: "webp",
};

/**
 * Return a gallery-sized, optimised version of the given image URL.
 *
 * Suitable for modal / lightbox views (800×600, cover-fit, q75, webp).
 */
export function galleryImage(url: string): string {
    return resolve(url, GALLERY_PARAMS);
}

const BLUEPRINT_PARAMS: ImageParams = {
    w: 1200,
    h: 900,
    fit: "inside",
    q: 85,
    output: "webp",
};

export function blueprintImage(url: string): string {
    return resolve(url, BLUEPRINT_PARAMS);
}

const COMPACT_THUMB_PARAMS: ImageParams = {
    w: 400,
    h: 300,
    fit: "cover",
    q: 60,
    output: "webp",
};

/** Small thumbnail for compact card views (400×300, cover-fit, q60, webp). */
export function compactThumb(url: string): string {
    return resolve(url, COMPACT_THUMB_PARAMS);
}
