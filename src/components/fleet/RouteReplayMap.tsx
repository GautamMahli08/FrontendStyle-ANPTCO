'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Replay of a truck's actual recorded telemetry_history (plan §5's "two-tier
 * storage" — this is the tier that powers route replay). The connecting line
 * is the same OSRM road geometry the live map draws (src/lib/route-geometry.ts
 * — passed in as `roadRoute`, already fetched/cached during the trip), so the
 * replay hugs actual roads instead of straight segments between samples; the
 * recorded telemetry fixes themselves are overlaid as dots on top of it.
 */
export default function RouteReplayMap({
  points,
  roadRoute,
  className = '',
}: {
  points: { lat: number; lng: number }[];
  roadRoute?: { lat: number; lng: number }[] | null;
  className?: string;
}) {
  const elRef  = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!elRef.current || points.length === 0) return;
    const map = L.map(elRef.current, { zoomControl: true, attributionControl: false, dragging: true, scrollWheelZoom: false });
    mapRef.current = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

    const fixLatLngs = points.map(p => [p.lat, p.lng] as [number, number]);
    const hasRoad = !!roadRoute && roadRoute.length > 1;
    const roadLatLngs = hasRoad ? roadRoute!.map(p => [p.lat, p.lng] as [number, number]) : fixLatLngs;

    // Primary line: OSRM road geometry when available, straight segments between
    // recorded fixes as a fallback (e.g. route hadn't finished fetching yet).
    const line = L.polyline(roadLatLngs, { color: '#2563eb', weight: 3, opacity: hasRoad ? 0.55 : 0.8 }).addTo(map);

    // Recorded telemetry fixes overlaid as dots — the actual sampled points,
    // sitting on top of the smooth road line they were snapped to.
    fixLatLngs.forEach((ll, i) => {
      const isEndpoint = i === 0 || i === fixLatLngs.length - 1;
      if (!isEndpoint) {
        L.circleMarker(ll, { radius: 3, color: '#1d4ed8', fillColor: '#1d4ed8', fillOpacity: 0.9, weight: 1 }).addTo(map);
      }
    });
    L.circleMarker(fixLatLngs[0], { radius: 6, color: '#10b981', fillColor: '#10b981', fillOpacity: 1 })
      .addTo(map).bindPopup('Start');
    L.circleMarker(fixLatLngs[fixLatLngs.length - 1], { radius: 6, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 1 })
      .addTo(map).bindPopup('Latest recorded fix');

    map.fitBounds(line.getBounds().pad(0.2));
    setTimeout(() => map.invalidateSize(), 0);

    return () => { map.remove(); mapRef.current = null; };
  }, [points, roadRoute]);

  if (points.length === 0) {
    return (
      <div className={`flex items-center justify-center text-sm text-gray-400 bg-slate-50 ${className}`}>
        No telemetry recorded yet
      </div>
    );
  }

  return <div ref={elRef} className={`relative z-0 ${className}`} />;
}
