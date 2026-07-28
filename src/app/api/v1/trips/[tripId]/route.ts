import { NextRequest, NextResponse } from 'next/server';
import { findTrip, updateTripStatus, TripStatus } from '@/src/lib/server/trip-store';

function storeError(err: unknown) {
  return NextResponse.json(
    { error: `dispatch store failure: ${err instanceof Error ? err.message : String(err)}` },
    { status: 500 },
  );
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  try {
    const trip = findTrip(tripId);
    if (!trip) return NextResponse.json({ error: 'trip not found' }, { status: 404 });
    return NextResponse.json({ trip });
  } catch (err) {
    return storeError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { status } = await req.json();
  const valid: TripStatus[] = ['CREATED', 'EN_ROUTE', 'ARRIVED', 'DELIVERED', 'CLOSED', 'CANCELLED'];
  if (!valid.includes(status)) {
    return NextResponse.json({ error: `status must be one of ${valid.join(', ')}` }, { status: 400 });
  }
  try {
    const trip = updateTripStatus(tripId, status);
    if (!trip) return NextResponse.json({ error: 'trip not found' }, { status: 404 });
    return NextResponse.json({ trip });
  } catch (err) {
    return storeError(err);
  }
}
