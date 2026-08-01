'use client';

import L from 'leaflet';
import { useCallback, useEffect, useRef, useState, Fragment } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap, useMapEvents } from 'react-leaflet';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export interface FleetMarker {
  id:               string;
  lat:              number;
  lng:              number;
  label?:           string;
  status?:          string;
  speed?:           number | null;
  totalFuel?:       number;
  compartmentFuel?: Record<string, number>;
}

export interface TestWaypoint {
  id:          string;
  lat:         number;
  lng:         number;
  name:        string;
  radius:      number;
  dispatched?: boolean;
}

export interface DepotZone {
  id:            string;
  name:          string;
  latitude:      number;
  longitude:     number;
  radius_meters: number;
}

const WP_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b'];

// Stores the map instance in a ref so the parent wrapper can call map methods
// (e.g. fitBounds from the Fit-all button) without relying on MapContainer's ref forwarding.
function GetMapRef({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; }, [map, mapRef]);
  return null;
}

function InitialFit({ markers }: { markers: FleetMarker[] }) {
  const map    = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current || markers.length === 0) return;
    fitted.current = true;
    if (markers.length === 1) {
      map.setView([markers[0].lat, markers[0].lng], 14);
    } else {
      const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lng]));
      map.fitBounds(bounds, { padding: [48, 48] });
    }
  }, [markers, map]);

  return null;
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: e => onMapClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

// Leaflet reads container dimensions at init time. When the MapContainer first
// mounts after a loading/empty-state swap, the browser may not have finished
// layout yet, so Leaflet gets 0-height and tiles never load. invalidateSize()
// after a short delay forces a correct recalculation.
function InvalidateSize() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

