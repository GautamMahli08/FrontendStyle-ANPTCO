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
  // True for a trip still en route (not yet ARRIVED/COMPLETED/CANCELLED) — draws
  // a second, lightly-styled segment from the truck's current position straight
  // to the destination via a simple 2-point OSRM call, same approach FleetMap
  // uses for its always-accurate "where it's headed" line.
  showRemainingRoute?: boolean;
  // True when gpsTrack is a synthesized origin->live-position fallback (too few
  // real asset_events to plot yet), not genuinely recorded breadcrumbs — draw it
  // road-snapped like the other estimated segments instead of a raw straight line.
  gpsTrackIsEstimated?: boolean;
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

// Faded background reference showing the full planned road route from origin
// to destination via a simple 2-point OSRM call. Purely context — the actual
// recorded GPS trail draws on top of this as the real, ground-truth highlight,
// so the two together read as "planned path" vs "what actually happened".
function PlannedRouteLayer({
  fromLat, fromLng, toLat, toLng,
}: {
  fromLat: number; fromLng: number; toLat: number; toLng: number;
}) {
  const straight: [number, number][] = [[fromLat, fromLng], [toLat, toLng]];
  const [route, setRoute] = useState<[number, number][] | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const url =
          `https://router.project-osrm.org/route/v1/driving/` +
          `${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
        const res  = await fetch(url, { signal: ctrl.signal });
        const data = await res.json();
        const coords: number[][] | undefined = data.routes?.[0]?.geometry?.coordinates;
        if (coords && coords.length > 0) {
          setRoute(coords.map(([lng, lat]) => [lat, lng] as [number, number]));
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') console.warn('[TripHistoryMap] planned-route OSRM failed:', (e as Error).message);
      }
    }, 300);
    return () => { clearTimeout(timer); ctrl.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromLat, fromLng, toLat, toLng]);

  const pts = route ?? straight;

  return (
    <Polyline
      positions={pts}
      pathOptions={{ color: '#94a3b8', weight: 3, opacity: 0.45, dashArray: '2 8', lineCap: 'round' }}
    />
  );
}

// Draws the remaining leg — current position straight to the destination via a
// simple 2-point OSRM call. Deliberately doesn't try to reconstruct history
// (that's gpsTrack's job): exactly the same approach FleetMap's RoutePolyline
// uses, since a 2-point route is always accurate and never needs sparse-sample
// guessing. Rendered lighter/dashed so it reads as "path ahead", not "driven".
function RemainingRouteLayer({
  fromLat, fromLng, toLat, toLng, color,
}: {
  fromLat: number; fromLng: number; toLat: number; toLng: number; color: string;
}) {
  const straight: [number, number][] = [[fromLat, fromLng], [toLat, toLng]];
  const [route, setRoute] = useState<[number, number][] | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const url =
          `https://router.project-osrm.org/route/v1/driving/` +
          `${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
        const res  = await fetch(url, { signal: ctrl.signal });
        const data = await res.json();
        const coords: number[][] | undefined = data.routes?.[0]?.geometry?.coordinates;
        if (coords && coords.length > 0) {
          setRoute(coords.map(([lng, lat]) => [lat, lng] as [number, number]));
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') console.warn('[TripHistoryMap] remaining-route OSRM failed:', (e as Error).message);
      }
    }, 1000); // debounced — position polls every 15s, no need to hammer OSRM per render
    return () => { clearTimeout(timer); ctrl.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromLat, fromLng, toLat, toLng]);

  const pts = route ?? straight;

  return (
    <Polyline
      positions={pts}
      pathOptions={{ color, weight: 4, opacity: 0.4, dashArray: '4 8', lineCap: 'round' }}
    />
  );
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

// Draws the actual recorded path — the real GPS breadcrumbs connected directly,
// no road-snapping. This is ground truth: it can look slightly off-road/jagged,
// but it can never show a road the vehicle didn't actually take, which an OSRM
// best-guess reconstruction between sparse samples could. The forward-looking
// "path ahead" segment (RemainingRouteLayer) is a prediction, so OSRM snapping
// makes sense there; this is history, where accuracy matters more than smoothness.
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
  const rawPts = r.gpsTrack.length >= 2 ? r.gpsTrack : straight;

  // A handful of sparse points (2-3) connected directly is never trustworthy as
  // "ground truth" — real continuous recording would have far more points, so a
  // short track means we simply don't have enough data, not that the vehicle
  // actually drove in a straight line off-road. Snap those to a real road route,
  // same as the known-estimated (truck_live_state) tail. Only a track with
  // enough recorded points to plausibly represent an actual driven path is
  // trusted and drawn raw/unsnapped.
  const needsSnapping = r.gpsTrackIsEstimated || r.gpsTrack.length <= 3;
  const [snapped, setSnapped] = useState<[number, number][] | null>(null);
  useEffect(() => {
    if (!needsSnapping) { setSnapped(null); return; }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const wp = rawPts.map(([lat, lng]) => `${lng},${lat}`).join(';');
        const url = `https://router.project-osrm.org/route/v1/driving/${wp}?overview=full&geometries=geojson`;
        const res  = await fetch(url, { signal: ctrl.signal });
        const data = await res.json();
        const coords: number[][] | undefined = data.routes?.[0]?.geometry?.coordinates;
        if (coords && coords.length > 0) {
          setSnapped(coords.map(([lng, lat]) => [lat, lng] as [number, number]));
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') console.warn('[TripHistoryMap] sparse-track OSRM failed:', r.id, (e as Error).message);
      }
    }, 300);
    return () => { clearTimeout(timer); ctrl.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsSnapping, JSON.stringify(rawPts)]);

  const pts = needsSnapping ? (snapped ?? rawPts) : rawPts;

  return (
    <RouteLayer
      r={r}
      pts={pts}
      routed
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

  const selected = routes.find(r => r.id === selectedId) ?? null;

  return (
    <MapContainer
      center={centre}
      zoom={9}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitSelected selected={selected} allRoutes={routes} />

      {/* Faded planned route (origin → destination) — drawn first so the real
          GPS trail highlights on top of it */}
      {selected && (
        <PlannedRouteLayer
          key={`planned-${selected.id}`}
          fromLat={selected.originLat} fromLng={selected.originLng}
          toLat={selected.destLat}     toLng={selected.destLng}
        />
      )}

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


      {selected && (
        <TripRouteLayer
          key={`sel-${selected.id}`}
          r={selected}
          selected
          onSelect={() => onSelect(selected.id)}
          visibleTypes={visibleTypes}
        />
      )}

      {selected && selected.showRemainingRoute && selected.gpsTrack.length > 0 && (() => {
        const [curLat, curLng] = selected.gpsTrack[selected.gpsTrack.length - 1];
        return (
          <RemainingRouteLayer
            key={`remaining-${selected.id}`}
            fromLat={curLat} fromLng={curLng}
            toLat={selected.destLat} toLng={selected.destLng}
            color={selected.color}
          />
        );
      })()}
    </MapContainer>
  );
}
