// Browser-side helper for calling the real dispatch API (src/app/api/v1/trips)
// from the existing order-assignment flow, without changing the Order model.
// The returned `trip_id` is stored back on the order so later stages (arrival,
// theft, delivery) can update the same server-side trip.

export interface DispatchInput {
  truckRef: string;
  driverRef?: string;
  erpDispatchNo: string;
  expectedVolumeL: number;
  product?: string;
  origin: { name: string; latitude: number; longitude: number };
  destination: { name: string; latitude: number; longitude: number; geofenceRadiusM: number };
}

export interface DispatchResult {
  ok: boolean;
  status: number;
  tripId?: string;
  replay?: boolean;
  error?: string;
}

export async function dispatchTrip(input: DispatchInput): Promise<DispatchResult> {
  try {
    const res = await fetch('/api/v1/trips/dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `${input.erpDispatchNo}-${Date.now()}`,
        Authorization: 'Bearer demo-tenant',
      },
      body: JSON.stringify({
        truck_ref: input.truckRef,
        driver_ref: input.driverRef,
        erp_dispatch_no: input.erpDispatchNo,
        expected_volume_l: input.expectedVolumeL,
        product: input.product,
        origin: input.origin,
        destination: {
          name: input.destination.name,
          latitude: input.destination.latitude,
          longitude: input.destination.longitude,
          geofence_radius_m: input.destination.geofenceRadiusM,
        },
        stops: [],
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, status: res.status, tripId: body.trip?.trip_id, replay: !!body.replay };
    return { ok: false, status: res.status, tripId: body.trip?.trip_id, error: body.error };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : 'network error' };
  }
}

export async function updateTripStatus(tripId: string, status: string): Promise<void> {
  try {
    await fetch(`/api/v1/trips/${tripId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  } catch {
    // best-effort — the demo's own localStorage order status remains the source of truth for the UI
  }
}
