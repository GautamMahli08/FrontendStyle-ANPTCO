'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api, type ApiTrip, type ApiAssetEvent, type ApiTruck, type ApiGeofence } from '@/src/lib/api';
import type { TripRoute, TripEvent, GeofenceZone } from '@/src/components/TripHistoryMap';

const TripHistoryMap = dynamic(() => import('@/src/components/TripHistoryMap'), { ssr: false });

const TRIP_COLORS = [
  '#7c3aed','#1d4ed8','#059669','#0f766e','#0891b2',
  '#d97706','#dc2626','#4f46e5','#9333ea','#16a34a',
];

// ── Plain-language labels ──────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  EN_ROUTE:          'In Transit',
  ARRIVED:           'Arrived',
  DELIVERY_ACCEPTED: 'Delivered',
  COMPLETED:         'Completed',
  CANCELLED:         'Cancelled',
};

const STATUS_STYLE: Record<string, string> = {
  EN_ROUTE:          'bg-blue-100 text-blue-700',
  ARRIVED:           'bg-indigo-100 text-indigo-700',
  DELIVERY_ACCEPTED: 'bg-emerald-100 text-emerald-700',
  COMPLETED:         'bg-green-100 text-green-700',
  CANCELLED:         'bg-red-100 text-red-700',
};

const EVENT_LABEL: Record<string, string> = {
  FUEL_FILL:              'Fuel Filled',
  FUEL_DRAIN:             'Fuel Drained',
  FUEL_THEFT:             'Fuel Theft Alert',
  BATTERY_ON:             'Power Connected',
  BATTERY_OFF:            'Power Disconnected',
  IGNITION_ON:            'Engine Started',
  IGNITION_OFF:           'Engine Stopped',
  MOVEMENT_START:         'Vehicle Moving',
  MOVEMENT_STOP:          'Vehicle Stopped',
  GEOFENCE_ENTER_DEPOT:   'Returned to Depot',
  GEOFENCE_EXIT_DEPOT:    'Left Depot',
  GEOFENCE_ENTER_STATION: 'Reached Destination',
  GEOFENCE_EXIT_STATION:  'Left Destination',
};

const EVENT_ICON: Record<string, string> = {
  FUEL_FILL:              '⛽',
  FUEL_DRAIN:             '🪣',
  FUEL_THEFT:             '🚨',
  BATTERY_ON:             '🔌',
  BATTERY_OFF:            '🔌',
  IGNITION_ON:            '🔑',
  IGNITION_OFF:           '🔑',
  MOVEMENT_START:         '▶',
  MOVEMENT_STOP:          '⏸',
  GEOFENCE_ENTER_DEPOT:   '🏭',
  GEOFENCE_EXIT_DEPOT:    '🏭',
  GEOFENCE_ENTER_STATION: '📍',
  GEOFENCE_EXIT_STATION:  '📍',
};

// ── Helpers ───────────────────────────────────────────────────────────────

// Color per event category — chosen to be visually distinct and semantically obvious.
// Red = danger · Orange = warning · Green = good · Blue = moving · Purple = arrived
// Amber = stopped · Yellow = engine · Teal = power · Gray = other
function eventColor(type: string): string {
  if (type === 'FUEL_THEFT')             return '#dc2626'; // 🔴 red      — critical alert
  if (type === 'BATTERY_OFF')            return '#e11d48'; // 🔴 rose     — power disconnected
  if (type === 'FUEL_DRAIN')             return '#ea580c'; // 🟠 orange   — unexpected fuel loss
  if (type === 'FUEL_FILL')              return '#16a34a'; // 🟢 green    — fuel added
  if (type === 'BATTERY_ON')             return '#0d9488'; // 🩵 teal     — power connected
  if (type === 'MOVEMENT_START')         return '#0284c7'; // 🔵 blue     — truck moving
  if (type === 'MOVEMENT_STOP')          return '#f59e0b'; // 🟡 amber    — truck stopped
  if (type === 'GEOFENCE_ENTER_DEPOT')   return '#7c3aed'; // 🟣 purple   — returned to depot
  if (type === 'GEOFENCE_EXIT_DEPOT')    return '#a78bfa'; // 🟣 lavender — left depot
  if (type === 'GEOFENCE_ENTER_STATION') return '#0369a1'; // 🔵 navy     — arrived at destination
  if (type === 'GEOFENCE_EXIT_STATION')  return '#38bdf8'; // 🔵 sky      — left destination
  if (type === 'IGNITION_ON')            return '#ca8a04'; // 🟡 yellow   — engine started
  if (type === 'IGNITION_OFF')           return '#78716c'; // ⚫ gray     — engine stopped
  return '#94a3b8';
}

