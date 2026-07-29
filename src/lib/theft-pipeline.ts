// Fuel-theft detection.
//
// A raw level delta is a terrible signal on its own: real BLE fuel sensors drift
// with temperature, slosh on every corner, and spike on refill. Alerting on "level
// went down" would bury the operator in false positives. The signal that actually
// means something is a sharp drop while the truck is STATIONARY, IGNITION OFF, and
// OUTSIDE every authorized geofence — everything else has an innocent explanation.
//
// Every stage appends to `reasoning`, so an alert can show *why* it fired (and a
// near-miss can show why it didn't) instead of asserting a hardcoded sentence.

import { LatLng, isInsideGeofence } from './geo';
import { TelemetryPoint } from './telemetry-store';

/** At or below this, the truck counts as stopped rather than crawling. */
const STATIONARY_SPEED_KMH = 3;

/** A smoothed drop smaller than this is sensor jitter, not siphoning. */
export const SUSPICIOUS_DROP_L = 150;

/** Points the detector looks at. Enough to smooth; short enough to stay recent. */
export const DETECTION_WINDOW = 5;

/**
 * Moving median over a numeric series. Median rather than mean on purpose: a single
 * wild reading shifts a mean but leaves a median untouched, which is exactly the
 * behaviour wanted against sensor spikes.
 */
export function movingMedian(values: number[], window = DETECTION_WINDOW): number[] {
  return values.map((_, i) => {
    const start = Math.max(0, i - Math.floor(window / 2));
    const slice = [...values.slice(start, i + Math.ceil(window / 2))].sort((a, b) => a - b);
    return slice[Math.floor(slice.length / 2)];
  });
}

export interface GeofenceContext {
  depot:       { center: LatLng; radiusM: number };
  destination: { center: LatLng; radiusM: number };
}

export interface TheftEvaluation {
  suspicious:  boolean;
  reasoning:   string[];
  dropLiters:  number;
  dropPercent: number;
}

/**
 * Evaluate the most recent telemetry for a stationary, off-geofence fuel drop.
 * `points` must be time-ordered (oldest first).
 */
export function evaluateTheftRisk(points: TelemetryPoint[], ctx: GeofenceContext): TheftEvaluation {
  const reasoning: string[] = [];
  const none = (why: string, dropLiters = 0, dropPercent = 0): TheftEvaluation =>
    ({ suspicious: false, reasoning: [...reasoning, why], dropLiters, dropPercent });

  if (points.length < 2) return none('not enough telemetry recorded yet');

  const totals   = points.map(p => (p.compartmentVolumes ?? []).reduce((s, v) => s + v, 0));
  const smoothed = movingMedian(totals, Math.min(DETECTION_WINDOW, totals.length));

  // Compare the newest smoothed reading against the highest earlier one rather than
  // just the previous sample: siphoning bleeds out gradually, so consecutive ticks
  // differ by very little even while the tank is visibly emptying.
  const latestVolume = smoothed[smoothed.length - 1];
  const peakVolume   = Math.max(...smoothed.slice(0, -1));
  const dropLiters   = Math.max(0, peakVolume - latestVolume);
  const dropPercent  = peakVolume > 0 ? (dropLiters / peakVolume) * 100 : 0;

  if (dropLiters < SUSPICIOUS_DROP_L) {
    return none(`smoothed drop of ${Math.round(dropLiters)}L is below the ${SUSPICIOUS_DROP_L}L noise threshold`, dropLiters, dropPercent);
  }
  reasoning.push(`${Math.round(dropLiters)}L (${Math.round(dropPercent)}%) drop across the last ${smoothed.length} readings`);

  // Stage 2 — motion. Fuel going down while driving is the engine burning it.
  const latest = points[points.length - 1];
  if (latest.speed > STATIONARY_SPEED_KMH || latest.ignition) {
    return none('truck was moving with ignition on — consumption, not theft', dropLiters, dropPercent);
  }
  reasoning.push('truck stationary with ignition off');

  // Stage 3 — place. A drop inside the depot or the destination is a load/offload.
  const at: LatLng = { lat: latest.lat, lng: latest.lng };
  if (isInsideGeofence(at, ctx.depot.center, ctx.depot.radiusM)) {
    return none('inside the depot geofence — legitimate loading', dropLiters, dropPercent);
  }
  if (isInsideGeofence(at, ctx.destination.center, ctx.destination.radiusM)) {
    return none('inside the destination geofence — legitimate offload', dropLiters, dropPercent);
  }
  reasoning.push('outside every authorized geofence');

  return { suspicious: true, reasoning, dropLiters, dropPercent };
}

export interface ReconciliationResult {
  shortfallL: number;
  suspicious: boolean;
  reasoning:  string;
}

/** Compare the volume promised at dispatch against what the sensors say was delivered. */
export function reconcileDelivery(expectedVolumeL: number, deliveredVolumeL: number): ReconciliationResult {
  const shortfallL   = Math.max(0, expectedVolumeL - deliveredVolumeL);
  const shortfallPct = expectedVolumeL > 0 ? shortfallL / expectedVolumeL : 0;
  // Both thresholds must trip: a percentage alone flags tiny orders, litres alone
  // flags huge ones. Together they mean "more than meter rounding".
  const suspicious   = shortfallPct > 0.02 && shortfallL > 20;
  return {
    shortfallL,
    suspicious,
    reasoning: suspicious
      ? `delivered ${deliveredVolumeL.toLocaleString()}L against ${expectedVolumeL.toLocaleString()}L expected — ${shortfallL.toLocaleString()}L (${(shortfallPct * 100).toFixed(1)}%) short`
      : `delivered volume reconciles within tolerance (${shortfallL.toLocaleString()}L short)`,
  };
}
