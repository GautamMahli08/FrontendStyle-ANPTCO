// Two-tier telemetry storage (plan §5): `truck_live_state` (latest reading per
// truck, upsert — powers the live map) and `telemetry_history` (the full point
// stream per truck, capped/retained — powers route replay and the theft
// pipeline). Dedups on (deviceId, ts) since real GPS feeds arrive out of order
// and duplicated; never assume monotonic arrival.

export interface TelemetryPoint {
  truckId: string;
  deviceId: string;
  lat: number;
  lng: number;
  speed: number;
  ignition: boolean;
  ts: number; // epoch ms
  compartmentVolumes?: number[]; // per-compartment litres at this tick
}

const LIVE_KEY = 'truck_live_state';
const HISTORY_KEY = 'telemetry_history';
// Every truck × every ~2s adds up fast in a browser demo too — cap per-truck history.
const HISTORY_RETENTION_PER_TRUCK = 300;

type LiveStateMap = Record<string, TelemetryPoint>;
type HistoryMap = Record<string, TelemetryPoint[]>;

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

export function getLiveState(truckId: string): TelemetryPoint | undefined {
  return readJson<LiveStateMap>(LIVE_KEY, {})[truckId];
}

export function getAllLiveStates(): LiveStateMap {
  return readJson<LiveStateMap>(LIVE_KEY, {});
}

export function getHistory(truckId: string): TelemetryPoint[] {
  return readJson<HistoryMap>(HISTORY_KEY, {})[truckId] ?? [];
}

/** Ingest one telemetry point: dedup on (deviceId, ts), upsert live state, append history. */
export function ingestTelemetry(point: TelemetryPoint): { deduped: boolean } {
  const history = readJson<HistoryMap>(HISTORY_KEY, {});
  const truckHistory = history[point.truckId] ?? [];

  const isDuplicate = truckHistory.some(p => p.deviceId === point.deviceId && p.ts === point.ts);
  if (isDuplicate) return { deduped: true };

  const updatedHistory = [...truckHistory, point]
    .sort((a, b) => a.ts - b.ts)
    .slice(-HISTORY_RETENTION_PER_TRUCK);
  history[point.truckId] = updatedHistory;
  writeJson(HISTORY_KEY, history);

  const live = readJson<LiveStateMap>(LIVE_KEY, {});
  const current = live[point.truckId];
  if (!current || point.ts >= current.ts) {
    live[point.truckId] = point;
    writeJson(LIVE_KEY, live);
  }

  return { deduped: false };
}

export function clearTruckTelemetry(truckId: string) {
  const history = readJson<HistoryMap>(HISTORY_KEY, {});
  delete history[truckId];
  writeJson(HISTORY_KEY, history);

  const live = readJson<LiveStateMap>(LIVE_KEY, {});
  delete live[truckId];
  writeJson(LIVE_KEY, live);
}
