'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * LiveTrackingMap — real (OpenStreetMap / Leaflet) map showing trucks driving from
 * the ANPTCO depot to their destination stations. Each truck's position is
 * interpolated from its journey progress and updated a few times a second, so the
 * seller sees the truck move along the route in real time.
 *
 * Must be imported with `next/dynamic` + `ssr: false` (Leaflet touches `window`).
 */

export type Journey = {
  id: string;
  truckReg: string;
  status: string;                                   // EN_ROUTE | ARRIVED
  depot: { lat: number; lng: number; name: string };
  dest:  { lat: number; lng: number; name: string };
  startedAt: number;                                // ms epoch
  durationMs: number;
  // When set, the truck marker sits at this fixed point instead of the
  // time-based road interpolation — used for "stopped here" / "last known
  // position" alert states, where the map should keep rendering (same
  // depot/destination/route context) rather than being swapped for a
  // generic placeholder, but the truck itself isn't actually progressing.
  frozenPosition?: { lat: number; lng: number };
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Straight depot → destination line. Used only as an instant fallback while the
 * real road geometry is being fetched (or if the routing service is unreachable).
 */
function getRoutePath(depot: Journey['depot'], dest: Journey['dest']): [number, number][] {
  return [
    [depot.lat, depot.lng],
    [dest.lat, dest.lng],
  ];
}

/**
 * Fetch the actual road-following route between two points from the public OSRM
 * server (same OpenStreetMap road network the tiles are drawn from), so trucks
 * drive along real highways instead of cutting across the Gulf of Oman.
 * Returns the path as [lat, lng] pairs, or null if the request fails.
 */
async function fetchRoadRoute(
  depot: Journey['depot'],
  dest: Journey['dest'],
): Promise<[number, number][] | null> {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${depot.lng},${depot.lat};${dest.lng},${dest.lat}` +
      `?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const coords = data?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    // OSRM returns [lng, lat]; Leaflet wants [lat, lng].
    return coords.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
  } catch {
    return null;
  }
}

function routeLength(path: [number, number][]) {
  let total = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    total += L.latLng(path[i]).distanceTo(L.latLng(path[i + 1]));
  }
  return total;
}

function routePosition(path: [number, number][], t: number): [number, number] {
  if (t <= 0) return path[0];
  if (t >= 1) return path[path.length - 1];

  const total = routeLength(path);
  let remaining = total * t;

  for (let i = 0; i < path.length - 1; i += 1) {
    const start = L.latLng(path[i]);
    const end = L.latLng(path[i + 1]);
    const segDist = start.distanceTo(end);
    if (remaining <= segDist || i === path.length - 2) {
      const ratio = segDist === 0 ? 0 : remaining / segDist;
      return [lerp(start.lat, end.lat, ratio), lerp(start.lng, end.lng, ratio)];
    }
    remaining -= segDist;
  }

  return path[path.length - 1];
}

function progress(j: Journey): number {
  if (j.status === 'ARRIVED') return 1;
  if (!j.startedAt) return 0;
  return Math.max(0, Math.min(1, (Date.now() - j.startedAt) / j.durationMs));
}

function pinIcon(emoji: string, bg: string, size = 30) {
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;
      background:${bg};border-radius:50% 50% 50% 0;transform:rotate(-45deg);
      box-shadow:0 2px 6px rgba(0,0,0,.3);border:2px solid white;">
      <span style="transform:rotate(45deg);font-size:${Math.round(size * 0.5)}px;line-height:1;">${emoji}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}

