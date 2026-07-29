// Recorded telemetry — the substrate theft detection runs on.
//
// Everywhere else in the demo, fuel level is *derived* on demand from an order's
// status plus elapsed time (see orderFuelTelemetry). That's fine for drawing a
// gauge, but a detector can't work on it: there's no history to smooth, and no
// before/after to compare. So EN_ROUTE ticks are also *recorded* here as discrete
// points, mirroring how a real Galileosky/flespi feed would arrive.
//
// Two tiers, matching the production design in docs/LOCATION_GEOFENCE_SERVICE.md:
//   · live state — latest point per truck (upsert)
//   · history    — the point stream per truck, capped for browser storage

export interface TelemetryPoint {
  truckId: string;
  deviceId: string;
  lat: number;
  lng: number;
  speed: number;      // km/h
  ignition: boolean;
  ts: number;         // epoch ms
  compartmentVolumes: number[];  // litres per compartment at this tick
}

const LIVE_KEY    = 'fuel_truck_live_state';
const HISTORY_KEY = 'fuel_telemetry_history';

// Every truck × every poll adds up fast in localStorage — keep a rolling window.
// The detector only ever looks at the last handful of points.
const HISTORY_RETENTION_PER_TRUCK = 200;

type LiveStateMap = Record<string, TelemetryPoint>;
type HistoryMap   = Record<string, TelemetryPoint[]>;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

export const getLiveState = (truckId: string): TelemetryPoint | undefined =>
  readJson<LiveStateMap>(LIVE_KEY, {})[truckId];

export const getHistory = (truckId: string): TelemetryPoint[] =>
  readJson<HistoryMap>(HISTORY_KEY, {})[truckId] ?? [];

/**
 * Ingest one point: dedup on (deviceId, ts), append to history, upsert live state.
 * Real feeds arrive out of order and re-send, so neither is assumed.
 */
export function ingestTelemetry(point: TelemetryPoint): { deduped: boolean } {
  const history      = readJson<HistoryMap>(HISTORY_KEY, {});
  const truckHistory = history[point.truckId] ?? [];

  if (truckHistory.some(p => p.deviceId === point.deviceId && p.ts === point.ts)) {
    return { deduped: true };
  }

  history[point.truckId] = [...truckHistory, point]
    .sort((a, b) => a.ts - b.ts)
    .slice(-HISTORY_RETENTION_PER_TRUCK);
  writeJson(HISTORY_KEY, history);

  const live = readJson<LiveStateMap>(LIVE_KEY, {});
  // Only advance live state on a genuinely newer fix — a late-arriving old point
  // belongs in history but must not rewind "where is this truck now".
  if (!live[point.truckId] || point.ts >= live[point.truckId].ts) {
    live[point.truckId] = point;
    writeJson(LIVE_KEY, live);
  }

  return { deduped: false };
}

export function clearTelemetry(truckId?: string) {
  if (typeof window === 'undefined') return;
  if (!truckId) {
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(LIVE_KEY);
    return;
  }
  const history = readJson<HistoryMap>(HISTORY_KEY, {});
  delete history[truckId];
  writeJson(HISTORY_KEY, history);

  const live = readJson<LiveStateMap>(LIVE_KEY, {});
  delete live[truckId];
  writeJson(LIVE_KEY, live);
}
