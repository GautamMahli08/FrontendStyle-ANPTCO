import { NextRequest, NextResponse } from 'next/server';

// Server-side OSRM proxy.
// Two modes:
//   ?olng=&olat=&dlng=&dlat=          → OSRM route (origin to destination)
//   ?match=1&coords=lng,lat;lng,lat;… → OSRM map match (snap GPS points to roads)
// Running server-side avoids browser CORS / network restrictions.
// Results cached 1 h — same route doesn't change between requests.

const OSRM = 'https://router.project-osrm.org';
const CACHE = { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } };

async function osrmFetch(url: string): Promise<NextResponse> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ANPTCO-FleetApp/1.0' },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return NextResponse.json({ error: `OSRM ${res.status}` }, { status: 502 });
  const data = await res.json();
  return NextResponse.json(data, CACHE);
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;

  // ?pts=lng,lat;lng,lat;... → OSRM route through multiple waypoints
  // Handles both origin→dest (2 pts) and multi-waypoint GPS routes
  const pts = p.get('pts');
  if (!pts) return NextResponse.json({ error: 'missing pts' }, { status: 400 });

  const url = `${OSRM}/route/v1/driving/${pts}?overview=full&geometries=geojson`;
  console.log('[osrm-proxy] calling:', url.slice(0, 200));
  try {
    const result = await osrmFetch(url);
    console.log('[osrm-proxy] status:', result.status);
    return result;
  } catch (err: unknown) {
    console.error('[osrm-proxy] error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'route failed' }, { status: 502 });
  }
}
