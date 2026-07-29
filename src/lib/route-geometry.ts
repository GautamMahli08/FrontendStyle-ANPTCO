// Shared road geometry — OSRM road routes plus the maths for walking along one.
//
// This lives in lib rather than inside the map component because two very different
// callers need the same answer: the map draws the truck on the road, and the theft
// scenario has to stop the truck *on that same road*. Computing the stop position
// from a straight depot→destination line put the halted truck well off the drawn
// route (the road to Nakhal runs west along the coast before turning south, so the
// straight-line midpoint isn't on it at all).
//
// The cache is module scope on purpose: it must outlive component mounts, or
// navigating away and back redraws every route as a straight line for the length of
// an OSRM round-trip.

import { haversineDistanceM, LatLng } from './geo';

export type LatLngTuple = [number, number];

const ROUTE_CACHE   = new Map<string, LatLngTuple[]>();  // resolved road geometry only
const ROUTE_PENDING = new Set<string>();                 // in-flight, so we don't double-fetch

/** Keyed on geometry, so every truck travelling depot→station shares one entry. */
export const routeCacheKey = (from: LatLng, to: LatLng) =>
  `${from.lat},${from.lng}->${to.lat},${to.lng}`;

/** Straight line between two points — the instant fallback before OSRM resolves. */
export const straightPath = (from: LatLng, to: LatLng): LatLngTuple[] =>
  [[from.lat, from.lng], [to.lat, to.lng]];

/** Cached road route, or null when it hasn't resolved yet. */
export const getCachedRoadRoute = (from: LatLng, to: LatLng): LatLngTuple[] | null =>
  ROUTE_CACHE.get(routeCacheKey(from, to)) ?? null;

/**
 * Fetch the real road route from the public OSRM server (the same OpenStreetMap road
 * network the tiles are drawn from), so trucks follow highways instead of cutting
 * across the Gulf of Oman. Resolves to the path, or null if the request failed.
 *
 * A failed fetch is deliberately NOT cached: caching the straight-line fallback would
 * pin a wrong route for the whole session with nothing to retry it.
 */
export async function ensureRoadRoute(from: LatLng, to: LatLng): Promise<LatLngTuple[] | null> {
  const key = routeCacheKey(from, to);
  const cached = ROUTE_CACHE.get(key);
  if (cached) return cached;
  if (ROUTE_PENDING.has(key)) return null;

  ROUTE_PENDING.add(key);
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const coords = data?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    // OSRM returns [lng, lat]; everything here wants [lat, lng].
    const path = coords.map((c: [number, number]) => [c[1], c[0]] as LatLngTuple);
    ROUTE_CACHE.set(key, path);
    return path;
  } catch {
    return null;
  } finally {
    ROUTE_PENDING.delete(key);
  }
}

function routeLength(path: LatLngTuple[]): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    total += haversineDistanceM(
      { lat: path[i][0],     lng: path[i][1] },
      { lat: path[i + 1][0], lng: path[i + 1][1] },
    );
  }
  return total;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Point at fraction `t` (0→1) of the way along `path`, measured by distance. */
export function routePosition(path: LatLngTuple[], t: number): LatLngTuple {
  if (path.length === 0) return [0, 0];
  if (t <= 0) return path[0];
  if (t >= 1) return path[path.length - 1];

  let remaining = routeLength(path) * t;

  for (let i = 0; i < path.length - 1; i += 1) {
    const a = { lat: path[i][0],     lng: path[i][1] };
    const b = { lat: path[i + 1][0], lng: path[i + 1][1] };
    const segDist = haversineDistanceM(a, b);
    if (remaining <= segDist || i === path.length - 2) {
      const ratio = segDist === 0 ? 0 : remaining / segDist;
      return [lerp(a.lat, b.lat, ratio), lerp(a.lng, b.lng, ratio)];
    }
    remaining -= segDist;
  }

  return path[path.length - 1];
}