// Interactive legend — each entry maps to the event types it represents on the map.
// Used both as a visual legend and as the filter toggle source.
const EVENT_LEGEND = [
  { color: '#dc2626', label: 'Fuel Theft',    types: ['FUEL_THEFT'] as string[]                                   },
  { color: '#ea580c', label: 'Fuel Drain',    types: ['FUEL_DRAIN'] as string[]                                   },
  { color: '#16a34a', label: 'Fuel Fill',     types: ['FUEL_FILL'] as string[]                                    },
  { color: '#f59e0b', label: 'Stopped',       types: ['MOVEMENT_STOP'] as string[]                               },
  { color: '#7c3aed', label: 'At Depot',      types: ['GEOFENCE_ENTER_DEPOT','GEOFENCE_EXIT_DEPOT'] as string[]  },
  { color: '#0369a1', label: 'At Station',    types: ['GEOFENCE_ENTER_STATION','GEOFENCE_EXIT_STATION'] as string[] },
  { color: '#ca8a04', label: 'Engine',        types: ['IGNITION_ON','IGNITION_OFF'] as string[]                  },
  { color: '#0d9488', label: 'Power',         types: ['BATTERY_ON','BATTERY_OFF'] as string[]                    },
];

const ALL_EVENT_TYPES = new Set(EVENT_LEGEND.flatMap(l => l.types));

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime12(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function tripDuration(start: string, end: string): string {
  const ms   = new Date(end).getTime() - new Date(start).getTime();
  if (ms <= 60000) return '';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Page ──────────────────────────────────────────────────────────────────

const FILTERS = ['All', 'In Transit', 'Arrived', 'Delivered', 'Completed'] as const;
const FILTER_STATUS: Record<string, string> = {
  'In Transit': 'EN_ROUTE',
  'Arrived':    'ARRIVED',
  'Delivered':  'DELIVERY_ACCEPTED',
  'Completed':  'COMPLETED',
};

export default function TripHistoryPage() {
  const router = useRouter();
  const user   = getCurrentUser();

  const [trips,            setTrips]            = useState<ApiTrip[]>([]);
  const [events,           setEvents]           = useState<ApiAssetEvent[]>([]);
  const [trucks,           setTrucks]           = useState<ApiTruck[]>([]);
  const [depot,            setDepot]            = useState<ApiGeofence | null>(null);
  const [loading,          setLoading]          = useState(true);
  const [deleting,         setDeleting]         = useState<string | null>(null);
  const [selectedId,       setSelectedId]       = useState<string | null>(null);
  const [filter,           setFilter]           = useState<string>('All');
  const [visibleEventTypes, setVisibleEventTypes] = useState<Set<string>>(new Set(ALL_EVENT_TYPES));
  const [showGeofences,     setShowGeofences]     = useState(true);

  function toggleEventFilter(types: string[]) {
    setVisibleEventTypes(prev => {
      const next    = new Set(prev);
      const allOn   = types.every(t => next.has(t));
      if (allOn) types.forEach(t => next.delete(t));
      else       types.forEach(t => next.add(t));
      return next;
    });
  }

  const truckById = new Map(trucks.map(t => [t.id, t]));

  useEffect(() => {
    if (!user) { router.replace('/auth/login'); return; }
    Promise.all([
      api.trips.list(),
      api.fleet.events(),
      api.trucks.list(),
      api.depots.list(),
    ]).then(([t, e, tr, d]) => {
      setTrips((t ?? []).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      setEvents(e ?? []);
      setTrucks(tr ?? []);
      setDepot((d ?? [])[0] ?? null);
    }).finally(() => setLoading(false));
  }, [router, user]);

  async function deleteTrip(ev: React.MouseEvent, tripId: string) {
    ev.stopPropagation();
    setDeleting(tripId);
    try {
      await api.trips.delete(tripId);
      setTrips(prev => prev.filter(t => t.id !== tripId));
      if (selectedId === tripId) setSelectedId(null);
    } catch { /* keep row on failure */ }
    finally { setDeleting(null); }
  }

  function stopCount(trip: ApiTrip) {
    const start = new Date(trip.created_at).getTime();
    const end   = new Date(trip.updated_at).getTime();
    return events.filter(e =>
      e.truck_id === trip.truck_id &&
      e.event_type === 'MOVEMENT_STOP' &&
      new Date(e.occurred_at).getTime() >= start &&
      new Date(e.occurred_at).getTime() <= end
    ).length;
  }

  function tripEvents(trip: ApiTrip): ApiAssetEvent[] {
    const start = new Date(trip.created_at).getTime();
    const end   = new Date(trip.updated_at).getTime();
    return events
      .filter(e =>
        e.truck_id === trip.truck_id &&
        new Date(e.occurred_at).getTime() >= start &&
        new Date(e.occurred_at).getTime() <= end
      )
      .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
  }

  // Real GPS path from event coordinates — the actual route the truck drove.
  // Sorted oldest→newest so the polyline traces the journey in order.
  function tripGpsTrack(trip: ApiTrip): [number, number][] {
    const evs = tripEvents(trip).filter(e => e.latitude != null && e.longitude != null);
    if (evs.length === 0) return [];

    const pts: [number, number][] = [];
    let prevLat = NaN, prevLng = NaN;
    for (const e of evs) {
      const lat = e.latitude!;
      const lng = e.longitude!;
      // Skip duplicate consecutive points (same location, different event type)
      if (Math.abs(lat - prevLat) < 0.00001 && Math.abs(lng - prevLng) < 0.00001) continue;
      pts.push([lat, lng]);
      prevLat = lat; prevLng = lng;
    }
    return pts;
  }

  // Memoize so the array reference only changes when actual data changes.
  // Without this, every selectedId/filter state change creates a new array →
  // TripHistoryMap's useEffect cleanup aborts in-flight OSRM requests.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const routes: TripRoute[] = useMemo(() => {
    const depotLat = depot?.latitude;
    const depotLng = depot?.longitude;
    return trips
      .filter(t =>
        (depotLat != null && depotLng != null) ||
        (t.origin_lat != null && t.origin_lng != null)
      )
      .flatMap((t, i) => {
        const track = tripGpsTrack(t);
        if (track.length < 2) return [];
        const evs = tripEvents(t);
        return [{
          id:        t.id,
          color:     TRIP_COLORS[i % TRIP_COLORS.length],
          originLat: depotLat ?? t.origin_lat!,
          originLng: depotLng ?? t.origin_lng!,
          destLat:   t.dest_lat,
          destLng:   t.dest_lng,
          gpsTrack:  track,
          events:    (() => {
              // MOVEMENT_STOP: group stops within ~100 m of each other into one badge marker.
              // Nothing is hidden — the badge count shows every stop, so repeated stops at
              // the same spot remain visible and can be flagged as suspicious.
              type StopGroup = { rep: ApiAssetEvent; count: number; times: string[] };
              const stopGroups: StopGroup[] = [];
              for (const s of evs) {
                if (s.event_type !== 'MOVEMENT_STOP' || s.latitude == null || s.longitude == null) continue;
                const g = stopGroups.find(x =>
                  Math.abs(x.rep.latitude! - s.latitude!) < 0.001 &&
                  Math.abs(x.rep.longitude! - s.longitude!) < 0.001
                );
                if (g) { g.count++; g.times.push(fmtTime12(s.occurred_at)); }
                else    stopGroups.push({ rep: s, count: 1, times: [fmtTime12(s.occurred_at)] });
              }

              const result: TripEvent[] = [];

              // Other meaningful events (geofence, fuel, battery, ignition)
              for (const e of evs) {
                if (e.latitude == null || e.longitude == null) continue;
                if (e.event_type === 'MOVEMENT_START' || e.event_type === 'MOVEMENT_STOP') continue;
                result.push({
                  id:        e.id,
                  lat:       e.latitude,
                  lng:       e.longitude,
                  color:     eventColor(e.event_type),
                  label:     EVENT_LABEL[e.event_type] ?? e.event_type,
                  time:      fmtTime12(e.occurred_at),
                  eventType: e.event_type,
                });
              }

              // Stop group markers
              for (const g of stopGroups) {
                result.push({
                  id:        g.rep.id,
                  lat:       g.rep.latitude!,
                  lng:       g.rep.longitude!,
                  color:     eventColor('MOVEMENT_STOP'),
                  label:     'Vehicle Stopped',
                  time:      fmtTime12(g.rep.occurred_at),
                  eventType: 'MOVEMENT_STOP',
                  count:     g.count > 1 ? g.count : undefined,
                  times:     g.count > 1 ? g.times : undefined,
                });
              }

              return result;
            })(),
        }];
      });
  // trips and events are the only data sources; depot.latitude/longitude change triggers recompute
  }, [trips, events, depot]); // eslint-disable-line react-hooks/exhaustive-deps

  const geofences = useMemo<GeofenceZone[]>(() => {
    const zones: GeofenceZone[] = [];
    if (depot) {
      zones.push({ id: depot.id, lat: depot.latitude, lng: depot.longitude,
        radius: depot.radius_meters, name: depot.name, type: 'depot' });
    }
    // Only show destination circles for trips that are actually rendered as routes on the map.
    // Use trip id as key to guarantee uniqueness; deduplicate overlapping locations by proximity.
    const routeIds = new Set(routes.map(r => r.id));
    for (const t of trips) {
      if (!routeIds.has(t.id)) continue;
      if (!t.dest_lat || !t.dest_lng || !t.dest_name) continue;
      const tooClose = zones.some(z => haversineKm(z.lat, z.lng, t.dest_lat, t.dest_lng) < 0.5);
      if (tooClose) continue;
      zones.push({ id: `dest-${t.id}`, lat: t.dest_lat,
        lng: t.dest_lng, radius: 300, name: t.dest_name, type: 'station' });
    }
    return zones;
  }, [depot, trips, routes]);

  const depotLat = depot?.latitude;
  const depotLng = depot?.longitude;
  const tripsWithOrigin = trips.filter(t =>
    (depotLat != null && depotLng != null) ||
    (t.origin_lat != null && t.origin_lng != null)
  );

  function kmFor(t: ApiTrip) {
    const oLat = depotLat ?? t.origin_lat;
    const oLng = depotLng ?? t.origin_lng;
    return oLat != null && oLng != null ? haversineKm(oLat, oLng, t.dest_lat, t.dest_lng) : null;
  }

  const totalKm      = tripsWithOrigin.reduce((s, t) => s + (kmFor(t) ?? 0), 0);
  const totalStops   = trips.reduce((s, t) => s + stopCount(t), 0);
  const deliveredCnt = trips.filter(t => t.status === 'DELIVERY_ACCEPTED' || t.status === 'COMPLETED').length;

  const visibleTrips = filter === 'All'
    ? trips
    : trips.filter(t => t.status === FILTER_STATUS[filter]);

  const selectedTrip  = selectedId ? trips.find(t => t.id === selectedId) ?? null : null;
  const selectedIdx   = trips.findIndex(t => t.id === selectedId);
  const selectedColor = selectedIdx >= 0 ? TRIP_COLORS[selectedIdx % TRIP_COLORS.length] : '#94a3b8';

  function downloadCSV() {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const row = (cols: unknown[]) => cols.map(esc).join(',');
    const lines = [
      row(['Date', 'Departure', 'Arrival', 'Duration', 'Destination', 'Truck', 'Status', 'Distance (km)', 'Stops', 'Events']),
      ...trips.map(t => {
        const truck = truckById.get(t.truck_id);
        const km    = kmFor(t);
        return row([
          fmtDate(t.created_at),
          fmtTime12(t.created_at),
          fmtTime12(t.updated_at),
          tripDuration(t.created_at, t.updated_at),
          t.dest_name,
          truck?.device_id ?? t.truck_id,
          STATUS_LABEL[t.status] ?? t.status,
          km != null ? km.toFixed(2) : '',
          stopCount(t),
          tripEvents(t).length,
        ]);
      }),
    ];
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }));
    a.download = `trips-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar role="TRANSPORT_ADMIN" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Trip History" user={user} />

        <div className="flex-1 flex overflow-hidden">

          {/* ── Left panel ─────────────────────────────────────────── */}
          <div className="w-[380px] shrink-0 flex flex-col bg-white border-r border-slate-200 overflow-hidden">

            {/* Summary strip */}
            <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-200 bg-slate-50 shrink-0">
              {[
                { label: 'Total Trips',  value: trips.length },
                { label: 'Delivered',    value: deliveredCnt },
                { label: 'Distance (km)', value: totalKm.toFixed(1) },
              ].map(s => (
                <div key={s.label} className="px-3 py-3 text-center">
                  <p className="text-lg font-bold text-slate-800 leading-none">{s.value}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Filter pills */}
            <div className="flex gap-1 px-3 py-2.5 border-b border-slate-100 shrink-0 overflow-x-auto">
              {FILTERS.map(f => {
                const cnt = f === 'All' ? trips.length
                  : trips.filter(t => t.status === FILTER_STATUS[f]).length;
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${
                      filter === f
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {f} <span className={filter === f ? 'text-blue-200' : 'text-slate-400'}>{cnt}</span>
                  </button>
                );
              })}
            </div>

            {/* Interactive event filter — click to show/hide that marker type on the map */}
            <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 shrink-0">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Show on Map</p>
                <button
                  onClick={() => setVisibleEventTypes(
                    visibleEventTypes.size === ALL_EVENT_TYPES.size ? new Set() : new Set(ALL_EVENT_TYPES)
                  )}
                  className="text-[9px] font-semibold text-blue-500 hover:text-blue-700 transition"
                >
                  {visibleEventTypes.size === ALL_EVENT_TYPES.size ? 'Hide all' : 'Show all'}
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {EVENT_LEGEND.map(({ color, label, types }) => {
                  const active = types.some(t => visibleEventTypes.has(t));
                  return (
                    <button
                      key={label}
                      onClick={() => toggleEventFilter(types)}
                      title={active ? `Hide ${label}` : `Show ${label}`}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all ${
                        active
                          ? 'border-transparent text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-400 opacity-60'
                      }`}
                      style={active ? { background: color, borderColor: color } : undefined}
                    >
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: active ? 'rgba(255,255,255,0.7)' : color }} />
                      {label}
                    </button>
                  );
                })}
                <button
                  onClick={() => setShowGeofences(v => !v)}
                  title={showGeofences ? 'Hide geofences' : 'Show geofences'}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all ${
                    showGeofences
                      ? 'border-transparent text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-400 opacity-60'
                  }`}
                  style={showGeofences ? { background: '#6366f1', borderColor: '#6366f1' } : undefined}
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: showGeofences ? 'rgba(255,255,255,0.7)' : '#6366f1' }} />
                  Geofences
                </button>
              </div>
            </div>

            {/* Trip cards */}
            <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1.5">
              {loading ? (
                <div className="flex items-center justify-center h-40 text-sm text-slate-400">Loading trips…</div>
              ) : visibleTrips.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400 py-16">
                  <span className="text-5xl">🛣️</span>
                  <p className="text-sm font-medium">No {filter !== 'All' ? filter.toLowerCase() : ''} trips yet</p>
                </div>
              ) : visibleTrips.map((t, listIdx) => {
                const globalIdx = trips.findIndex(x => x.id === t.id);
                const color     = TRIP_COLORS[globalIdx % TRIP_COLORS.length];
                const km        = kmFor(t);
                const stops     = stopCount(t);
                const evCount   = tripEvents(t).length;
                const dur       = tripDuration(t.created_at, t.updated_at);
                const selected  = t.id === selectedId;
                const truck     = truckById.get(t.truck_id);

                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedId(t.id === selectedId ? null : t.id)}
                    className={`group relative rounded-xl border cursor-pointer transition-all select-none overflow-hidden ${
                      selected
                        ? 'border-blue-200 bg-blue-50 shadow-sm'
                        : 'border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm'
                    }`}
                  >
                    {/* Color bar matching map route */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ background: color }} />

                    <div className="pl-4 pr-3 py-3">
                      {/* Row 1: date + status */}
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] text-slate-500 font-medium">{fmtDate(t.created_at)}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[t.status] ?? 'bg-slate-100 text-slate-600'}`}>
                          {STATUS_LABEL[t.status] ?? t.status}
                        </span>
                      </div>

                      {/* Row 2: destination name */}
                      <p className="text-[14px] font-bold text-slate-800 leading-snug truncate mb-0.5">
                        {t.dest_name || 'Unknown Destination'}
                      </p>

                      {/* Row 3: truck */}
                      {truck && (
                        <p className="text-[11px] text-slate-400 mb-1.5">
                          Truck: <span className="font-mono">{truck.device_id}</span>
                        </p>
                      )}

                      {/* Row 4: time range + duration */}
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-600 mb-2">
                        <span className="font-mono">{fmtTime12(t.created_at)}</span>
                        <span className="text-slate-300">→</span>
                        <span className="font-mono">{fmtTime12(t.updated_at)}</span>
                        {dur && (
                          <>
                            <span className="text-slate-300">·</span>
                            <span className="font-semibold text-slate-500">{dur}</span>
                          </>
                        )}
                      </div>

                      {/* Row 5: stats chips */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {km != null && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                            {km.toFixed(1)} km
                          </span>
                        )}
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                          {stops} stop{stops !== 1 ? 's' : ''}
                        </span>
                        {evCount > 0 && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                            {evCount} event{evCount !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Delete button — appears on hover */}
                    <button
                      onClick={e => deleteTrip(e, t.id)}
                      disabled={deleting === t.id}
                      title="Remove trip"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-slate-300 hover:text-red-500 disabled:opacity-30 w-5 h-5 flex items-center justify-center rounded-full hover:bg-red-50"
                    >
                      {deleting === t.id ? '…' : '✕'}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-3 py-2.5 border-t border-slate-200 shrink-0 flex items-center gap-2">
              <div className="flex-1 text-[10px] text-slate-400">
                {totalStops} total stops
              </div>
              <button
                onClick={downloadCSV}
                className="text-xs font-semibold text-blue-600 border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition"
              >
                ↓ Export CSV
              </button>
            </div>
          </div>

          {/* ── Right: Map + event strip ────────────────────────── */}
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Map */}
            <div className="flex-1 relative">
              {loading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-sm text-slate-400">Loading map…</p>
                  </div>
                </div>
              ) : routes.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 gap-3 text-slate-400">
                  <span className="text-5xl">🗺️</span>
                  <p className="text-sm font-medium">Configure a depot to see routes on the map</p>
                </div>
              ) : (
                <TripHistoryMap
                  routes={routes}
                  selectedId={selectedId}
                  visibleTypes={visibleEventTypes}
                  geofences={showGeofences ? geofences : []}
                  onSelect={id => setSelectedId(id === selectedId ? null : id)}
                />
              )}

              {/* Map hint */}
              {routes.length > 0 && !selectedTrip && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm text-xs text-slate-500 px-3 py-1.5 rounded-full border border-slate-200 shadow-sm pointer-events-none">
                  Click a route or a trip card to see events
                </div>
              )}
            </div>

            {/* ── Event strip ───────────────────────────────────── */}
            {selectedTrip && (() => {
              const evs = tripEvents(selectedTrip);
              const km  = kmFor(selectedTrip);
              const dur = tripDuration(selectedTrip.created_at, selectedTrip.updated_at);
              return (
                <div className="shrink-0 border-t-2 border-slate-200 bg-white" style={{ height: 220 }}>

                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: selectedColor }} />
                      <div>
                        <p className="text-sm font-bold text-slate-800 leading-none">
                          {selectedTrip.dest_name || 'Unknown Destination'}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {fmtDate(selectedTrip.created_at)} · {fmtTime12(selectedTrip.created_at)} → {fmtTime12(selectedTrip.updated_at)}
                          {dur ? ` · ${dur}` : ''}
                          {km != null ? ` · ${km.toFixed(1)} km` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[selectedTrip.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {STATUS_LABEL[selectedTrip.status] ?? selectedTrip.status}
                      </span>
                      <span className="text-[11px] text-slate-400">{evs.length} events</span>
                      <button
                        onClick={() => setSelectedId(null)}
                        className="text-slate-300 hover:text-slate-500 transition w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-100"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Event cards — horizontal scroll */}
                  <div className="overflow-x-auto h-[calc(100%-49px)]">
                    {(() => {
                      // Hide MOVEMENT_START — it's the companion event to every stop and adds noise.
                      // Meaningful events are the stops, fuel changes, geofences, battery, ignition.
                      const displayEvs = evs.filter(e => e.event_type !== 'MOVEMENT_START');
                      if (displayEvs.length === 0) return (
                        <div className="flex items-center justify-center h-full text-sm text-slate-400">
                          No events recorded during this trip
                        </div>
                      );
                      return (
                        <div className="flex gap-2 px-3 py-2.5 h-full" style={{ width: 'max-content' }}>
                          {displayEvs.map((ev, idx) => {
                            const color      = eventColor(ev.event_type);
                            const isStop     = ev.event_type === 'MOVEMENT_STOP';
                            const isCritical = ev.event_type === 'FUEL_THEFT';
                            const delta      = ev.value_before != null && ev.value_after != null
                              ? ev.value_after - ev.value_before : null;

                            // For MOVEMENT_STOP: find the next MOVEMENT_START to calculate how long the truck was stopped
                            let stopDuration = '';
                            if (isStop) {
                              const nextStart = evs.find(e =>
                                e.event_type === 'MOVEMENT_START' &&
                                new Date(e.occurred_at) > new Date(ev.occurred_at)
                              );
                              if (nextStart) {
                                const mins = Math.round(
                                  (new Date(nextStart.occurred_at).getTime() - new Date(ev.occurred_at).getTime()) / 60000
                                );
                                stopDuration = mins < 1 ? '< 1 min' : mins < 60 ? `${mins} min` : `${Math.floor(mins/60)}h ${mins%60}m`;
                              }
                            }

                            return (
                              <div
                                key={ev.id}
                                className={`flex flex-col rounded-xl border overflow-hidden shrink-0 ${
                                  isCritical ? 'border-red-200 bg-red-50'
                                  : isStop    ? 'border-amber-200 bg-amber-50'
                                  : 'border-slate-100 bg-slate-50'
                                }`}
                                style={{ width: 150 }}
                              >
                                {/* Color top bar */}
                                <div className="h-1.5 w-full shrink-0" style={{ background: color }} />

                                <div className="flex-1 px-3 py-2 flex flex-col gap-1">
                                  {/* Icon + label */}
                                  <div className="flex items-start gap-1.5">
                                    <span className="text-base leading-none mt-px">
                                      {EVENT_ICON[ev.event_type] ?? '•'}
                                    </span>
                                    <p className={`text-[11px] font-bold leading-tight ${
                                      isCritical ? 'text-red-700' : isStop ? 'text-amber-700' : 'text-slate-700'
                                    }`}>
                                      {EVENT_LABEL[ev.event_type] ?? ev.event_type}
                                    </p>
                                  </div>

                                  {/* Time */}
                                  <p className="text-[11px] text-slate-500 font-mono">
                                    {fmtTime12(ev.occurred_at)}
                                  </p>

                                  {/* Stop duration */}
                                  {stopDuration && (
                                    <p className="text-[11px] font-bold text-amber-600">
                                      Stopped {stopDuration}
                                    </p>
                                  )}

                                  {/* Zone name */}
                                  {ev.geofence_zone && (
                                    <p className="text-[10px] text-slate-500 truncate">{ev.geofence_zone}</p>
                                  )}

                                  {/* Fuel delta */}
                                  {delta != null && (
                                    <p className={`text-[11px] font-bold ${delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {delta > 0 ? '+' : ''}{delta.toFixed(1)} L
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                </div>
              );
            })()}
          </div>

        </div>
      </div>
    </div>
  );
}
