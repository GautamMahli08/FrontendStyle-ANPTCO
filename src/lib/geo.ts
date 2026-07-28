// Real geofence math — replaces the flat-timer "arrival" used elsewhere in the
// demo. GPS jitter near a boundary makes ENTER/EXIT flap rapidly, so entry/exit
// is debounced: N consecutive fixes on the same side before the state flips.

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

/** Consecutive fixes required on one side of the boundary before it flips (plan §7). */
export const GEOFENCE_DEBOUNCE_TICKS = 3;

type Side = 'INSIDE' | 'OUTSIDE';

export interface DebounceState {
  side: Side;          // last confirmed (flipped-into) side
  pendingSide: Side | null;
  pendingCount: number; // consecutive fixes observed on pendingSide so far
}

export function initialDebounceState(): DebounceState {
  return { side: 'OUTSIDE', pendingSide: null, pendingCount: 0 };
}

/**
 * Feed one new fix into the debounce state machine. Returns the (possibly
 * unchanged) state plus whether this tick caused a side flip.
 */
export function stepDebounce(
  state: DebounceState,
  currentlyInside: boolean,
  requiredTicks: number = GEOFENCE_DEBOUNCE_TICKS,
): { state: DebounceState; flipped: boolean } {
  const observedSide: Side = currentlyInside ? 'INSIDE' : 'OUTSIDE';

  if (observedSide === state.side) {
    // Confirms the current side — clear any in-progress flip toward the other side.
    return { state: { side: state.side, pendingSide: null, pendingCount: 0 }, flipped: false };
  }

  // Observation disagrees with the confirmed side — accumulate toward a flip.
  const pendingCount = state.pendingSide === observedSide ? state.pendingCount + 1 : 1;
  if (pendingCount >= requiredTicks) {
    return { state: { side: observedSide, pendingSide: null, pendingCount: 0 }, flipped: true };
  }
  return { state: { side: state.side, pendingSide: observedSide, pendingCount }, flipped: false };
}
