/** Formats a cache age in milliseconds as a short "Xh" / "Xd Yh" string for stale-data banners. */
export function formatCacheAge(ageMs: number | null): string {
  if (ageMs === null) return "";
  const hours = Math.floor(ageMs / (1000 * 60 * 60));
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h`;
}
