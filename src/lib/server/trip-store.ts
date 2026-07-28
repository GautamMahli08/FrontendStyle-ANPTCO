// Server-side "system of record" for dispatched trips — a JSON file standing
// in for the Postgres `trip` table from the plan doc (Step 4). Only ever
// imported by route handlers (src/app/api/**/route.ts), never by client
// components, since it uses Node's `fs`.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// process.cwd() is the deployed app bundle on most serverless hosts (Vercel,
// Netlify, etc.) and is read-only there — writing there throws EROFS, which
// surfaced to users as an opaque "HTTP 500 — unknown error". os.tmpdir() is
// writable in those environments (though not persistent across cold starts —
// fine for a demo; a real deployment would use an actual database here).
const TRIPS_FILE = join(tmpdir(), 'xyz-monitoring-dispatch-log.json');

export type TripStatus = 'CREATED' | 'EN_ROUTE' | 'ARRIVED' | 'DELIVERED' | 'CLOSED' | 'CANCELLED';
const OPEN_STATUSES: TripStatus[] = ['CREATED', 'EN_ROUTE', 'ARRIVED', 'DELIVERED'];

export interface GeoPoint {
  name: string;
  latitude: number;
  longitude: number;
}

export interface Trip {
  trip_id: string;
  tenant_id: string;
  truck_ref: string;
  driver_ref?: string;
  erp_dispatch_no: string;
  idempotency_key?: string;
  expected_volume_l: number;
  product?: string;
  origin: GeoPoint;
  destination: GeoPoint & { geofence_radius_m: number };
  stops: unknown[];
  status: TripStatus;
  telemetry_status?: 'OK' | 'NO_SIGNAL';
  created_at: string;
  updated_at: string;
}

function readTrips(): Trip[] {
  try {
    if (!existsSync(TRIPS_FILE)) return [];
    return JSON.parse(readFileSync(TRIPS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeTrips(trips: Trip[]) {
  writeFileSync(TRIPS_FILE, JSON.stringify(trips, null, 2), 'utf8');
}

export function listTrips(): Trip[] {
  return readTrips();
}

export function findByDispatchNo(tenantId: string, erpDispatchNo: string): Trip | undefined {
  return readTrips().find(t => t.tenant_id === tenantId && t.erp_dispatch_no === erpDispatchNo);
}

export function findOpenTripForTruck(tenantId: string, truckRef: string): Trip | undefined {
  return readTrips().find(
    t => t.tenant_id === tenantId && t.truck_ref === truckRef && OPEN_STATUSES.includes(t.status),
  );
}

let seq = readTrips().length;
function nextTripId(): string {
  seq += 1;
  return `T-${500 + seq}`;
}

export function createTrip(input: Omit<Trip, 'trip_id' | 'status' | 'created_at' | 'updated_at'>): Trip {
  const trips = readTrips();
  const now = new Date().toISOString();
  const trip: Trip = { ...input, trip_id: nextTripId(), status: 'CREATED', created_at: now, updated_at: now };
  trips.push(trip);
  writeTrips(trips);
  return trip;
}

export function updateTripStatus(tripId: string, status: TripStatus): Trip | undefined {
  const trips = readTrips();
  const idx = trips.findIndex(t => t.trip_id === tripId);
  if (idx === -1) return undefined;
  trips[idx] = { ...trips[idx], status, updated_at: new Date().toISOString() };
  writeTrips(trips);
  return trips[idx];
}

export function findTrip(tripId: string): Trip | undefined {
  return readTrips().find(t => t.trip_id === tripId);
}
