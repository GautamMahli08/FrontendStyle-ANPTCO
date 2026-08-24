'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api, type ApiTruck, type ApiAssetEvent, type ApiGeofence } from '@/src/lib/api';
import type { FleetMarker, TestWaypoint, DepotZone } from '@/src/components/FleetMap';

const FleetMap = dynamic(() => import('@/src/components/FleetMap'), { ssr: false });

const EVENT_CFG: Record<string, { label: string; dot: string; icon: string; urgent?: boolean }> = {
  // Geofence transitions — shown first in the alert feed
  GEOFENCE_ENTER_STATION: { label: 'Entered Station Zone',   dot: 'bg-green-500',  icon: '📍' },
  GEOFENCE_EXIT_STATION:  { label: 'Left Station Zone',      dot: 'bg-slate-400',  icon: '📍' },
  GEOFENCE_ENTER_DEPOT:   { label: 'Arrived at Depot',       dot: 'bg-indigo-500', icon: '🏭' },
  GEOFENCE_EXIT_DEPOT:    { label: 'Left Depot',             dot: 'bg-slate-300',  icon: '🏭' },
  // Asset state transitions
  FUEL_THEFT:     { label: 'FUEL THEFT SUSPECTED',  dot: 'bg-red-600',    icon: '🚨', urgent: true },
  FUEL_DRAIN:     { label: 'Fuel Drain (en route)', dot: 'bg-orange-400', icon: '⛽' },
  BATTERY_OFF:    { label: 'Power Disconnected',    dot: 'bg-orange-500', icon: '⚠️', urgent: true },
  FUEL_FILL:      { label: 'Fuel Fill',             dot: 'bg-green-500',  icon: '⛽' },
  IGNITION_ON:    { label: 'Ignition ON',           dot: 'bg-yellow-500', icon: '🔑' },
  IGNITION_OFF:   { label: 'Ignition OFF',          dot: 'bg-gray-400',   icon: '🔑' },
  MOVEMENT_START: { label: 'Vehicle Moving',        dot: 'bg-blue-500',   icon: '🚛' },
  MOVEMENT_STOP:  { label: 'Vehicle Stopped',       dot: 'bg-gray-400',   icon: '🛑' },
  BATTERY_ON:     { label: 'External Power ON',     dot: 'bg-blue-400',   icon: '🔋' },
};

const WP_DOT = ['bg-blue-500', 'bg-purple-500'];

