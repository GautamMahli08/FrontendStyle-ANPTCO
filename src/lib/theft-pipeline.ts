// Real fuel-theft detection pipeline (plan doc's "Fuel theft detection"
// section) — replaces the single hardcoded `if (order.clientId === 'client-002')`
// branch that used to fire one scripted anomaly. Real BLE fuel data is noisy
// (sloshing, temperature drift, refill spikes), so a raw level delta floods
// the seller with false positives. The signal that actually matters is a sharp
// drop while STATIONARY, IGNITION OFF, and OUTSIDE any authorized geofence.

import { LatLng, isInsideGeofence } from './geo';
import { TelemetryPoint } from './telemetry-store';

const STATIONARY_SPEED_KMH = 3;
// A drop smaller than this over the smoothing window is jitter, not theft.
const SUSPICIOUS_DROP_L = 150;

/** Moving median over a numeric series — kills sensor jitter without a lag-heavy mean filter. */
export function movingMedian(values: number[], window = 5): number[] {
  return values.map((_, i) => {
    const start = Math.max(0, i - Math.floor(window / 2));
    const slice = [...values.slice(start, i + Math.ceil(window / 2))].sort((a, b) => a - b);
    return slice[Math.floor(slice.length / 2)];
  });
}

export interface GeofenceContext {
  depot: { center: LatLng; radiusM: number };
  destination: { center: LatLng; radiusM: number };
}

export interface TheftEvaluation {
  suspicious: boolean;
  reasoning: string[];
  dropLiters: number;
}

/**
 * Evaluate the most recent telemetry points for a stationary, off-geofence
 * fuel drop. `points` should be time-ordered and already smoothed volumes are
 * derived here (step 1) before correlating against ignition/movement (step 2)
 * and geofence context (step 3).
 */
export function evaluateTheftRisk(points: TelemetryPoint[], ctx: GeofenceContext): TheftEvaluation {
  const reasoning: string[] = [];
  if (points.length < 2) return { suspicious: false, reasoning: ['not enough telemetry yet'], dropLiters: 0 };

  const totalVolumes = points.map(p => (p.compartmentVolumes ?? []).reduce((s, v) => s + v, 0));
  const smoothed = movingMedian(totalVolumes, Math.min(5, totalVolumes.length));

  const latest = points[points.length - 1];
  const dropLiters = Math.max(0, smoothed[smoothed.length - 2] - smoothed[smoothed.length - 1]);

  if (dropLiters < SUSPICIOUS_DROP_L) {
    return { suspicious: false, reasoning: [`smoothed drop ${dropLiters.toFixed(0)}L below ${SUSPICIOUS_DROP_L}L threshold`], dropLiters };
  }
  reasoning.push(`smoothed drop of ${dropLiters.toFixed(0)}L across the last ${smoothed.length} readings`);

  // Step 2 — correlate against ignition + movement: a drop while driving is consumption.
  const moving = latest.speed > STATIONARY_SPEED_KMH || latest.ignition;
  if (moving) {
    return { suspicious: false, reasoning: [...reasoning, 'truck was moving / ignition on — consumption, not theft'], dropLiters };
  }
  reasoning.push('truck stationary with ignition off');

  // Step 3 — geofence context: a drop inside the depot or destination is a legitimate load/unload.
  const point: LatLng = { lat: latest.lat, lng: latest.lng };
  if (isInsideGeofence(point, ctx.depot.center, ctx.depot.radiusM)) {
    return { suspicious: false, reasoning: [...reasoning, 'inside depot geofence — legitimate load/unload'], dropLiters };
  }
  if (isInsideGeofence(point, ctx.destination.center, ctx.destination.radiusM)) {
    return { suspicious: false, reasoning: [...reasoning, 'inside destination geofence — legitimate offload'], dropLiters };
  }
  reasoning.push('outside any authorized geofence');

  return { suspicious: true, reasoning, dropLiters };
}

export interface ReconciliationResult {
  shortfallL: number;
  suspicious: boolean;
  reasoning: string;
}

/** Step 4 — reconcile expected_volume_l (from dispatch) against the sensor-measured delivered volume. */
export function reconcileDelivery(expectedVolumeL: number, deliveredVolumeL: number): ReconciliationResult {
  const shortfallL = Math.max(0, expectedVolumeL - deliveredVolumeL);
  const shortfallPct = expectedVolumeL > 0 ? shortfallL / expectedVolumeL : 0;
  const suspicious = shortfallPct > 0.02 && shortfallL > 20; // >2% and >20L — not just meter rounding
  return {
    shortfallL,
    suspicious,
    reasoning: suspicious
      ? `delivered ${deliveredVolumeL}L vs expected ${expectedVolumeL}L — ${shortfallL}L (${(shortfallPct * 100).toFixed(1)}%) shortfall`
      : `delivered volume reconciles within tolerance (${shortfallL}L short)`,
  };
}