// Re-fits map to show the selected truck + destination whenever the destination changes.
// wpKey is a stable string so this won't re-run on every 5-second truck poll.
function FitRoute({
  markers, waypoints, selectedTruckId,
}: { markers: FleetMarker[]; waypoints: TestWaypoint[]; selectedTruckId?: string }) {
  const map   = useMap();
  const wpKey = waypoints.map(w => `${w.lat.toFixed(5)},${w.lng.toFixed(5)}`).join('|');
  useEffect(() => {
    if (waypoints.length === 0 || !selectedTruckId) return;
    const truck = markers.find(m => m.id === selectedTruckId);
    if (!truck) return;
    const pts: [number, number][] = [
      [truck.lat, truck.lng],
      ...waypoints.map(w => [w.lat, w.lng] as [number, number]),
    ];
    map.fitBounds(L.latLngBounds(pts), { padding: [60, 60] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wpKey, selectedTruckId, map]);
  return null;
}

// Fetches a road route from OSRM and draws it as a Polyline.
// Falls back to a straight dashed line while loading or on error.
// Debounced 1 s so truck position polling (every 5 s) doesn't hammer the API.
function RoutePolyline({
  fromLat, fromLng, toLat, toLng, color, dispatched,
}: {
  fromLat: number; fromLng: number;
  toLat:   number; toLng:   number;
  color:   string; dispatched?: boolean;
}) {
  const straight: [number, number][] = [[fromLat, fromLng], [toLat, toLng]];
  const [route, setRoute] = useState<[number, number][]>(straight);

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const url =
          `https://router.project-osrm.org/route/v1/driving/` +
          `${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
        const res  = await fetch(url, { signal: ctrl.signal });
        const data = await res.json();
        const coords: [number, number][] | undefined =
          data.routes?.[0]?.geometry?.coordinates;
        if (coords) {
          // OSRM returns [lng, lat] — Leaflet expects [lat, lng]
          setRoute(coords.map(([lng, lat]) => [lat, lng]));
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setRoute(straight);
      }
    }, 1000);
    return () => { clearTimeout(timer); ctrl.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromLat, fromLng, toLat, toLng]);

  return (
    <Polyline
      positions={route}
      pathOptions={{
        color,
        weight:    route === straight ? 2 : 3,
        opacity:   0.8,
        dashArray: dispatched ? undefined : '10 7',
      }}
    />
  );
}

function TruckMarker({ m }: { m: FleetMarker }) {
  const map = useMap();
  return (
    <Marker
      position={[m.lat, m.lng]}
      eventHandlers={{ click: () => map.flyTo([m.lat, m.lng], 16, { duration: 1.2 }) }}
    >
      <Popup>
        <div style={{ fontSize: 12, lineHeight: 1.6, minWidth: 160 }}>
          <strong>{m.label ?? m.id.slice(-8).toUpperCase()}</strong>
          {m.status && <div style={{ color: '#374151' }}>{m.status}</div>}
          {m.speed != null && <div style={{ color: '#6b7280' }}>{m.speed} km/h</div>}
          <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 2 }}>
            {m.lat.toFixed(5)}, {m.lng.toFixed(5)}
          </div>
          {(() => {
            const CAP    = 9100;
            const colors = ['#3b82f6', '#06b6d4', '#14b8a6', '#0ea5e9'];
            const total  = [1,2,3,4].reduce((s,i) => s + (m.compartmentFuel?.[String(i)] ?? 0), 0);
            return (
              <div style={{ marginTop: 6, borderTop: '1px solid #f1f5f9', paddingTop: 6 }}>
                <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>Fuel Compartments</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[1,2,3,4].map(i => {
                    const liters  = m.compartmentFuel?.[String(i)] ?? 0;
                    const pct     = Math.min(100, (liters / CAP) * 100);
                    const isEmpty = liters === 0;
                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#64748b' }}>C{i}</span>
                        <div style={{ position: 'relative', width: '100%', height: 60, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${Math.max(pct, isEmpty ? 100 : 2)}%`, background: isEmpty ? '#e2e8f0' : colors[i-1], opacity: isEmpty ? 0.5 : 1, transition: 'height 0.6s ease' }} />
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: isEmpty ? '#94a3b8' : '#fff', textShadow: isEmpty ? 'none' : '0 1px 2px rgba(0,0,0,0.3)' }}>
                              {isEmpty ? '—' : pct < 1 ? `${pct.toFixed(1)}%` : `${pct.toFixed(0)}%`}
                            </span>
                          </div>
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 600, color: '#374151', fontFamily: 'monospace' }}>{liters.toLocaleString()} L</span>
                        <span style={{ fontSize: 8, color: '#94a3b8' }}>/{CAP.toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 6, paddingTop: 4, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                  <span style={{ color: '#94a3b8' }}>Total</span>
                  <span style={{ fontWeight: 700, color: '#374151' }}>{total.toLocaleString()} / {(CAP*4).toLocaleString()} L</span>
                </div>
              </div>
            );
          })()}
        </div>
      </Popup>
    </Marker>
  );
}

function WaypointMarker({ wp, i }: { wp: TestWaypoint; i: number }) {
  const map   = useMap();
  const color = WP_COLORS[i % WP_COLORS.length];
  const icon  = L.divIcon({
    html: `<div style="background:${color};color:white;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.25);${wp.dispatched ? 'outline:2px solid #22c55e;outline-offset:2px' : ''}">${wp.name}</div>`,
    className:  '',
    iconAnchor: [0, 0],
  });
  return (
    <Fragment>
      <Circle
        center={[wp.lat, wp.lng]}
        radius={wp.radius}
        pathOptions={{ color, fillColor: color, fillOpacity: 0.12, weight: 2, dashArray: wp.dispatched ? undefined : '6 4' }}
      />
      <Marker
        position={[wp.lat, wp.lng]}
        icon={icon}
        eventHandlers={{ click: () => map.flyTo([wp.lat, wp.lng], 16, { duration: 1.2 }) }}
      />
    </Fragment>
  );
}

function DepotMarker({ d }: { d: DepotZone }) {
  const map  = useMap();
  const icon = L.divIcon({
    html: `<div style="background:#6366f1;color:white;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.25)">🏭 ${d.name}</div>`,
    className:  '',
    iconAnchor: [0, 0],
  });
  return (
    <Fragment>
      <Circle
        center={[d.latitude, d.longitude]}
        radius={d.radius_meters}
        pathOptions={{ color: '#6366f1', fillColor: '#6366f1', fillOpacity: 0.10, weight: 2, dashArray: '6 4' }}
      />
      <Marker
        position={[d.latitude, d.longitude]}
        icon={icon}
        eventHandlers={{ click: () => map.flyTo([d.latitude, d.longitude], 15, { duration: 1.2 }) }}
      />
    </Fragment>
  );
}

