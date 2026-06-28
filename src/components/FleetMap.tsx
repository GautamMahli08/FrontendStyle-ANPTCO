'use client';

import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';

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

// Fits the map to all markers exactly once (on first non-empty render).
// After that, user zoom/pan is fully free.
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

// Each marker flies the map to itself on click so the user gets a close-up view.
function TruckMarker({ m }: { m: FleetMarker }) {
  const map = useMap();

  return (
    <Marker
      position={[m.lat, m.lng]}
      eventHandlers={{
        click: () => map.flyTo([m.lat, m.lng], 16, { duration: 1.2 }),
      }}
    >
      <Popup>
        <div style={{ fontSize: 12, lineHeight: 1.6, minWidth: 160 }}>
          <strong>{m.label ?? m.id.slice(-8).toUpperCase()}</strong>
          {m.status && <div style={{ color: '#374151' }}>{m.status}</div>}
          {m.speed != null && <div style={{ color: '#6b7280' }}>{m.speed} km/h</div>}
          <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 2 }}>
            {m.lat.toFixed(5)}, {m.lng.toFixed(5)}
          </div>
          {/* Vertical fuel compartment bars — 9100 L capacity each */}
          {(() => {
            const CAP = 9100;
            const colors = ['#3b82f6','#06b6d4','#14b8a6','#0ea5e9'];
            const totalLoaded = [1,2,3,4].reduce((s,i) => s + (m.compartmentFuel?.[String(i)] ?? 0), 0);
            return (
              <div style={{ marginTop: 6, borderTop: '1px solid #f1f5f9', paddingTop: 6 }}>
                <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>
                  Fuel Compartments
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[1,2,3,4].map(i => {
                    const liters = m.compartmentFuel?.[String(i)] ?? 0;
                    const pct    = Math.min(100, (liters / CAP) * 100);
                    const isEmpty = liters === 0;
                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#64748b' }}>C{i}</span>
                        <div style={{ position: 'relative', width: '100%', height: 60, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{
                            position: 'absolute', bottom: 0, width: '100%',
                            height: `${Math.max(pct, isEmpty ? 100 : 2)}%`,
                            background: isEmpty ? '#e2e8f0' : colors[i-1],
                            opacity: isEmpty ? 0.5 : 1,
                            transition: 'height 0.6s ease',
                          }} />
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
                  <span style={{ fontWeight: 700, color: '#374151' }}>
                    {totalLoaded.toLocaleString()} / {(CAP*4).toLocaleString()} L
                  </span>
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
  height = 420,
}: {
  markers: FleetMarker[];
  height?: number;
}) {
  const centre: [number, number] = markers.length > 0
    ? [markers[0].lat, markers[0].lng]
    : DEFAULT_CENTER;

  return (
    <MapContainer
      center={centre}
      zoom={5}
      style={{ height: `${height}px`, width: '100%', borderRadius: '0.75rem' }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <InitialFit markers={markers} />
      {markers.map(m => (
        <TruckMarker key={m.id} m={m} />
      ))}
    </MapContainer>
  );
}
