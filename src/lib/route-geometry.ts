// Road-following route geometry, shared between the live map (cosmetic
// display) and telemetry recording (src/lib/demo-data.ts's advanceJourneys).
// Without this, "recorded telemetry" was a straight depot→destination lerp
// while the map drew a road-snapped line over it — the two didn't match, and
// anything built on the recorded points (route replay, geofence checks)
// looked wrong even though the live map looked fine.

import { haversineDistanceM, LatLng } from './geo';

const routeCache = new Map<string, LatLng[] | 'unavailable' | 'pending'>();

function cacheKey(a: LatLng, b: LatLng): string {
  return `${a.lat},${a.lng}|${b.lat},${b.lng}`;
}

/** Fetch the actual road-following path from OSRM's public routing service. */
async function fetchRoadRoute(a: LatLng, b: LatLng): Promise<LatLng[] | null> {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const coords = data?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    return coords.map((c: [number, number]) => ({ lat: c[1], lng: c[0] }));
  } catch {
    return null;
  }
}

/**
 * Road-snapped path for a depot→destination pair, cached per pair for the
 * life of the page. Kicks off the fetch on first call and returns null
 * immediately (caller should fall back to a straight line for that tick);
 * once the fetch resolves, subsequent calls return the cached path.
 */
export function getCachedRoadRoute(a: LatLng, b: LatLng): LatLng[] | null {
  const key = cacheKey(a, b);
  const cached = routeCache.get(key);
  if (Array.isArray(cached)) return cached;
  if (cached === undefined) {
    routeCache.set(key, 'pending');
    fetchRoadRoute(a, b).then(path => routeCache.set(key, path ?? 'unavailable'));
  }
  return null;
}

export function routeLength(path: LatLng[]): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) total += haversineDistanceM(path[i], path[i + 1]);
  return total;
}

/** Point at fraction `t` (0→1) along a road path, walking segment-by-segment by distance. */
export function routePosition(path: LatLng[], t: number): LatLng {
  if (path.length === 0) return { lat: 0, lng: 0 };
  if (t <= 0) return path[0];
  if (t >= 1) return path[path.length - 1];

  const total = routeLength(path);
  let remaining = total * t;

  for (let i = 0; i < path.length - 1; i++) {
    const segDist = haversineDistanceM(path[i], path[i + 1]);
    if (remaining <= segDist || i === path.length - 2) {
      const ratio = segDist === 0 ? 0 : remaining / segDist;
      return {
        lat: path[i].lat + (path[i + 1].lat - path[i].lat) * ratio,
        lng: path[i].lng + (path[i + 1].lng - path[i].lng) * ratio,
      };
    }
    remaining -= segDist;
  }
  return path[path.length - 1];
}
