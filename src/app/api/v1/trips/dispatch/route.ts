// Real implementation of the plan doc's §3 dispatch endpoint: the ERP tells
// the monitoring platform a truck has been dispatched. Enforces the exact
// edge-case table from the plan (unknown truck → 404, truck already on an
// active trip → 409 + existing trip id, duplicate erp_dispatch_no → 200 with
// the existing trip, never a second one).

import { NextRequest, NextResponse } from 'next/server';
import { createTrip, findByDispatchNo, findOpenTripForTruck, listTrips } from '@/src/lib/server/trip-store';

const DEFAULT_GEOFENCE_RADIUS_M = 150;
// Demo stand-in for "does this truck exist in the tenant's fleet" — a real
// implementation would look this up in the trucks table.
const KNOWN_TRUCK_PATTERN = /^TRK-\d+$/;

export async function POST(req: NextRequest) {
  const tenantId = req.headers.get('authorization')?.replace('Bearer ', '') || 'demo-tenant';
  const idempotencyKey = req.headers.get('idempotency-key') ?? undefined;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { truck_ref, driver_ref, erp_dispatch_no, expected_volume_l, product, origin, destination, stops } = body ?? {};

  if (!truck_ref || !erp_dispatch_no || !origin || !destination) {
    return NextResponse.json(
      { error: 'truck_ref, erp_dispatch_no, origin and destination are required' },
      { status: 400 },
    );
  }

  // Duplicate erp_dispatch_no → idempotent replay, regardless of truck state.
  const existingByDispatchNo = findByDispatchNo(tenantId, erp_dispatch_no);
  if (existingByDispatchNo) {
    return NextResponse.json({ trip: existingByDispatchNo, replay: true }, { status: 200 });
  }

  if (!KNOWN_TRUCK_PATTERN.test(truck_ref)) {
    return NextResponse.json({ error: `unknown truck '${truck_ref}'` }, { status: 404 });
  }

  const activeTrip = findOpenTripForTruck(tenantId, truck_ref);
  if (activeTrip) {
    return NextResponse.json(
      { error: 'truck already on an active trip', trip: activeTrip },
      { status: 409 },
    );
  }

  const trip = createTrip({
    tenant_id: tenantId,
    truck_ref,
    driver_ref,
    erp_dispatch_no,
    idempotency_key: idempotencyKey,
    expected_volume_l: Number(expected_volume_l) || 0,
    product,
    origin,
    destination: { geofence_radius_m: DEFAULT_GEOFENCE_RADIUS_M, ...destination },
    stops: Array.isArray(stops) ? stops : [],
    telemetry_status: 'OK',
  });

  return NextResponse.json({ trip, replay: false }, { status: 201 });
}

export async function GET() {
  return NextResponse.json({ trips: listTrips() });
}
