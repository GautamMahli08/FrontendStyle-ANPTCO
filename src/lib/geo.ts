// Geofence math. The demo's journey/arrival logic is still time-based, but theft
// detection needs a real answer to "is this truck somewhere it's allowed to be?" —
// a fuel drop inside the depot or the destination is a legitimate load/offload, and
// only a drop outside every authorized fence is worth alerting on.

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance between two points, in metres. */
export function haversineDistanceM(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isInsideGeofence(point: LatLng, center: LatLng, radiusM: number): boolean {
  return haversineDistanceM(point, center) <= radiusM;
}
