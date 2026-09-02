'use client';

import L from 'leaflet';
import { Fragment, useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Circle, CircleMarker, Marker, Tooltip, useMap } from 'react-leaflet';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export interface TripEvent {
  id:        string;
  lat:       number;
  lng:       number;
  color:     string;
  label:     string;
  time:      string;
  eventType: string; // original event_type — used for map filter
  count?:    number;   // grouped stop markers: total stops at this location
  times?:    string[]; // individual stop times when count > 1
}

export interface TripRoute {
  id:        string;
  color:     string;
  originLat: number;
  originLng: number;
  destLat:   number;
  destLng:   number;
  events:    TripEvent[];
  gpsTrack:  [number, number][]; // actual GPS breadcrumbs from asset events, oldest→newest
}

export interface GeofenceZone {
  id:     string;
  lat:    number;
  lng:    number;
  radius: number; // metres
  name:   string;
  type:   'depot' | 'station';
}

const DEFAULT_CENTER: [number, number] = [23.5937, 58.5];

function FitSelected({ selected, allRoutes }: { selected: TripRoute | null; allRoutes: TripRoute[] }) {
  const map    = useMap();
  const lastId = useRef<string | null>(null);
  useEffect(() => {
    const target = selected ?? allRoutes[0] ?? null;
    if (!target || target.id === lastId.current) return;
    lastId.current = target.id;
    const pts: [number, number][] = [
      [target.originLat, target.originLng],
      [target.destLat,   target.destLng],
      ...target.gpsTrack,
    ];
    if (pts.length === 1) { map.setView(pts[0], 12); return; }
    map.fitBounds(L.latLngBounds(pts), { padding: [56, 56] });
  }, [selected, allRoutes, map]);
  return null;
}

function RouteLayer({
  r,
  pts,
  routed,
  selected,
  onSelect,
  visibleTypes,
}: {
  r:             TripRoute;
  pts:           [number, number][];
  routed:        boolean;
  selected:      boolean;
  onSelect:      () => void;
  visibleTypes?: Set<string>;
}) {
  const weight     = selected ? 6  : 4;
  const haloWeight = selected ? 11 : 8;
  const opacity    = selected ? 1  : 0.78;
  const dash       = routed ? undefined : '10 7';

  return (
    <Fragment>
      <Polyline
        positions={pts}
        pathOptions={{ color: 'white', weight: haloWeight, opacity: routed ? 0.9 : 0.45, lineCap: 'round', lineJoin: 'round', dashArray: dash }}
      />
      <Polyline
        positions={pts}
        pathOptions={{ color: r.color, weight, opacity: routed ? opacity : opacity * 0.55, lineCap: 'round', lineJoin: 'round', dashArray: dash }}
        eventHandlers={{ click: onSelect }}
      />

      {/* Event markers — filtered by visibleTypes selection */}
      {r.events.filter(ev => !visibleTypes || visibleTypes.has(ev.eventType)).map(ev => {
        const isGrouped = ev.count && ev.count > 1;

        if (isGrouped) {
          // Count badge marker — shows how many stops happened at this location
          const icon = L.divIcon({
            html: `<div style="
              background:${ev.color};color:#fff;
              width:${selected ? 28 : 22}px;height:${selected ? 28 : 22}px;
              border-radius:50%;border:2.5px solid white;
              display:flex;align-items:center;justify-content:center;
              font-size:${selected ? 11 : 9}px;font-weight:800;
              box-shadow:0 2px 6px rgba(0,0,0,0.35);
              cursor:pointer;
            ">${ev.count}</div>`,
            className: '',
            iconSize:   [selected ? 28 : 22, selected ? 28 : 22],
            iconAnchor: [selected ? 14 : 11, selected ? 14 : 11],
          });
          return (
            <Marker key={ev.id} position={[ev.lat, ev.lng]} icon={icon}
              eventHandlers={{ click: e => { (e.originalEvent as Event).stopPropagation(); } }}
            >
              <Tooltip direction="top" offset={[0, -(selected ? 16 : 13)]} opacity={0.95}>
                <div style={{ fontSize: 11, lineHeight: 1.5 }}>
                  <b style={{ display: 'block' }}>{ev.label}</b>
                  {ev.times?.map((t, i) => (
                    <span key={i} style={{ display: 'block', color: '#64748b' }}>{t}</span>
                  ))}
                </div>
              </Tooltip>
            </Marker>
          );
        }

        return (
          <Fragment key={ev.id}>
            <CircleMarker
              center={[ev.lat, ev.lng]}
              radius={selected ? 14 : 10}
              pathOptions={{ color: 'white', fillColor: 'white', fillOpacity: 1, weight: 0 }}
            />
            <CircleMarker
              center={[ev.lat, ev.lng]}
              radius={selected ? 10 : 7}
              pathOptions={{ color: 'white', fillColor: ev.color, fillOpacity: 1, weight: selected ? 2.5 : 2 }}
              eventHandlers={{ click: e => { e.originalEvent.stopPropagation(); } }}
            >
              <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
                <div style={{ fontSize: 11, lineHeight: 1.4 }}>
                  <b style={{ display: 'block' }}>{ev.label}</b>
                  <span style={{ color: '#64748b' }}>{ev.time}</span>
                </div>
              </Tooltip>
            </CircleMarker>
          </Fragment>
        );
      })}

      {/* Origin dot (depot) */}
      <CircleMarker
        center={[r.originLat, r.originLng]}
        radius={selected ? 11 : 8}
        pathOptions={{ color: 'white', fillColor: r.color, fillOpacity: 1, weight: 3 }}
      >
        <Tooltip direction="top" offset={[0, -8]} opacity={0.92}>
          <span style={{ fontSize: 11 }}>Depot</span>
        </Tooltip>
      </CircleMarker>

      {/* Destination dot */}
      <CircleMarker
        center={[r.destLat, r.destLng]}
        radius={selected ? 12 : 9}
        pathOptions={{ color: r.color, fillColor: 'white', fillOpacity: 1, weight: selected ? 4 : 3 }}
      >
        <Tooltip direction="top" offset={[0, -8]} opacity={0.92}>
          <span style={{ fontSize: 11 }}>Destination</span>
        </Tooltip>
      </CircleMarker>
    </Fragment>
  );
}

