'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api, type ApiTrip, type ApiAssetEvent, type ApiTruck, type ApiGeofence } from '@/src/lib/api';
import type { TripRoute, TripEvent, GeofenceZone } from '@/src/components/TripHistoryMap';
import { loadDestinations, loadActiveDestId, getActiveDest } from '@/src/lib/saved-destinations';

const TripHistoryMap = dynamic(() => import('@/src/components/TripHistoryMap'), { ssr: false });

const TRIP_COLORS = [
  '#7c3aed','#1d4ed8','#059669','#0f766e','#0891b2',
  '#d97706','#dc2626','#4f46e5','#9333ea','#16a34a',
];

const CAL_MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
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
  GEOFENCE_ENTER:         'Entered Geofence',
  GEOFENCE_EXIT:          'Exited Geofence',
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
  GEOFENCE_ENTER:         '🔷',
  GEOFENCE_EXIT:          '🔶',
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
  if (type === 'GEOFENCE_ENTER')         return '#059669'; // 🟢 emerald  — entered custom zone
  if (type === 'GEOFENCE_EXIT')          return '#d97706'; // 🟡 amber    — exited custom zone
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
  { color: '#059669', label: 'Geofences',    types: ['GEOFENCE_ENTER','GEOFENCE_EXIT'] as string[]              },
];

const ALL_EVENT_TYPES = new Set(EVENT_LEGEND.flatMap(l => l.types));

function localDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function todayDateStr(): string {
  return localDate(new Date().toISOString());
}

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
  const [selectedCalDates,  setSelectedCalDates]  = useState<Set<string>>(new Set());
  const [lastCalSelected,   setLastCalSelected]   = useState<string | null>(null);
  const [calViewDate,       setCalViewDate]        = useState(() => { const d = new Date(); d.setDate(1); return d; });

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

  // Chronological order (oldest first) used to assign stable #1, #2, … numbers.
  const tripsChronological = useMemo(
    () => [...trips].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [trips],
  );
  function tripNumber(tripId: string) {
    return tripsChronological.findIndex(t => t.id === tripId) + 1;
  }

  // Trip count per date for calendar badges
  const tripCountByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const trip of trips) {
      const d = localDate(trip.created_at);
      map.set(d, (map.get(d) ?? 0) + 1);
    }
    return map;
  }, [trips]);

  // Calendar grid for the mini calendar (6 rows × 7 cols)
  const calendarDays = useMemo(() => {
    const year  = calViewDate.getFullYear();
    const month = calViewDate.getMonth();
    const firstDow      = new Date(year, month, 1).getDay();
    const daysInMonth   = new Date(year, month + 1, 0).getDate();
    const daysInPrevMon = new Date(year, month, 0).getDate();
    const fmt = (y: number, m: number, d: number) =>
      `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const days: { date: string; day: number; inMonth: boolean }[] = [];
    for (let i = firstDow - 1; i >= 0; i--) {
      const day = daysInPrevMon - i;
      days.push({ date: fmt(month === 0 ? year-1 : year, month === 0 ? 11 : month-1, day), day, inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ date: fmt(year, month, d), day: d, inMonth: true });
    }
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      days.push({ date: fmt(month === 11 ? year+1 : year, month === 11 ? 0 : month+1, d), day: d, inMonth: false });
    }
    return days;
  }, [calViewDate]);

  useEffect(() => {
    if (!user) { router.replace('/auth/login'); return; }
    Promise.all([
      api.trips.list(),
      api.fleet.events(),
      api.trucks.list(),
      api.depots.list(),
    ]).then(([t, e, tr, d]) => {
      const sorted = (t ?? []).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setTrips(sorted);
      setSelectedId(sorted[0]?.id ?? null);
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
    // Active saved destination from fleet monitor (localStorage)
    const savedDest = getActiveDest(loadDestinations(), loadActiveDestId());
    if (savedDest) {
      zones.push({ id: `saved-${savedDest.id}`, lat: savedDest.lat, lng: savedDest.lng,
        radius: savedDest.radius, name: savedDest.name, type: 'station' });
    }
    // When a trip is selected show only its destination; otherwise show all rendered trip destinations.
    const routeIds   = new Set(routes.map(r => r.id));
    const tripsToPin = selectedId
      ? trips.filter(t => t.id === selectedId)
      : trips.filter(t => routeIds.has(t.id));
    for (const t of tripsToPin) {
      if (!t.dest_lat || !t.dest_lng || !t.dest_name) continue;
      const tooClose = zones.some(z => haversineKm(z.lat, z.lng, t.dest_lat, t.dest_lng) < 0.5);
      if (tooClose) continue;
      zones.push({ id: `dest-${t.id}`, lat: t.dest_lat,
        lng: t.dest_lng, radius: 300, name: t.dest_name, type: 'station' });
    }
    return zones;
  }, [depot, trips, routes, selectedId]);

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

  const visibleTrips = useMemo(() => {
    let out = trips;
    if (selectedCalDates.size > 0) out = out.filter(t => selectedCalDates.has(localDate(t.created_at)));
    if (filter !== 'All') out = out.filter(t => t.status === FILTER_STATUS[filter]);
    return out;
  }, [trips, selectedCalDates, filter]);

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

            {/* Mini Calendar Filter */}
            <div className="border-b border-slate-100 shrink-0">
              {/* Month navigation */}
              <div className="flex items-center justify-between px-3 pt-2 pb-1">
                <button
                  onClick={() => setCalViewDate(d => new Date(d.getFullYear(), d.getMonth()-1, 1))}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-500 text-base font-bold transition"
                >‹</button>
                <span className="text-[11px] font-bold text-slate-600">
                  {CAL_MONTHS[calViewDate.getMonth()]} {calViewDate.getFullYear()}
                </span>
                <button
                  onClick={() => setCalViewDate(d => new Date(d.getFullYear(), d.getMonth()+1, 1))}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-500 text-base font-bold transition"
                >›</button>
              </div>

              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 px-2">
                {['S','M','T','W','T','F','S'].map((d, i) => (
                  <div key={i} className="py-0.5 text-center text-[9px] font-bold text-slate-400">{d}</div>
                ))}
              </div>

              {/* Date cells */}
              <div className="grid grid-cols-7 px-2 pb-2">
                {calendarDays.map(({ date, day, inMonth }) => {
                  const isSelected = selectedCalDates.has(date);
                  const isToday    = date === todayDateStr();
                  const count      = inMonth ? (tripCountByDate.get(date) ?? 0) : 0;
                  return (
                    <button
                      key={date}
                      onClick={e => {
                        if (!inMonth) return;
                        if (e.shiftKey && lastCalSelected && lastCalSelected !== date) {
                          // Range select between lastCalSelected and date
                          const d1 = new Date(lastCalSelected);
                          const d2 = new Date(date);
                          const [start, end] = d1 < d2 ? [d1, d2] : [d2, d1];
                          setSelectedCalDates(prev => {
                            const next = new Set(prev);
                            const cur  = new Date(start);
                            while (cur <= end) {
                              next.add(localDate(cur.toISOString()));
                              cur.setDate(cur.getDate() + 1);
                            }
                            return next;
                          });
                        } else {
                          setSelectedCalDates(prev => {
                            const next = new Set(prev);
                            if (next.has(date)) next.delete(date);
                            else next.add(date);
                            return next;
                          });
                        }
                        setLastCalSelected(date);
                        setSelectedId(null);
                      }}
                      disabled={!inMonth}
                      className={`flex flex-col items-center justify-center rounded-lg min-h-[30px] py-0.5 transition-all ${
                        !inMonth   ? 'opacity-20 cursor-default' :
                        isSelected ? 'bg-blue-600 cursor-pointer' :
                                     'hover:bg-slate-100 cursor-pointer'
                      }`}
                    >
                      <span className={`text-[11px] font-semibold leading-none ${
                        isSelected ? 'text-white' :
                        isToday    ? 'text-blue-600 font-bold' :
                        inMonth    ? 'text-slate-700' : 'text-slate-300'
                      }`}>{day}</span>
                      {count > 0 && (
                        <span className={`text-[8px] font-bold leading-none mt-0.5 ${
                          isSelected ? 'text-blue-200' : 'text-blue-500'
                        }`}>{count}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Active filter indicator */}
              {selectedCalDates.size > 0 && (
                <div className="px-3 pb-2 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 font-medium">
                    {selectedCalDates.size === 1
                      ? `${[...selectedCalDates][0]} · ${visibleTrips.length} trip${visibleTrips.length !== 1 ? 's' : ''}`
                      : `${selectedCalDates.size} days · ${visibleTrips.length} trip${visibleTrips.length !== 1 ? 's' : ''}`}
                  </span>
                  <button
                    onClick={() => { setSelectedCalDates(new Set()); setLastCalSelected(null); }}
                    className="text-[10px] font-semibold text-blue-500 hover:text-blue-700 transition"
                  >Clear</button>
                </div>
              )}
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
              ) : visibleTrips.map((t) => {
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
                      {/* Row 1: trip number + date + status */}
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] text-slate-500 font-medium">
                          <span className="font-mono font-bold text-slate-300">#{tripNumber(t.id)}</span>
                          {' · '}{fmtDate(t.created_at)}
                        </span>
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

          {/* ── Right: Map + event sidebar ─────────────────────── */}
          <div className="flex-1 flex overflow-hidden">

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

            {/* ── Event sidebar ─────────────────────────────────── */}
            {selectedTrip && (() => {
              const evs = tripEvents(selectedTrip);
              const km  = kmFor(selectedTrip);
              const dur = tripDuration(selectedTrip.created_at, selectedTrip.updated_at);
              const displayEvs    = evs.filter(e => e.event_type !== 'MOVEMENT_START');
              const departureEv   = evs.find(e => e.event_type === 'GEOFENCE_EXIT_DEPOT');
              const arrivalEv     = evs.find(e => e.event_type === 'GEOFENCE_ENTER_STATION');
              const departureTime = departureEv?.occurred_at ?? selectedTrip.created_at;
              const hasArrived    = ['ARRIVED','DELIVERY_ACCEPTED','COMPLETED'].includes(selectedTrip.status);
              const arrivalTime   = arrivalEv?.occurred_at ?? (hasArrived ? selectedTrip.updated_at : null);
              const tripNum       = tripNumber(selectedTrip.id);

              async function printTripPDF() {
                const stopDurOf = (ev: ApiAssetEvent) => {
                  const next = evs.find(e =>
                    e.event_type === 'MOVEMENT_START' &&
                    new Date(e.occurred_at) > new Date(ev.occurred_at)
                  );
                  if (!next) return '';
                  const mins = Math.round((new Date(next.occurred_at).getTime() - new Date(ev.occurred_at).getTime()) / 60000);
                  return mins < 1 ? '< 1 min' : mins < 60 ? `${mins} min` : `${Math.floor(mins/60)}h ${mins%60}m`;
                };

                // ── SVG route map ────────────────────────────────────
                const gpsTrack = tripGpsTrack(selectedTrip!);
                // Fetch road-snapped route from OSRM (same logic as TripHistoryMap)
                let roadTrack: [number, number][] = gpsTrack;
                if (gpsTrack.length >= 2) {
                  try {
                    const lats    = gpsTrack.map(p => p[0]);
                    const lngs    = gpsTrack.map(p => p[1]);
                    const latSpan = Math.max(...lats) - Math.min(...lats);
                    const lngSpan = Math.max(...lngs) - Math.min(...lngs);
                    let wpStr: string;
                    if (latSpan > 0.01 || lngSpan > 0.01) {
                      const step   = Math.max(1, Math.floor(gpsTrack.length / 12));
                      const sample: [number, number][] = [gpsTrack[0]];
                      for (let i = step; i < gpsTrack.length - 1; i += step) sample.push(gpsTrack[i]);
                      sample.push(gpsTrack[gpsTrack.length - 1]);
                      wpStr = sample.map(([lat, lng]) => `${lng},${lat}`).join(';');
                    } else {
                      const r = routes.find(rt => rt.id === selectedTrip!.id);
                      wpStr = r ? `${r.originLng},${r.originLat};${r.destLng},${r.destLat}` : `${gpsTrack[0][1]},${gpsTrack[0][0]};${gpsTrack[gpsTrack.length-1][1]},${gpsTrack[gpsTrack.length-1][0]}`;
                    }
                    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${wpStr}?overview=full&geometries=geojson`;
                    const osrmRes  = await fetch(osrmUrl);
                    const osrmData = await osrmRes.json();
                    const coords: number[][] | undefined = osrmData.routes?.[0]?.geometry?.coordinates;
                    if (coords && coords.length > 0) {
                      roadTrack = coords.map(([lng, lat]) => [lat, lng] as [number, number]);
                    }
                  } catch {
                    // fall back to GPS breadcrumbs if OSRM unavailable
                  }
                }
                // Serialize data for the Leaflet map script
                // Use route endpoints rather than trip origin_lat/lng to avoid 0,0 bad coords
                const depotPt: [number, number] = (
                  selectedTrip!.origin_lat && selectedTrip!.origin_lng
                    ? [selectedTrip!.origin_lat, selectedTrip!.origin_lng]
                    : roadTrack[0] ?? [0, 0]
                );
                const destPt: [number, number] = (
                  selectedTrip!.dest_lat && selectedTrip!.dest_lng
                    ? [selectedTrip!.dest_lat, selectedTrip!.dest_lng]
                    : roadTrack[roadTrack.length - 1] ?? [0, 0]
                );
                const mapData = {
                  roadTrack,
                  evPoints: (() => {
                    // For events with no GPS (e.g. MOVEMENT_STOP), borrow coords from the nearest event that has them
                    let lastLat: number | null = null, lastLng: number | null = null;
                    return evs.map(ev => {
                      if (ev.latitude != null && ev.longitude != null) {
                        lastLat = ev.latitude; lastLng = ev.longitude;
                      }
                      const lat = ev.latitude ?? lastLat;
                      const lng = ev.longitude ?? lastLng;
                      if (lat == null || lng == null) return null;
                      return { lat, lng, color: eventColor(ev.event_type), label: EVENT_LABEL[ev.event_type] ?? ev.event_type, t: ev.occurred_at };
                    }).filter((p): p is NonNullable<typeof p> => p !== null);
                  })(),
                  depotLat: depotPt[0],
                  depotLng: depotPt[1],
                  destLat:  destPt[0],
                  destLng:  destPt[1],
                  destName: selectedTrip!.dest_name ?? 'Destination',
                  zones: geofences.map(z => ({ lat: z.lat, lng: z.lng, radius: z.radius, name: z.name, type: z.type })),
                };

                // ── Event table rows ─────────────────────────────────
                const rows = displayEvs.map(ev => {
                  const isStop     = ev.event_type === 'MOVEMENT_STOP';
                  const isCritical = ['FUEL_THEFT','BATTERY_OFF'].includes(ev.event_type);
                  const isFuel     = ['FUEL_FILL','FUEL_DRAIN','FUEL_THEFT'].includes(ev.event_type);
                  const delta      = ev.value_before != null && ev.value_after != null ? ev.value_after - ev.value_before : null;
                  const detail     = isStop && stopDurOf(ev) ? `Stopped ${stopDurOf(ev)}` : (ev.geofence_zone ?? '');
                  const fuelStr    = isFuel && delta != null
                    ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)} L → ${ev.value_after!.toFixed(1)} L`
                    : '';
                  const dotColor   = eventColor(ev.event_type);
                  const rowBg      = isCritical ? '#fff5f5' : isStop ? '#fffbeb' : 'transparent';
                  const labelColor = isCritical ? '#b91c1c' : isStop ? '#b45309' : '#0f172a';
                  return `<tr style="background:${rowBg}">
                    <td style="color:#64748b;font-size:11px">${fmtTime12(ev.occurred_at)}</td>
                    <td>
                      <span style="display:inline-flex;align-items:center;gap:5px">
                        <span style="width:8px;height:8px;border-radius:50%;background:${dotColor};flex-shrink:0;display:inline-block"></span>
                        <span style="color:${labelColor};font-weight:600">${EVENT_LABEL[ev.event_type] ?? ev.event_type}</span>
                      </span>
                    </td>
                    <td style="color:#64748b;font-size:12px">${detail}</td>
                    <td style="font-weight:600;color:${fuelStr.startsWith('+') ? '#16a34a' : fuelStr ? '#dc2626' : '#94a3b8'}">${fuelStr || '—'}</td>
                  </tr>`;
                }).join('');

                // ── Fuel summary ──────────────────────────────────────────────
                const eventsWithFuelVals = evs.filter(e => e.value_before != null && e.value_after != null);
                const startFuel  = eventsWithFuelVals[0]?.value_before ?? null;
                const endFuel    = eventsWithFuelVals[eventsWithFuelVals.length - 1]?.value_after ?? null;
                const totalFilled  = evs
                  .filter(e => e.event_type === 'FUEL_FILL' && e.value_before != null && e.value_after != null)
                  .reduce((s, e) => s + (e.value_after! - e.value_before!), 0);
                const totalDrained = evs
                  .filter(e => ['FUEL_DRAIN','FUEL_THEFT'].includes(e.event_type) && e.value_before != null && e.value_after != null)
                  .reduce((s, e) => s + Math.abs(e.value_after! - e.value_before!), 0);
                const hasFuelData = eventsWithFuelVals.length > 0;
                const pdfTruck    = truckById.get(selectedTrip!.truck_id);
                const pdfLiveFuel = pdfTruck
                  ? (pdfTruck.compartment_fuel && Object.keys(pdfTruck.compartment_fuel).length > 0
                      ? [1,2,3,4].reduce((s, i) => s + (pdfTruck.compartment_fuel![String(i)] ?? 0), 0)
                      : pdfTruck.total_fuel_liters ?? null)
                  : null;

                // ── Last known / current position ─────────────────────────────
                const lastGpsEv = [...evs].reverse().find(e => e.latitude != null && e.longitude != null) ?? null;
                let positionAddress = '';
                if (lastGpsEv) {
                  try {
                    const geoRes  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lastGpsEv.latitude}&lon=${lastGpsEv.longitude}&format=json`);
                    const geoData = await geoRes.json();
                    positionAddress = (geoData.display_name as string ?? '').replace(/,\s*\d{6,}[^,]*/g, '').trim();
                  } catch { /* coords only */ }
                }
                const positionLabel = selectedTrip!.status === 'EN_ROUTE' ? 'Current Position' : 'Last Known Position';

                const hasMap = roadTrack.length >= 2;
                const html = `<!DOCTYPE html><html><head>
                  <meta charset="utf-8">
                  <title>Trip #${tripNum} — ${selectedTrip!.dest_name ?? 'Trip Report'}</title>
                  ${hasMap ? '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">' : ''}
                  <style>
                    *{box-sizing:border-box;margin:0;padding:0}
                    body{font-family:system-ui,sans-serif;padding:32px 40px;color:#0f172a;font-size:13px}
                    h1{font-size:20px;font-weight:700;margin-bottom:4px}
                    .meta{color:#64748b;font-size:12px;line-height:1.8;margin-bottom:4px}
                    .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;background:#dbeafe;color:#1d4ed8;margin-left:6px;vertical-align:middle}
                    .divider{border:none;border-top:2px solid #e2e8f0;margin:14px 0}
                    #map{width:720px;height:320px;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:16px}
                    .legend{display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:#64748b;margin-bottom:14px}
                    .legend span{display:flex;align-items:center;gap:5px}
                    .dot{width:10px;height:10px;border-radius:50%;display:inline-block;flex-shrink:0}
                    table{width:100%;border-collapse:collapse}
                    th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;padding:8px 10px;border-bottom:2px solid #e2e8f0}
                    td{padding:8px 10px;border-bottom:1px solid #f1f5f9;vertical-align:top}
                    .ms{background:#f8fafc;font-weight:600}
                    .footer{margin-top:28px;font-size:11px;color:#94a3b8;text-align:right}
                    .fuel-row{display:flex;gap:10px;margin-bottom:14px}
                    .fuel-box{flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:9px 12px}
                    .fuel-box.green{background:#f0fdf4;border-color:#86efac}
                    .fuel-box.red{background:#fff5f5;border-color:#fca5a5}
                    .fuel-box-label{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:3px}
                    .fuel-box-val{font-size:17px;font-weight:700;color:#0f172a}
                    .fuel-box.green .fuel-box-val{color:#16a34a}
                    .fuel-box.red .fuel-box-val{color:#dc2626}
                    .pos-section{margin-top:18px;padding:12px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px}
                    .pos-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:7px;display:flex;align-items:center;gap:8px}
                    .pos-badge{padding:2px 8px;border-radius:999px;font-size:9px;font-weight:700}
                    .pos-badge.live{background:#dcfce7;color:#16a34a}
                    .pos-badge.done{background:#dbeafe;color:#1d4ed8}
                    .pos-coords{font-family:monospace;font-size:12px;color:#0f172a;margin-bottom:2px}
                    .pos-addr{font-size:11px;color:#475569;line-height:1.5}
                    .pos-ts{font-size:10px;color:#94a3b8;margin-top:4px}
                    @media print{body{padding:16px 20px}#map{height:320px;-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{margin:.8cm;size:A4}}
                  </style>
                </head><body>
                  <h1>Trip #${tripNum} — ${selectedTrip!.dest_name ?? 'Unknown'}<span class="badge">${STATUS_LABEL[selectedTrip!.status] ?? selectedTrip!.status}</span></h1>
                  <div class="meta">${fmtDate(selectedTrip!.created_at)} &nbsp;·&nbsp; ${fmtTime12(selectedTrip!.created_at)} → ${fmtTime12(selectedTrip!.updated_at)}${dur ? ` &nbsp;·&nbsp; ${dur}` : ''}${km != null ? ` &nbsp;·&nbsp; ${km.toFixed(1)} km` : ''} &nbsp;·&nbsp; ${displayEvs.length} events</div>
                  <hr class="divider">
                  ${hasFuelData ? `<div class="fuel-row">
                    ${startFuel != null ? `<div class="fuel-box"><div class="fuel-box-label">Starting Fuel</div><div class="fuel-box-val">${startFuel.toFixed(1)} L</div></div>` : ''}
                    ${totalFilled > 0 ? `<div class="fuel-box green"><div class="fuel-box-label">Filled</div><div class="fuel-box-val">+${totalFilled.toFixed(1)} L</div></div>` : ''}
                    ${totalDrained > 0 ? `<div class="fuel-box red"><div class="fuel-box-label">Drained / Theft</div><div class="fuel-box-val">−${totalDrained.toFixed(1)} L</div></div>` : ''}
                    ${endFuel != null ? `<div class="fuel-box"><div class="fuel-box-label">Ending Fuel</div><div class="fuel-box-val">${endFuel.toFixed(1)} L</div></div>` : ''}
                    ${pdfLiveFuel != null ? `<div class="fuel-box" style="border-color:#bfdbfe;background:#eff6ff"><div class="fuel-box-label" style="color:#3b82f6">Current Tank</div><div class="fuel-box-val" style="color:#1d4ed8">${pdfLiveFuel.toFixed(1)} L</div></div>` : ''}
                  </div>` : `<div style="font-size:11px;color:#94a3b8;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between">
                    <span>No fuel sensor events recorded for this trip.</span>
                    ${pdfLiveFuel != null ? `<span style="font-size:13px;font-weight:700;color:#1d4ed8">⛽ ${pdfLiveFuel.toFixed(1)} L</span>` : ''}
                  </div>`}
                  ${hasMap ? `
                  <div id="map"></div>
                  <div class="legend">
                    <span><span class="dot" style="background:#7c3aed"></span>At Depot</span>
                    <span><span class="dot" style="background:#0369a1"></span>At Station</span>
                    <span><span class="dot" style="background:#dc2626"></span>Fuel Theft</span>
                    <span><span class="dot" style="background:#ea580c"></span>Fuel Drain</span>
                    <span><span class="dot" style="background:#16a34a"></span>Fuel Fill</span>
                    <span><span class="dot" style="background:#f59e0b"></span>Stopped</span>
                    <span><span class="dot" style="background:#ca8a04"></span>Engine</span>
                    <span><span class="dot" style="background:#0d9488"></span>Power</span>
                    <span><span class="dot" style="background:#059669"></span>Geofences</span>
                  </div>` : ''}
                  <p style="font-size:10px;color:#94a3b8;margin:0 0 10px">
                    <strong style="color:#64748b">Fuel column</strong> — shows <em>change → tank level after</em> (e.g. +5.2 L → 45.1 L) only for fill, drain, or theft events. A dash (—) means no fuel event at that moment; it does not indicate a sensor fault.
                  </p>
                  <table>
                    <thead><tr><th>Time</th><th>Event</th><th>Detail</th><th>Fuel</th></tr></thead>
                    <tbody>
                      <tr class="ms"><td>${fmtTime12(departureTime)}</td><td>🏭 Left Depot</td><td>${selectedTrip!.origin_name ?? ''}</td><td>—</td></tr>
                      ${rows}
                      <tr class="ms"><td>${arrivalTime ? fmtTime12(arrivalTime) : '—'}</td><td>📍 ${hasArrived ? 'Arrived' : 'En Route…'}</td><td>${selectedTrip!.dest_name ?? ''}</td><td style="color:#1d4ed8;font-weight:700">${pdfLiveFuel != null ? pdfLiveFuel.toFixed(1) + ' L' : '—'}</td></tr>
                    </tbody>
                  </table>
                  ${lastGpsEv ? `<div class="pos-section">
                    <div class="pos-title">${positionLabel}<span class="pos-badge ${selectedTrip!.status === 'EN_ROUTE' ? 'live' : 'done'}">${selectedTrip!.status === 'EN_ROUTE' ? '● En Route' : STATUS_LABEL[selectedTrip!.status] ?? selectedTrip!.status}</span></div>
                    <div class="pos-coords">${lastGpsEv.latitude?.toFixed(6)}°N, ${lastGpsEv.longitude?.toFixed(6)}°E</div>
                    ${positionAddress ? `<div class="pos-addr">${positionAddress}</div>` : ''}
                    <div class="pos-ts">Updated: ${fmtTime12(lastGpsEv.occurred_at)}</div>
                  </div>` : ''}
                  <div class="footer">Generated ${new Date().toLocaleString()}</div>
                  ${hasMap ? `<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
                  <script>
                    var d = ${JSON.stringify(mapData)};
                    var _map = null;
                    var _centerLat = (d.depotLat + d.destLat) / 2;
                    var _centerLng = (d.depotLng + d.destLng) / 2;
                    var _bounds = [[d.depotLat, d.depotLng], [d.destLat, d.destLng]];
                    function fitMap() {
                      if (!_map) return;
                      _map.invalidateSize(false);
                      var z = _map.getBoundsZoom(L.latLngBounds(_bounds), false);
                      _map.setView([_centerLat, _centerLng], Math.max(z + 0.499, 1), { animate: false });
                    }
                    window.onbeforeprint = fitMap;
                    window.addEventListener('load', function() {
                      setTimeout(function() {
                        _map = L.map('map', { zoomControl: true, attributionControl: true });
                        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                          attribution: '© OpenStreetMap contributors', maxZoom: 19
                        }).addTo(_map);
                        _map.invalidateSize(false);
                        var clean = d.roadTrack.filter(function(p) {
                          return p[0] !== 0 && p[1] !== 0 && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;
                        });
                        // If OSRM/GPS track is sparse, build route from event GPS points (always valid)
                        if (clean.length < 2 && d.evPoints.length >= 2) {
                          var sorted = d.evPoints.slice().sort(function(a,b){ return a.t < b.t ? -1 : 1; });
                          clean = sorted.map(function(p){ return [p.lat, p.lng]; });
                        }
                        // Last-resort: straight line depot→destination
                        if (clean.length < 2) {
                          clean = [[d.depotLat, d.depotLng], [d.destLat, d.destLng]];
                        }
                        L.polyline(clean, { color: '#3b82f6', weight: 5, opacity: 1 }).addTo(_map);
                        var start = clean[0];
                        var end   = clean[clean.length - 1];
                        function makePin(color, label) {
                          return L.divIcon({
                            html: '<div style="display:flex;flex-direction:column;align-items:center">'
                                + '<div style="width:18px;height:18px;border-radius:50%;background:' + color + ';border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5)"></div>'
                                + '<div style="background:' + color + ';color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;margin-top:2px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.3)">' + label + '</div>'
                                + '</div>',
                            iconSize: [80, 44], iconAnchor: [9, 9], className: ''
                          });
                        }
                        L.marker(start, { icon: makePin('#7c3aed', 'Depot') }).addTo(_map);
                        L.marker(end,   { icon: makePin('#0369a1', d.destName) }).addTo(_map);
                        // Geofence boundary circles
                        d.zones.forEach(function(z) {
                          var isDepot = z.type === 'depot';
                          L.circle([z.lat, z.lng], {
                            radius: z.radius,
                            color:       isDepot ? '#7c3aed' : '#0369a1',
                            weight:      2,
                            opacity:     0.8,
                            fillColor:   isDepot ? '#7c3aed' : '#0369a1',
                            fillOpacity: 0.08,
                            dashArray:   '6 4',
                          }).bindTooltip(z.name, { permanent: false, direction: 'top' }).addTo(_map);
                        });
                        // Event dots
                        d.evPoints.forEach(function(p) {
                          if (!p.lat || !p.lng) return;
                          L.circleMarker([p.lat, p.lng], {
                            radius: 6, color: '#fff', weight: 1.5, fillColor: p.color, fillOpacity: 1
                          }).addTo(_map);
                        });
                        fitMap();
                        // Auto-print after tiles have had time to load
                        setTimeout(function() { fitMap(); window.print(); }, 4000);
                      }, 300);
                    });
                  <\/script>` : '<script>window.onload=function(){window.print()};<\/script>'}
                </body></html>`;

                const w = window.open('', '_blank');
                if (w) { w.document.write(html); w.document.close(); }
              }

              return (
                <div className="w-64 shrink-0 border-l border-slate-200 bg-white flex flex-col overflow-hidden">

                  {/* Sidebar header */}
                  <div className="px-4 py-3 border-b border-slate-100 shrink-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5" style={{ background: selectedColor }} />
                        <p className="text-[13px] font-bold text-slate-800 leading-tight truncate">
                          {selectedTrip.dest_name || 'Unknown Destination'}
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedId(null)}
                        className="shrink-0 text-slate-300 hover:text-slate-500 transition w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-100"
                      >✕</button>
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono pl-4">
                      <span className="font-sans font-semibold text-slate-300 mr-1">Trip #{tripNum}</span>
                      {fmtDate(selectedTrip.created_at)}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono pl-4 mt-0.5">
                      {fmtTime12(selectedTrip.created_at)} → {fmtTime12(selectedTrip.updated_at)}
                      {dur ? ` · ${dur}` : ''}
                      {km != null ? ` · ${km.toFixed(1)} km` : ''}
                    </p>
                    <div className="flex items-center justify-between pl-4 mt-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_STYLE[selectedTrip.status] ?? 'bg-slate-100 text-slate-600'}`}>
                          {STATUS_LABEL[selectedTrip.status] ?? selectedTrip.status}
                        </span>
                        <span className="text-[10px] text-slate-400">{displayEvs.length} events</span>
                      </div>
                      <button
                        onClick={printTripPDF}
                        title="Download as PDF"
                        className="text-[10px] font-semibold text-blue-500 hover:text-blue-700 flex items-center gap-1 transition"
                      >
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M8 2v9M4 7l4 4 4-4"/><path d="M2 13h12"/>
                        </svg>
                        PDF
                      </button>
                    </div>
                  </div>

                  {/* Vertical timeline — scrolls top to bottom */}
                  <div className="flex-1 overflow-y-auto py-3 px-3">

                    {/* ── Depot milestone ── */}
                    <div className="flex gap-2.5 mb-1">
                      <div className="flex flex-col items-center shrink-0" style={{ width: 20 }}>
                        <span className="text-sm leading-none">🏭</span>
                        <div className="w-px flex-1 bg-violet-200 mt-1" />
                      </div>
                      <div className="pb-3 min-w-0">
                        <p className="text-[11px] font-bold text-violet-700 leading-tight">Left Depot</p>
                        <p className="text-[10px] text-slate-400 font-mono">{fmtTime12(departureTime)}</p>
                        {selectedTrip.origin_name && (
                          <p className="text-[10px] text-slate-500 truncate">{selectedTrip.origin_name}</p>
                        )}
                      </div>
                    </div>

                    {/* ── Events ── */}
                    {displayEvs.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic pl-7 py-2">No events recorded</p>
                    ) : displayEvs.map((ev, i) => {
                      const color      = eventColor(ev.event_type);
                      const isStop     = ev.event_type === 'MOVEMENT_STOP';
                      const isCritical = ev.event_type === 'FUEL_THEFT';
                      const isFuel     = ['FUEL_FILL','FUEL_DRAIN','FUEL_THEFT'].includes(ev.event_type);
                      const isLast     = i === displayEvs.length - 1;
                      const delta      = ev.value_before != null && ev.value_after != null
                        ? ev.value_after - ev.value_before : null;

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
                        <div key={ev.id} className="flex gap-2.5 mb-1">
                          {/* Timeline dot + line */}
                          <div className="flex flex-col items-center shrink-0" style={{ width: 20 }}>
                            <span
                              className="w-3 h-3 rounded-full shrink-0 border-2 border-white shadow-sm mt-0.5"
                              style={{ background: color }}
                            />
                            {!isLast && <div className="w-px flex-1 bg-slate-200 mt-0.5" />}
                          </div>

                          {/* Content */}
                          <div className={`pb-3 min-w-0 flex-1 ${
                            isCritical ? 'bg-red-50 rounded-lg px-2 py-1.5 -mx-1' :
                            isStop     ? 'bg-amber-50 rounded-lg px-2 py-1.5 -mx-1' : ''
                          }`}>
                            <div className="flex items-start gap-1">
                              <span className="text-sm leading-none shrink-0">{EVENT_ICON[ev.event_type] ?? '•'}</span>
                              <p className={`text-[11px] font-bold leading-tight ${
                                isCritical ? 'text-red-700' : isStop ? 'text-amber-700' : 'text-slate-700'
                              }`}>
                                {EVENT_LABEL[ev.event_type] ?? ev.event_type}
                              </p>
                            </div>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{fmtTime12(ev.occurred_at)}</p>
                            {stopDuration && (
                              <p className="text-[10px] font-semibold text-amber-600 mt-0.5">Stopped {stopDuration}</p>
                            )}
                            {ev.geofence_zone && (
                              <p className="text-[10px] text-slate-500 truncate mt-0.5">{ev.geofence_zone}</p>
                            )}
                            {isFuel && delta != null && (
                              <>
                                <p className={`text-[11px] font-bold mt-0.5 ${delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {delta > 0 ? '+' : ''}{delta.toFixed(1)} L
                                </p>
                                {ev.value_after != null && (
                                  <p className="text-[10px] text-slate-500 mt-0">Tank: {ev.value_after.toFixed(1)} L</p>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* ── Destination milestone ── */}
                    <div className="flex gap-2.5">
                      <div className="flex flex-col items-center shrink-0" style={{ width: 20 }}>
                        <span className="text-sm leading-none">📍</span>
                      </div>
                      <div className="min-w-0">
                        <p className={`text-[11px] font-bold leading-tight ${hasArrived ? 'text-blue-700' : 'text-slate-400'}`}>
                          {hasArrived ? 'Arrived' : 'En Route…'}
                        </p>
                        {arrivalTime && <p className="text-[10px] text-slate-400 font-mono">{fmtTime12(arrivalTime)}</p>}
                        <p className="text-[10px] text-slate-500 truncate">{selectedTrip.dest_name}</p>
                        {!hasArrived && <p className="text-[10px] text-slate-400 italic">Not yet arrived</p>}
                      </div>
                    </div>

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
