'use client';

import L from 'leaflet';
import { useEffect, useRef, Fragment } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvents } from 'react-leaflet';

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

const WP_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b'];

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

const DEFAULT_CENTER: [number, number] = [23.5937, 80.9629];

export default function FleetMap({
  markers,
  waypoints = [],
  onMapClick,
  placingMode = false,
  height = 420,
}: {
  markers:       FleetMarker[];
  waypoints?:    TestWaypoint[];
  onMapClick?:   (lat: number, lng: number) => void;
  placingMode?:  boolean;
  height?:       number;
}) {
  const centre: [number, number] = markers.length > 0
    ? [markers[0].lat, markers[0].lng]
    : DEFAULT_CENTER;

  return (
    <Fragment>
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
        <InvalidateSize />
        <InitialFit markers={markers} />
        {onMapClick && <MapClickHandler onMapClick={onMapClick} />}

        {markers.map(m => <TruckMarker key={m.id} m={m} />)}

        {waypoints.map((wp, i) => {
          const color = WP_COLORS[i % WP_COLORS.length];
          const icon  = L.divIcon({
            html: `<div style="background:${color};color:white;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.25);${wp.dispatched ? 'outline:2px solid #22c55e;outline-offset:2px' : ''}">${wp.name}</div>`,
            className: '',
            iconAnchor: [0, 0],
          });
          return (
            <Fragment key={wp.id}>
              <Circle
                center={[wp.lat, wp.lng]}
                radius={wp.radius}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.12, weight: 2, dashArray: wp.dispatched ? undefined : '6 4' }}
              />
              <Marker position={[wp.lat, wp.lng]} icon={icon} />
            </Fragment>
          );
        })}
      </MapContainer>
    </Fragment>
  );
}