// One component per route — each manages its own OSRM fetch independently.
// This mirrors FleetMap's RoutePolyline pattern: parent re-renders don't abort
// in-flight OSRM requests because each route's useEffect only depends on its
// own coordinates, not the parent routes array.
function TripRouteLayer({
  r,
  selected,
  onSelect,
  visibleTypes,
}: {
  r:             TripRoute;
  selected:      boolean;
  onSelect:      () => void;
  visibleTypes?: Set<string>;
}) {
  const straight: [number, number][] = [[r.originLat, r.originLng], [r.destLat, r.destLng]];
  const [roadPts, setRoadPts] = useState<[number, number][] | null>(null);

  // Build waypoint string: GPS span check to avoid depot-cluster-only routes
  const waypoints = (() => {
    if (r.gpsTrack.length >= 2) {
      const lats    = r.gpsTrack.map(([lat]) => lat);
      const lngs    = r.gpsTrack.map(([, lng]) => lng);
      const latSpan = Math.max(...lats) - Math.min(...lats);
      const lngSpan = Math.max(...lngs) - Math.min(...lngs);
      if (latSpan > 0.01 || lngSpan > 0.01) {
        const step   = Math.max(1, Math.floor(r.gpsTrack.length / 12));
        const sample: [number, number][] = [r.gpsTrack[0]];
        for (let i = step; i < r.gpsTrack.length - 1; i += step) sample.push(r.gpsTrack[i]);
        sample.push(r.gpsTrack[r.gpsTrack.length - 1]);
        return sample.map(([lat, lng]) => `${lng},${lat}`).join(';');
      }
    }
    return `${r.originLng},${r.originLat};${r.destLng},${r.destLat}`;
  })();

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const url =
          `https://router.project-osrm.org/route/v1/driving/${waypoints}` +
          `?overview=full&geometries=geojson`;
        const res  = await fetch(url, { signal: ctrl.signal });
        const data = await res.json();
        const coords: number[][] | undefined = data.routes?.[0]?.geometry?.coordinates;
        if (coords && coords.length > 0) {
          setRoadPts(coords.map(([lng, lat]) => [lat, lng] as [number, number]));
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') console.warn('[TripHistoryMap] OSRM failed:', r.id, (e as Error).message);
      }
    }, 300);
    return () => { clearTimeout(timer); ctrl.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoints]);

  const pts    = roadPts ?? (r.gpsTrack.length >= 2 ? r.gpsTrack : straight);
  const routed = !!roadPts;

  return (
    <RouteLayer
      r={r}
      pts={pts}
      routed={routed}
      selected={selected}
      onSelect={onSelect}
      visibleTypes={visibleTypes}
    />
  );
}

export default function TripHistoryMap({
  routes,
  selectedId,
  onSelect,
  visibleTypes,
  geofences = [],
}: {
  routes:        TripRoute[];
  selectedId:    string | null;
  onSelect:      (id: string) => void;
  visibleTypes?: Set<string>;
  geofences?:    GeofenceZone[];
}) {
  const centre: [number, number] = routes.length > 0
    ? [routes[0].originLat, routes[0].originLng]
    : DEFAULT_CENTER;

  const unselected = routes.filter(r => r.id !== selectedId);
  const selected   = routes.find(r => r.id === selectedId) ?? null;

  return (
    <MapContainer
      center={centre}
      zoom={9}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <FitSelected selected={selected} allRoutes={routes} />

      {/* Geofence zones — rendered first so route lines appear on top */}
      {geofences.map(g => {
        const isDepot   = g.type === 'depot';
        const color     = isDepot ? '#7c3aed' : '#0369a1';
        const labelIcon = L.divIcon({
          html: `<div style="
            background:${color};color:#fff;
            padding:2px 8px;border-radius:12px;
            font-size:11px;font-weight:700;white-space:nowrap;
            box-shadow:0 2px 6px rgba(0,0,0,0.22);
          ">${isDepot ? '🏭' : '📍'} ${g.name}</div>`,
          className:  '',
          iconAnchor: [0, 0],
        });
        return (
          <Fragment key={g.id}>
            <Circle
              center={[g.lat, g.lng]}
              radius={g.radius}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: 0.08,
                weight: 2,
                dashArray: '6 4',
              }}
            />
            <Marker position={[g.lat, g.lng]} icon={labelIcon} />
          </Fragment>
        );
      })}

      {/* Only show other routes when nothing is selected — selecting a trip focuses the map on that trip only */}
      {!selectedId && unselected.map(r => (
        <TripRouteLayer
          key={r.id}
          r={r}
          selected={false}
          onSelect={() => onSelect(r.id)}
          visibleTypes={visibleTypes}
        />
      ))}

      {selected && (
        <TripRouteLayer
          key={`sel-${selected.id}`}
          r={selected}
          selected
          onSelect={() => onSelect(selected.id)}
          visibleTypes={visibleTypes}
        />
      )}
    </MapContainer>
  );
}
