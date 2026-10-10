import { ConnectionEnded } from "~/lib/errors";
import type { FindboligClient } from "~/lib/findbolig-client";
import { mapWaitingListToDomain } from "~/lib/findbolig-domain";
import { limitedFor } from "~/lib/limiter";
import type { ApiResidenceApplication } from "~/types/waiting-lists";

/**
 * Aggregates per-residence application rows into per-property WaitingList objects,
 * enriching with property metadata (from /api/search) and best-position info.
 */
export async function getWaitingLists(client: FindboligClient) {
  const applications = await client.getResidenceApplications();

  // Group by propertyId
  const byProperty = new Map<string, ApiResidenceApplication[]>();
  for (const app of applications) {
    const list = byProperty.get(app.propertyId);
    if (list) list.push(app);
    else byProperty.set(app.propertyId, [app]);
  }

  const propertyIds = Array.from(byProperty.keys());
  if (propertyIds.length === 0) return [];

  // One batched search for all properties
  const properties = await client.searchPropertiesByIds(propertyIds);
  const propertyById = new Map(properties.map((p) => [p.id, p]));

  // Per-property position fetches, under the same Connection limit as every other enrichment
  const positions = await Promise.all(
    propertyIds.map((propertyId) =>
      limitedFor(client, async () => {
        try {
          return await client.getPositionForProperty(propertyId);
        } catch (err) {
          if (err instanceof ConnectionEnded) throw err;
          console.warn(`Position fetch failed for ${propertyId}:`, err);
          return null;
        }
      }),
    ),
  );

  // Map and merge
  const lists = propertyIds.map((propertyId, i) => {
    const property = propertyById.get(propertyId);
    if (!property) {
      console.warn(`No property metadata found for ${propertyId} — skipping`);
      return null;
    }
    const apps = byProperty.get(propertyId)!;
    return mapWaitingListToDomain({
      applications: apps,
      property,
      position: positions[i],
    });
  });

  return lists.filter((l): l is NonNullable<typeof l> => l !== null);
}