const DEFAULT_CENTER: [number, number] = [23.5937, 80.9629];

export default function FleetMap({
  markers,
  waypoints = [],
  depots = [],
  onMapClick,
  placingMode = false,
  height = 420,
  selectedTruckId,
}: {
  markers:          FleetMarker[];
  waypoints?:       TestWaypoint[];
  depots?:          DepotZone[];
  onMapClick?:      (lat: number, lng: number) => void;
  placingMode?:     boolean;
  height?:          number;
  selectedTruckId?: string;
}) {
  const mapRef = useRef<L.Map | null>(null);

  const centre: [number, number] = markers.length > 0
    ? [markers[0].lat, markers[0].lng]
    : DEFAULT_CENTER;

  const fitAll = useCallback(() => {
    const pts: [number, number][] = [
      ...markers.map(m => [m.lat, m.lng] as [number, number]),
      ...waypoints.map(w => [w.lat, w.lng] as [number, number]),
      ...depots.map(d => [d.latitude, d.longitude] as [number, number]),
    ];
    if (!mapRef.current || pts.length === 0) return;
    if (pts.length === 1) { mapRef.current.flyTo(pts[0], 14, { duration: 1 }); return; }
    mapRef.current.fitBounds(L.latLngBounds(pts), { padding: [60, 60], animate: true });
  }, [markers, waypoints, depots]);

  return (
    <div style={{ position: 'relative' }}>
      {/* Leaflet moves markers via CSS transform. A linear transition matching
          the poll interval (5 s) makes each truck glide to the new GPS fix
          instead of jumping. Only fires on subsequent setLatLng calls —
          initial placement is instant. */}
      <style>{`.leaflet-marker-icon,.leaflet-marker-shadow{transition:transform 5s linear!important}`}</style>

      <MapContainer
        center={centre}
        zoom={5}
        style={{
          height: `${height}px`,
          width: '100%',
          borderRadius: '0.75rem',
          cursor: placingMode ? 'crosshair' : undefined,
        }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <GetMapRef mapRef={mapRef} />
        <InvalidateSize />
        <InitialFit markers={markers} />
        <FitRoute markers={markers} waypoints={waypoints} selectedTruckId={selectedTruckId} />
        {onMapClick && <MapClickHandler onMapClick={onMapClick} />}

        {markers.map(m => <TruckMarker key={m.id} m={m} />)}

        {depots.map(d => <DepotMarker key={d.id} d={d} />)}

        {/* Road routes: selected truck → each waypoint via OSRM */}
        {selectedTruckId && (() => {
          const truck = markers.find(m => m.id === selectedTruckId);
          if (!truck) return null;
          return waypoints.map((wp, i) => (
            <RoutePolyline
              key={`route-${wp.id}`}
              fromLat={truck.lat} fromLng={truck.lng}
              toLat={wp.lat}      toLng={wp.lng}
              color={WP_COLORS[i % WP_COLORS.length]}
              dispatched={wp.dispatched}
            />
          ));
        })()}

        {waypoints.map((wp, i) => <WaypointMarker key={wp.id} wp={wp} i={i} />)}
      </MapContainer>

      {/* Fit-all button — styled to match Leaflet's zoom control */}
      <button
        onClick={fitAll}
        title="Fit all points"
        style={{
          position:     'absolute',
          top:          80,
          left:         10,
          zIndex:       1000,
          width:        30,
          height:       30,
          background:   'white',
          border:       '2px solid rgba(0,0,0,0.2)',
          borderRadius: 4,
          cursor:       'pointer',
          fontSize:     16,
          lineHeight:   '26px',
          textAlign:    'center',
          color:        '#333',
          boxShadow:    '0 1px 5px rgba(0,0,0,0.2)',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
        }}
      >
        ⊙
      </button>
    </div>
  );
}
