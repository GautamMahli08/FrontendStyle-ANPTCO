// Time-versioned device↔truck assignment (plan §1's "key fix"). A GPS unit or
// fuel sensor will eventually get swapped between trucks — if IMEI→truck were
// a single overwritable field (as `Truck.galileoskyDeviceId` was), every
// reassignment would silently misattribute all historical telemetry. Always
// resolve device → truck as of the telemetry timestamp, never "current".

export type DeviceKind = 'GPS' | 'FUEL_SENSOR';

export interface DeviceAssignment {
  deviceId: string;
  truckId: string;
  kind: DeviceKind;
  validFrom: number; // epoch ms
  validTo: number | null; // null = current
}

const KEY = 'device_assignments';

function readAll(): DeviceAssignment[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

function writeAll(rows: DeviceAssignment[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(rows));
}

export function getAssignmentHistory(truckId: string): DeviceAssignment[] {
  return readAll()
    .filter(r => r.truckId === truckId)
    .sort((a, b) => b.validFrom - a.validFrom);
}

export function getCurrentAssignment(truckId: string, kind: DeviceKind = 'GPS'): DeviceAssignment | undefined {
  return readAll().find(r => r.truckId === truckId && r.kind === kind && r.validTo === null);
}

/** Resolve which truck a device belonged to at a given telemetry timestamp — not "current". */
export function resolveTruckForDevice(deviceId: string, ts: number, kind: DeviceKind = 'GPS'): string | undefined {
  return readAll().find(
    r => r.deviceId === deviceId && r.kind === kind && r.validFrom <= ts && (r.validTo === null || ts < r.validTo),
  )?.truckId;
}

/**
 * Assign a device to a truck as of now. Closes out (`validTo = now`) whatever
 * assignment previously held that truck+kind, so history is append-only —
 * never mutated in place.
 */
export function assignDevice(truckId: string, deviceId: string, kind: DeviceKind = 'GPS'): DeviceAssignment {
  const rows = readAll();
  const now = Date.now();

  const closed = rows.map(r =>
    r.truckId === truckId && r.kind === kind && r.validTo === null ? { ...r, validTo: now } : r,
  );

  const next: DeviceAssignment = { deviceId, truckId, kind, validFrom: now, validTo: null };
  writeAll([...closed, next]);
  return next;
}