const FIXED_DEST: TestWaypoint = {
  id:     'fixed-dest',
  lat:    23.6540469,
  lng:    58.0965125,
  name:   'Destination',
  radius: 500,
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function TransportFleetMonitorPage() {
  const router = useRouter();
  const user   = getCurrentUser();

  const [trucks,       setTrucks]       = useState<ApiTruck[]>([]);
  const [alerts,       setAlerts]       = useState<ApiAssetEvent[]>([]);
  const [depots,       setDepots]       = useState<ApiGeofence[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const initialLoad    = useRef(true);

  // Fixed destination — always pre-set, reset restores it
  const [waypoints,    setWaypoints]    = useState<TestWaypoint[]>([{ ...FIXED_DEST }]);

  const [downloading, setDownloading] = useState(false);

  // Dispatch controls
  const [destTruck,       setDestTruck]       = useState('');
  const [dispatching,     setDispatching]     = useState<string | null>(null);
  const [completing,      setCompleting]      = useState<string | null>(null);
  const [dispatchMsgs,    setDispatchMsgs]    = useState<Record<string, {
    ok: boolean; msg: string; tripId?: string; tripStatus?: string;
  }>>({});

  // Depot modal
  const [showDepot,    setShowDepot]    = useState(false);
  const [depotName,    setDepotName]    = useState('Main Depot');
  const [depotLat,     setDepotLat]     = useState('');
  const [depotLng,     setDepotLng]     = useState('');
  const [depotRadius,  setDepotRadius]  = useState('500');
  const [savingDepot,  setSavingDepot]  = useState(false);
  const [depotErr,     setDepotErr]     = useState('');

  const loadTrucks = useCallback(async () => {
    try {
      setTrucks((await api.trucks.list()) ?? []);
      setError(null);
    } catch (e: any) {
      // Only surface the error on the very first load; silent on background polls
      // so a transient network blip doesn't flash a red banner every 30 seconds.
      if (initialLoad.current) setError(e.message ?? 'Failed to load trucks');
    } finally {
      setLoading(false);
      initialLoad.current = false;
    }
  }, []);

  const loadAlerts  = useCallback(async () => {
    try { setAlerts((await api.fleet.events()) ?? []); } catch {}
  }, []);

  const loadDepots  = useCallback(async () => {
    try { setDepots((await api.depots.list()) ?? []); } catch {}
  }, []);

  useEffect(() => {
    if (!user) { router.replace('/auth/login'); return; }
    // Trucks refresh every 5 s for smooth map movement; alerts every 30 s.
    loadTrucks();
    loadAlerts();
    loadDepots();
    const t1 = setInterval(() => loadTrucks(), 5_000);
    const t2 = setInterval(() => loadAlerts(), 30_000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [loadTrucks, loadAlerts, loadDepots, router, user]);

  // Pre-select the first truck
  useEffect(() => {
    if (!destTruck && trucks.length > 0) setDestTruck(trucks[0].id);
  }, [trucks, destTruck]);

  const downloadReport = async () => {
    setDownloading(true);
    try {
      const [trips, events] = await Promise.all([
        api.trips.list(),
        api.fleet.events(),
      ]);

      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const row = (cols: unknown[]) => cols.map(esc).join(',');

      const lines: string[] = [];

      // ── Trip history ──────────────────────────────────────────
      lines.push('TRIP HISTORY');
      lines.push(row(['Trip ID','Truck ID','Destination','Origin','Status','Created','Updated']));
      for (const t of (trips ?? []).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())) {
        lines.push(row([t.id, t.truck_id, t.dest_name, t.origin_name ?? '', t.status, t.created_at, t.updated_at]));
      }

      lines.push('');

      // ── Asset events ──────────────────────────────────────────
      lines.push('ASSET EVENTS');
      lines.push(row(['Timestamp','Event Type','Truck ID','Geofence Zone','Value Before','Value After','Latitude','Longitude']));
      for (const e of (events ?? []).sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())) {
        lines.push(row([e.occurred_at, e.event_type, e.truck_id, e.geofence_zone ?? '', e.value_before ?? '', e.value_after ?? '', e.latitude ?? '', e.longitude ?? '']));
      }

      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `fleet-activity-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(`Download failed: ${e.message}`);
    } finally {
      setDownloading(false);
    }
  };

  const updateWaypoint = (id: string, patch: Partial<TestWaypoint>) =>
    setWaypoints(prev => prev.map(w => w.id === id ? { ...w, ...patch } : w));

  const resetTest = () => {
    setWaypoints([{ ...FIXED_DEST }]);
    setDispatchMsgs({});
  };

  const dispatchWaypoint = async (wp: TestWaypoint) => {
    if (!destTruck) {
      setDispatchMsgs(prev => ({ ...prev, [wp.id]: { ok: false, msg: 'Select a truck first.' } }));
      return;
    }
    setDispatching(wp.id);
    const truck = trucks.find(t => t.id === destTruck);
    try {
      const trip = await api.fleet.dispatch({
        truck_id:           destTruck,
        dest_name:          wp.name,
        dest_lat:           wp.lat,
        dest_lng:           wp.lng,
        dest_radius_meters: wp.radius,
        origin_name:        truck ? 'Current Position' : undefined,
        origin_lat:         truck?.latitude  ?? undefined,
        origin_lng:         truck?.longitude ?? undefined,
      });
      updateWaypoint(wp.id, { dispatched: true });
      setDispatchMsgs(prev => ({ ...prev, [wp.id]: { ok: true, msg: `En route · ${trip.id.slice(0, 8)}…`, tripId: trip.id, tripStatus: trip.status } }));
    } catch (e: any) {
      setDispatchMsgs(prev => ({ ...prev, [wp.id]: { ok: false, msg: e.message } }));
    } finally {
      setDispatching(null);
    }
  };

  const completeDelivery = async (wpId: string, tripId: string) => {
    setCompleting(wpId);
    try {
      await api.trips.scan(tripId, {});
      setDispatchMsgs(prev => ({ ...prev, [wpId]: { ...prev[wpId], tripStatus: 'DELIVERY_ACCEPTED', msg: 'Delivery confirmed ✓' } }));
    } catch (e: any) {
      setDispatchMsgs(prev => ({ ...prev, [wpId]: { ...prev[wpId], msg: `Complete failed: ${e.message}` } }));
    } finally {
      setCompleting(null);
    }
  };

  // Poll trip status every 10 s for active dispatched trips
  useEffect(() => {
    // Keep polling through DELIVERY_ACCEPTED — depot entry auto-advances to COMPLETED
    const active = Object.entries(dispatchMsgs).filter(
      ([, m]) => m.ok && m.tripId && m.tripStatus !== 'COMPLETED'
    );
    if (active.length === 0) return;
    const t = setInterval(async () => {
      for (const [wpId, m] of active) {
        try {
          const trip = await api.trips.get(m.tripId!);
          setDispatchMsgs(prev => ({
            ...prev,
            [wpId]: {
              ...prev[wpId],
              tripStatus: trip.status,
              msg: trip.status === 'ARRIVED'    ? 'Arrived at destination!'
                 : trip.status === 'COMPLETED'  ? 'Returned to depot — trip complete.'
                 : prev[wpId].msg,
            },
          }));
        } catch {}
      }
    }, 10_000);
    return () => clearInterval(t);
  }, [dispatchMsgs]);

  const handleSaveDepot = async () => {
    if (!depotLat || !depotLng) { setDepotErr('Latitude and longitude are required.'); return; }
    setSavingDepot(true);
    setDepotErr('');
    try {
      await api.depots.create({
        name:          depotName || 'Main Depot',
        latitude:      parseFloat(depotLat),
        longitude:     parseFloat(depotLng),
        radius_meters: parseInt(depotRadius) || 100,
      });
      await loadDepots();
      setShowDepot(false);
    } catch (e: any) {
      setDepotErr(e.message);
    } finally {
      setSavingDepot(false);
    }
  };

  if (!user) return null;

  const markers: FleetMarker[] = trucks
    .filter(t => t.latitude != null && t.longitude != null)
    .map(t => ({
      id:              t.id,
      lat:             t.latitude!,
      lng:             t.longitude!,
      label:           t.device_id,
      status:          t.status,
      speed:           t.speed ?? null,
      totalFuel:       t.total_fuel_liters,
      compartmentFuel: t.compartment_fuel,
    }));

  const sortedAlerts = [...alerts].sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
  );
  const noDepot = depots.length === 0;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="TRANSPORT_ADMIN" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Fleet Monitor" user={user} />
        <main className="flex-1 overflow-y-auto p-6 space-y-5">

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
          )}

          {/* ── Fuel Theft Banner ── */}
          {(() => {
            const thefts = sortedAlerts.filter(e => e.event_type === 'FUEL_THEFT');
            if (thefts.length === 0) return null;
            return (
              <div className="bg-red-600 text-white rounded-xl px-5 py-4 flex items-start gap-4 shadow-lg">
                <span className="text-2xl shrink-0">🚨</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-base">Fuel Theft Alert — {thefts.length} incident{thefts.length > 1 ? 's' : ''} detected</p>
                  <p className="text-red-100 text-xs mt-0.5">
                    Fuel drop detected while ignition was OFF and truck was stationary.
                  </p>
                  <div className="mt-2 space-y-1">
                    {thefts.slice(0, 3).map(ev => (
                      <p key={ev.id} className="text-xs text-red-100 font-mono">
                        Truck {ev.truck_id.slice(0, 8)}… —{' '}
                        {ev.value_before != null && ev.value_after != null
                          ? `${ev.value_before.toFixed(1)} → ${ev.value_after.toFixed(1)} L (−${(ev.value_before - ev.value_after).toFixed(1)} L)`
                          : ''}
                        {' · '}{timeAgo(ev.occurred_at)}
                      </p>
                    ))}
                    {thefts.length > 3 && <p className="text-xs text-red-200">+{thefts.length - 3} more</p>}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Total Trucks',    value: trucks.length                },
              { label: 'On Map',          value: markers.length               },
              { label: 'Destination',      value: `${FIXED_DEST.lat.toFixed(4)}, ${FIXED_DEST.lng.toFixed(4)}` },
              { label: 'Events (loaded)', value: alerts.length                },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500">{s.label}</p>
                <p className="text-2xl font-bold text-slate-800 mt-0.5">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Depot missing warning */}
          {noDepot && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-amber-800">Depot not configured</p>
                <p className="text-xs text-amber-600 mt-0.5">Without a depot, trucks returning home won't auto-complete trips.</p>
              </div>
              <button
                onClick={() => {
                  const t = trucks.find(t => t.latitude != null);
                  if (t) { setDepotLat(t.latitude!.toFixed(6)); setDepotLng(t.longitude!.toFixed(6)); }
                  setShowDepot(true);
                }}
                className="shrink-0 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
              >
                Set Depot
              </button>
            </div>
          )}

          {/* ── Main grid: Map + Test Setup + Alerts ── */}
          <div className="grid grid-cols-5 gap-5 items-start">

            {/* Map — 3 cols */}
            <div className="col-span-3 bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-700">Live Map</p>
              </div>
              {loading ? (
                <div className="h-96 flex items-center justify-center text-slate-400 text-sm">Loading…</div>
              ) : markers.length === 0 ? (
                <div className="h-96 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <span className="text-3xl">📍</span>
                  <p className="text-sm">No GPS data yet.</p>
                </div>
              ) : (
                <FleetMap
                  markers={markers}
                  waypoints={waypoints}
                  depots={depots as DepotZone[]}
                  height={520}
                  selectedTruckId={destTruck || undefined}
                />
              )}
            </div>

            {/* Right column — Test Setup + Alert feed */}
            <div className="col-span-2 space-y-4">

              {/* Test point controls */}
              <div className="bg-white rounded-xl border border-slate-200">
                <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Dispatch</p>
                    <p className="text-xs text-slate-400 mt-0.5">Select a truck and dispatch to the fixed destination.</p>
                  </div>
                  {Object.keys(dispatchMsgs).length > 0 && (
                    <button
                      onClick={resetTest}
                      className="shrink-0 text-xs font-medium text-red-500 border border-red-200 hover:bg-red-50 px-2.5 py-1 rounded-lg transition"
                    >
                      Reset
                    </button>
                  )}
                </div>

                <div className="px-4 py-3 space-y-3">
                  {/* Truck + API key — shared for both dispatches */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Truck</label>
                    <select
                      value={destTruck}
                      onChange={e => setDestTruck(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {trucks.map(t => <option key={t.id} value={t.id}>{t.device_id}</option>)}
                    </select>
                  </div>
                </div>

                {/* Fixed destination waypoint */}
                <div className="divide-y divide-slate-50">
                  {waypoints.map((wp, i) => {
                    const msg = dispatchMsgs[wp.id];
                    return (
                      <div key={wp.id} className="px-4 py-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${WP_DOT[i]}`} />
                          <input
                            value={wp.name}
                            onChange={e => updateWaypoint(wp.id, { name: e.target.value })}
                            className="flex-1 text-xs font-semibold text-slate-800 border-0 outline-none bg-transparent"
                            placeholder="Destination"
                          />
                        </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400">
                            <span className="font-mono">{wp.lat.toFixed(5)}, {wp.lng.toFixed(5)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-[11px] text-slate-500 shrink-0">Radius</label>
                            <input
                              value={wp.radius}
                              onChange={e => updateWaypoint(wp.id, { radius: parseInt(e.target.value) || 200 })}
                              type="number" min="50" max="5000"
                              className="w-20 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <span className="text-[11px] text-slate-400">m</span>
                            <button
                              onClick={() => dispatchWaypoint(wp)}
                              disabled={dispatching === wp.id || wp.dispatched}
                              className={`ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                                wp.dispatched
                                  ? 'bg-green-100 text-green-700 cursor-default'
                                  : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white'
                              }`}
                            >
                              {dispatching === wp.id ? 'Dispatching…' : wp.dispatched ? '✓ Active' : 'Dispatch →'}
                            </button>
                          </div>
                          {msg && (
                            <p className={`text-[11px] ${msg.ok ? 'text-green-600' : 'text-red-600'}`}>
                              {msg.tripStatus === 'ARRIVED' ? '📍 Arrived at destination!' : msg.msg}
                            </p>
                          )}
                          {msg?.tripStatus === 'ARRIVED' && msg.tripId && (
                            <button
                              onClick={() => completeDelivery(wp.id, msg.tripId!)}
                              disabled={completing === wp.id}
                              className="w-full text-xs font-semibold bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white py-1.5 rounded-lg transition"
                            >
                              {completing === wp.id ? 'Confirming…' : 'Complete Delivery ✓'}
                            </button>
                          )}
                          {msg?.tripStatus === 'DELIVERY_ACCEPTED' && (
                            <p className="text-[11px] text-amber-600 font-medium">Delivery confirmed ✓ — waiting for truck to return to depot…</p>
                          )}
                          {msg?.tripStatus === 'COMPLETED' && (
                            <p className="text-[11px] text-indigo-600 font-medium">🏭 Returned to depot — trip complete.</p>
                          )}
                        </div>
                      );
                    })}
                </div>

              </div>

              {/* ── Fuel Activity (back in right column) ── */}
              {(() => {
                const fuelEvents = sortedAlerts.filter(e =>
                  e.event_type === 'FUEL_FILL' || e.event_type === 'FUEL_DRAIN' || e.event_type === 'FUEL_THEFT'
                );
                return (
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col" style={{ maxHeight: 320 }}>
                    <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100 shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">⛽</span>
                        <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Fuel Activity</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        fuelEvents.some(e => e.event_type === 'FUEL_THEFT')
                          ? 'bg-red-100 text-red-700'
                          : fuelEvents.length > 0 ? 'bg-orange-100 text-orange-600'
                          : 'bg-slate-100 text-slate-400'
                      }`}>
                        {fuelEvents.length} events
                      </span>
                    </div>
                    <div className="overflow-y-auto flex-1">
                      {fuelEvents.length === 0 ? (
                        <div className="py-6 flex flex-col items-center gap-1">
                          <span className="text-xl opacity-20">⛽</span>
                          <p className="text-[11px] text-slate-400">No fuel events yet</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-50">
                          {fuelEvents.map(ev => {
                            const isTheft = ev.event_type === 'FUEL_THEFT';
                            const isFill  = ev.event_type === 'FUEL_FILL';
                            const delta   = ev.value_before != null && ev.value_after != null
                              ? ev.value_after - ev.value_before : null;
                            return (
                              <div key={ev.id} className={`flex items-stretch ${isTheft ? 'bg-red-50/60' : 'hover:bg-slate-50'} transition`}>
                                <div className={`w-[3px] shrink-0 ${isTheft ? 'bg-red-500' : isFill ? 'bg-green-500' : 'bg-orange-400'}`} />
                                <div className="flex-1 px-3 py-2.5 flex items-center justify-between gap-3 min-w-0">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                      <span className={`text-[9px] font-extrabold px-1.5 py-px rounded uppercase tracking-wide ${
                                        isTheft ? 'bg-red-600 text-white'
                                        : isFill ? 'bg-green-100 text-green-700'
                                        : 'bg-orange-100 text-orange-700'
                                      }`}>
                                        {isTheft ? '🚨 THEFT' : isFill ? 'FILL' : 'DRAIN'}
                                      </span>
                                      <span className="text-[10px] text-slate-400 font-mono truncate">{ev.truck_id.slice(0, 8)}…</span>
                                    </div>
                                    {ev.value_before != null && ev.value_after != null && (
                                      <p className="text-[10px] font-mono text-slate-500">
                                        {ev.value_before.toFixed(1)}
                                        <span className="mx-1 text-slate-300">→</span>
                                        {ev.value_after.toFixed(1)} L
                                      </p>
                                    )}
                                  </div>
                                  <div className="text-right shrink-0">
                                    {delta != null && (
                                      <p className={`text-xs font-extrabold leading-none mb-0.5 ${delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {delta > 0 ? '+' : '−'}{Math.abs(delta).toFixed(1)} L
                                      </p>
                                    )}
                                    <p className="text-[10px] text-slate-400">{timeAgo(ev.occurred_at)}</p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

            </div>
          </div>

          {/* ── Live Alerts — horizontal section grid ── */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                </span>
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Live Alerts</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400">{alerts.length} events · 30 s</span>
                <button
                  onClick={downloadReport}
                  disabled={downloading}
                  className="text-[10px] font-semibold text-blue-600 border border-blue-200 hover:bg-blue-50 disabled:opacity-40 px-2 py-0.5 rounded transition"
                >
                  {downloading ? '…' : '↓ CSV'}
                </button>
              </div>
            </div>

            {/* Horizontal grid of event-type columns — gap-px + bg-slate-100 = 1px dividers */}
            {sortedAlerts.length === 0 ? (
              <div className="py-10 flex flex-col items-center gap-1.5">
                <span className="text-2xl opacity-20">📡</span>
                <p className="text-xs text-slate-400">No events yet</p>
              </div>
            ) : (() => {
              const SECTION_ORDER = [
                'FUEL_THEFT',
                'GEOFENCE_ENTER_STATION', 'GEOFENCE_EXIT_STATION',
                'GEOFENCE_ENTER_DEPOT',   'GEOFENCE_EXIT_DEPOT',
                'FUEL_DRAIN', 'BATTERY_OFF',
                'FUEL_FILL',
                'IGNITION_ON', 'IGNITION_OFF',
                'MOVEMENT_START', 'MOVEMENT_STOP',
                'BATTERY_ON',
              ];
              const grouped = new Map<string, ApiAssetEvent[]>();
              for (const ev of sortedAlerts) {
                if (!grouped.has(ev.event_type)) grouped.set(ev.event_type, []);
                grouped.get(ev.event_type)!.push(ev);
              }
              const sections = [
                ...SECTION_ORDER.filter(t => grouped.has(t)),
                ...Array.from(grouped.keys()).filter(t => !SECTION_ORDER.includes(t)),
              ];
              return (
                <div className="grid grid-cols-3 gap-px bg-slate-100">
                  {sections.map(type => {
                    const evs    = grouped.get(type)!;
                    const cfg    = EVENT_CFG[type];
                    const urgent = cfg?.urgent ?? false;
                    return (
                      <div key={type} className={`bg-white ${urgent ? 'bg-red-50/40' : ''}`}>
                        {/* Column header */}
                        <div className={`flex items-center gap-1.5 px-3 py-2 border-b border-slate-100 ${urgent ? 'bg-red-50' : 'bg-slate-50'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg?.dot ?? 'bg-slate-300'}`} />
                          <span className={`text-[10px] font-bold uppercase tracking-wide truncate ${urgent ? 'text-red-700' : 'text-slate-500'}`}>
                            {cfg?.icon} {cfg?.label ?? type}
                          </span>
                          <span className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${urgent ? 'bg-red-200 text-red-800' : 'bg-slate-200 text-slate-500'}`}>
                            {evs.length}
                          </span>
                        </div>
                        {/* Event rows — show 3 most recent */}
                        <div className="divide-y divide-slate-50">
                          {evs.slice(0, 3).map(ev => (
                            <div key={ev.id} className={`flex items-stretch transition ${urgent ? 'hover:bg-red-50' : 'hover:bg-slate-50'}`}>
                              <div className={`w-[3px] shrink-0 ${cfg?.dot ?? 'bg-slate-200'}`} />
                              <div className="flex-1 px-2.5 py-2 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-[10px] font-mono text-slate-500 truncate">{ev.truck_id.slice(0, 8)}…</span>
                                  <span className="text-[9px] text-slate-400 shrink-0">{timeAgo(ev.occurred_at)}</span>
                                </div>
                                {ev.geofence_zone && (
                                  <p className="text-[10px] font-medium text-slate-600 mt-0.5 truncate">{ev.geofence_zone}</p>
                                )}
                                {(type === 'FUEL_FILL' || type === 'FUEL_DRAIN' || type === 'FUEL_THEFT') &&
                                  ev.value_before != null && ev.value_after != null && (
                                  <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                                    {ev.value_before.toFixed(1)}→{ev.value_after.toFixed(1)} L
                                    <span className={`ml-1 font-bold ${type === 'FUEL_FILL' ? 'text-green-600' : 'text-red-600'}`}>
                                      {type === 'FUEL_FILL'
                                        ? `+${(ev.value_after - ev.value_before).toFixed(1)}`
                                        : `−${(ev.value_before - ev.value_after).toFixed(1)}`}L
                                    </span>
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                          {evs.length > 3 && (
                            <p className="text-[9px] text-slate-400 text-center py-1.5 italic px-2">+{evs.length - 3} more</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Truck list with fuel bars */}
          {trucks.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-700">Trucks</p>
              </div>
              <div className="divide-y divide-slate-100">
                {trucks.map(t => (
                  <div key={t.id} className="px-5 py-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800 font-mono">{t.device_id}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {t.latitude != null ? `${t.latitude.toFixed(5)}, ${t.longitude!.toFixed(5)}` : 'No GPS data'}
                          {t.speed != null && ` · ${t.speed} km/h`}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                          t.status === 'IDLE'     ? 'bg-green-100 text-green-700' :
                          t.status === 'EN_ROUTE' ? 'bg-blue-100  text-blue-700'  :
                          'bg-gray-100 text-gray-600'
                        }`}>{t.status}</span>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {t.last_seen_at ? new Date(t.last_seen_at).toLocaleTimeString() : 'No signal'}
                        </p>
                      </div>
                    </div>
                    {(() => {
                      const CAP    = 9100;
                      const colors = ['bg-blue-500', 'bg-cyan-400', 'bg-teal-500', 'bg-sky-500'];
                      const total  = [1,2,3,4].reduce((s, i) => s + (t.compartment_fuel?.[String(i)] ?? 0), 0);
                      return (
                        <div className="space-y-1.5">
                          <div className="flex gap-2">
                            {[1,2,3,4].map(i => {
                              const liters  = t.compartment_fuel?.[String(i)] ?? 0;
                              const pct     = Math.min(100, (liters / CAP) * 100);
                              const isEmpty = liters === 0;
                              return (
                                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                                  <span className="text-[8px] font-bold text-slate-400">C{i}</span>
                                  <div className="relative w-full bg-slate-100 rounded overflow-hidden" style={{ height: 52 }}>
                                    <div className={`absolute bottom-0 w-full transition-all duration-700 ${isEmpty ? 'bg-slate-200 opacity-40' : colors[i - 1]}`} style={{ height: `${Math.max(pct, isEmpty ? 100 : 2)}%` }} />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <span className={`text-[9px] font-bold ${isEmpty ? 'text-slate-400' : 'text-white drop-shadow-sm'}`}>
                                        {isEmpty ? '—' : pct < 1 ? `${pct.toFixed(1)}%` : `${pct.toFixed(0)}%`}
                                      </span>
                                    </div>
                                  </div>
                                  <span className="text-[8px] font-semibold text-slate-600 font-mono">{liters.toLocaleString()}</span>
                                  <span className="text-[7px] text-slate-400">/{CAP.toLocaleString()}L</span>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex justify-between text-[9px] pt-0.5 border-t border-slate-100">
                            <span className="text-slate-400">Total</span>
                            <span className="font-semibold text-slate-600">{total.toLocaleString()} / {(CAP * 4).toLocaleString()} L</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </div>
          )}

        </main>
      </div>

      {/* ── Set Depot Modal ─────────────────────────────────────────────── */}
      {showDepot && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">Set Depot Location</h2>
              <p className="text-xs text-slate-500 mt-0.5">Trucks entering this zone after delivery auto-complete the trip.</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              {trucks.some(t => t.latitude != null) && (
                <button
                  type="button"
                  onClick={() => {
                    const t = trucks.find(t => t.latitude != null);
                    if (t) { setDepotLat(t.latitude!.toFixed(6)); setDepotLng(t.longitude!.toFixed(6)); }
                  }}
                  className="w-full text-xs font-medium text-blue-600 border border-blue-200 hover:border-blue-400 hover:bg-blue-50 rounded-lg py-2 transition"
                >
                  Use current truck position ({trucks.find(t => t.latitude != null)?.latitude?.toFixed(4)}, {trucks.find(t => t.latitude != null)?.longitude?.toFixed(4)})
                </button>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Depot Name</label>
                <input value={depotName} onChange={e => setDepotName(e.target.value)} placeholder="Main Depot"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Latitude</label>
                  <input value={depotLat} onChange={e => setDepotLat(e.target.value)} placeholder="23.5185" type="number" step="any"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Longitude</label>
                  <input value={depotLng} onChange={e => setDepotLng(e.target.value)} placeholder="58.2140" type="number" step="any"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Radius (meters)</label>
                <input value={depotRadius} onChange={e => setDepotRadius(e.target.value)} placeholder="500" type="number" min="50"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {depotErr && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{depotErr}</div>}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end">
              <button onClick={() => { setShowDepot(false); setDepotErr(''); }}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:border-slate-300 transition">
                Cancel
              </button>
              <button onClick={handleSaveDepot} disabled={savingDepot}
                className="px-5 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition">
                {savingDepot ? 'Saving…' : 'Save Depot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