function truckIcon(j: Journey) {
  const bg = j.frozenPosition ? '#dc2626' : j.status === 'ARRIVED' ? '#10b981' : '#f59e0b';
  const emoji = j.frozenPosition ? '🛑' : '🚛';
  return L.divIcon({
    className: '',
    html: `<div style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;
      background:${bg};border-radius:9px;color:white;font-size:17px;
      box-shadow:0 3px 8px rgba(0,0,0,.35);border:2px solid white;">${emoji}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
}

type Layer = { dest: L.Marker; line: L.Polyline; truck: L.Marker };

export default function LiveTrackingMap({
  journeys,
  className = '',
}: {
  journeys: Journey[];
  className?: string;
}) {
  const elRef     = useRef<HTMLDivElement>(null);
  const mapRef    = useRef<L.Map | null>(null);
  const depotRef  = useRef<L.Marker | null>(null);
  const layersRef = useRef<Map<string, Layer>>(new Map());
  const routesRef = useRef<Map<string, [number, number][]>>(new Map());
  const dataRef   = useRef<Journey[]>(journeys);
  dataRef.current = journeys;

  // Fetch the real road route for each journey once, then snap its polyline (and
  // the truck's path) onto the actual highway geometry.
  useEffect(() => {
    journeys.forEach(j => {
      if (routesRef.current.has(j.id)) return;
      routesRef.current.set(j.id, getRoutePath(j.depot, j.dest)); // placeholder; prevents refetch
      fetchRoadRoute(j.depot, j.dest).then(path => {
        if (!path) return;
        routesRef.current.set(j.id, path);
        const layer = layersRef.current.get(j.id);
        if (layer) layer.line.setLatLngs(path);
      });
    });
  }, [journeys]);

  // Create the map once.
  useEffect(() => {
    if (mapRef.current || !elRef.current) return;
    const map = L.map(elRef.current, { zoomControl: true, attributionControl: false })
      .setView([23.61, 58.36], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    // container is sized by the parent; make sure Leaflet measures it after layout
    setTimeout(() => map.invalidateSize(), 0);
    return () => { map.remove(); mapRef.current = null; depotRef.current = null; layersRef.current.clear(); };
  }, []);

  // Reconcile layers + animate truck positions on a fast tick.
  useEffect(() => {
    const tick = () => {
      const map = mapRef.current;
      if (!map) return;
      const js = dataRef.current;

      // Depot marker (once).
      if (!depotRef.current && js[0]) {
        depotRef.current = L.marker([js[0].depot.lat, js[0].depot.lng], { icon: pinIcon('🏭', '#2563eb', 34) })
          .addTo(map)
          .bindPopup(`<b>${js[0].depot.name}</b><br/>Depot`);
      }

      const seen = new Set<string>();
      js.forEach(j => {
        seen.add(j.id);
        const route = routesRef.current.get(j.id) ?? getRoutePath(j.depot, j.dest);
        const [lat, lng] = j.frozenPosition
          ? [j.frozenPosition.lat, j.frozenPosition.lng]
          : routePosition(route, progress(j));

        let layer = layersRef.current.get(j.id);
        if (!layer) {
          const dest = L.marker([j.dest.lat, j.dest.lng], { icon: pinIcon('📍', '#0891b2', 28) })
            .addTo(map).bindPopup(`<b>${j.dest.name}</b><br/>Destination`);
          const line = L.polyline(route,
            { color: '#2563eb', weight: 3, dashArray: '6,8', opacity: 0.45 }).addTo(map);
          const truck = L.marker([lat, lng], { icon: truckIcon(j) })
            .addTo(map).bindPopup(`<b>🚛 ${j.truckReg}</b>`);
          layersRef.current.set(j.id, { dest, line, truck });
        } else {
          layer.truck.setLatLng([lat, lng]);
          layer.truck.setIcon(truckIcon(j));
        }
      });

      // Drop layers for journeys that ended.
      layersRef.current.forEach((layer, id) => {
        if (!seen.has(id)) {
          layer.dest.remove(); layer.line.remove(); layer.truck.remove();
          layersRef.current.delete(id);
          routesRef.current.delete(id);
        }
      });
    };

    tick();
    const iv = setInterval(tick, 250);
    return () => clearInterval(iv);
  }, []);

  // `relative z-0` traps Leaflet's internal pane/control z-indexes (up to ~1000) inside
  // this container's own stacking context, so they don't paint over the header dropdown.
  return <div ref={elRef} className={`relative z-0 ${className}`} />;
}
