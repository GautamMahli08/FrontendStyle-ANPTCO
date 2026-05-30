'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import {
  getCurrentUser, getTrucks, getOrders, getFuelAnomalies, updateFuelAnomaly,
  advanceJourneys, destinationCoords, FIXED_DEPOT, JOURNEY_DURATION_MS, shortOrderId,
} from '@/src/lib/demo-data';
import OrderTimeline from '@/src/components/orders/OrderTimeline';

// Leaflet touches `window`, so load the map only on the client.
const LiveTrackingMap = dynamic(() => import('@/src/components/maps/LiveTrackingMap'), {
  ssr: false,
  loading: () => <div className="w-full h-[440px] flex items-center justify-center text-sm text-gray-400">Loading map…</div>,
});

const SEVERITY_STYLE: Record<string, string> = {
  HIGH:   'bg-red-100    text-red-700    border-red-300',
  MEDIUM: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  LOW:    'bg-green-100  text-green-700  border-green-300',
};
const ANOMALY_STATUS_STYLE: Record<string, string> = {
  OPEN:       'bg-red-500    text-white',
  REVIEWING:  'bg-yellow-500 text-white',
  RESOLVED:   'bg-emerald-500 text-white',
};
const TRUCK_STATUS_COLOR: Record<string, string> = {
  IDLE:                'bg-emerald-100 text-emerald-700',
  EN_ROUTE:            'bg-blue-100    text-blue-700',
  ASSIGNED:            'bg-indigo-100  text-indigo-700',
  ARRIVED:             'bg-teal-100    text-teal-700',
  PENDING_INTEGRATION: 'bg-gray-100    text-gray-500',
  ACTIVE:              'bg-emerald-100 text-emerald-700',
};

export default function FleetMonitorPage() {
  const router = useRouter();
  const [user,      setUser]      = useState<any>(null);
  const [trucks,    setTrucks]    = useState<any[]>([]);
  const [orders,    setOrders]    = useState<any[]>([]);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [selected,  setSelected]  = useState<string | null>(null);
  const [mounted,   setMounted]   = useState(false);

  const load = useCallback((u: any) => {
    advanceJourneys(); // mark trucks that have reached their station as ARRIVED
    const allTrucks = getTrucks();
    setTrucks(allTrucks.filter((t: any) => t.workspaceId === u.workspaceId));
    setOrders(getOrders().filter((o: any) => o.workspaceId === u.workspaceId));
    setAnomalies(getFuelAnomalies());
  }, []);

  useEffect(() => {
    setMounted(true);
    const u = getCurrentUser();
    if (!u || u.role !== 'SELLER_MANAGER') { router.push('/'); return; }
    setUser(u);
    load(u);
    const iv = setInterval(() => load(u), 3000);
    return () => clearInterval(iv);
  }, [router, load]);

  if (!mounted || !user) return null;

  const openAnomalies = anomalies.filter(a => a.status !== 'RESOLVED');
  const enRoute       = trucks.filter(t => t.status === 'EN_ROUTE');
  const idle          = trucks.filter(t => t.status === 'IDLE');
  const selectedTruck = trucks.find(t => t.id === selected);
  const selectedOrder = selectedTruck
    ? orders.find(o => o.assignedTruckId === selectedTruck.id && !['COMPLETED', 'CANCELLED'].includes(o.status))
    : null;

  const activeJourneys = orders
    .filter(o => ['EN_ROUTE', 'ARRIVED'].includes(o.status) && o.assignedTruckId)
    .map(o => {
      const dest = destinationCoords(o);
      return {
        id:         o.id,
        truckReg:   o.assignedTruckRegistration || 'Truck',
        status:     o.status,
        depot:      { lat: FIXED_DEPOT.lat, lng: FIXED_DEPOT.lng, name: FIXED_DEPOT.name },
        dest:       { lat: dest.lat, lng: dest.lng, name: o.destinationName || 'Destination' },
        startedAt:  o.tripStartedAt ? new Date(o.tripStartedAt).getTime() : Date.now(),
        durationMs: JOURNEY_DURATION_MS,
      };
    });

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar userRole={user.role} />

      <div className="flex-1 min-w-0">
        <Header user={user} />

        <main className="p-6 space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-gray-900">Fleet Monitor</h1>
              <p className="text-sm text-gray-500 mt-0.5">Live status · auto-refreshes every 3s</p>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              LIVE
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiTile label="Total Trucks"  value={trucks.length}          icon="🚛" color="slate"  />
            <KpiTile label="En Route"      value={enRoute.length}         icon="📡" color="blue"   />
            <KpiTile label="Idle & Ready"  value={idle.length}            icon="✅" color="green"  />
            <KpiTile label="Theft Alerts"  value={openAnomalies.length}   icon="🚨" color="red"    highlight={openAnomalies.length > 0} />
          </div>

          {/* ── LIVE JOURNEY MAP ── */}
          <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">Live Delivery Tracking</h2>
                <p className="text-xs text-gray-500 mt-0.5">Trucks en route from the ANPTCO depot to client stations</p>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                {activeJourneys.length} active
              </span>
            </div>
            <div className="relative bg-slate-50">
              {activeJourneys.length > 0 ? (
                <LiveTrackingMap journeys={activeJourneys} className="w-full h-[440px]" />
              ) : (
                <div className="w-full h-[440px] flex flex-col items-center justify-center text-center">
                  <p className="text-3xl mb-2">🗺️</p>
                  <p className="text-sm font-semibold text-gray-600">No active journeys</p>
                  <p className="text-xs text-gray-400 mt-1">Assign a transporter to an order to dispatch a truck</p>
                </div>
              )}
            </div>
          </section>

          {/* ── THEFT ALERTS PANEL ── */}
          {openAnomalies.length > 0 && (
            <section className="bg-white border-2 border-red-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center gap-3 px-6 py-4 bg-red-50 border-b border-red-200">
                <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center text-lg flex-shrink-0">🚨</div>
                <div className="flex-1">
                  <h2 className="font-bold text-red-800">Fuel Anomaly Alerts</h2>
                  <p className="text-xs text-red-600 mt-0.5">Unexpected fuel drops detected outside delivery windows</p>
                </div>
                <span className="text-xs font-black text-red-700 bg-red-200 px-2.5 py-1 rounded-full">
                  {openAnomalies.length} OPEN
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {anomalies.map(a => (
                  <div key={a.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      a.severity === 'HIGH' ? 'bg-red-500 animate-pulse' :
                      a.severity === 'MEDIUM' ? 'bg-yellow-500' : 'bg-green-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className="font-bold text-gray-900 text-sm">{a.truckReg}</p>
                        <span className="text-xs text-gray-500">{a.compartment}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${SEVERITY_STYLE[a.severity]}`}>
                          {a.severity}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{a.location}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-black text-red-600">−{a.fuelDropLiters}L</p>
                      <p className="text-xs text-gray-400">{new Date(a.detectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${ANOMALY_STATUS_STYLE[a.status]}`}>
                      {a.status}
                    </span>
                    {a.status === 'OPEN' && (
                      <button
                        onClick={() => { updateFuelAnomaly(a.id, { status: 'REVIEWING' }); load(user); }}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 px-3 py-1 border border-blue-200 rounded-lg hover:bg-blue-50 transition flex-shrink-0"
                      >
                        Review
                      </button>
                    )}
                    {a.status === 'REVIEWING' && (
                      <button
                        onClick={() => { updateFuelAnomaly(a.id, { status: 'RESOLVED' }); load(user); }}
                        className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 px-3 py-1 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition flex-shrink-0"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── FLEET TABLE + DETAIL PANEL ── */}
          <div className="grid lg:grid-cols-2 gap-6">

            {/* Truck list */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-bold text-gray-900">Live Fleet</h2>
                <span className="text-xs text-gray-400">{trucks.length} trucks</span>
              </div>
              <div className="divide-y divide-gray-50">
                {trucks.map(truck => {
                  const order = orders.find(o => o.assignedTruckId === truck.id && !['COMPLETED', 'CANCELLED'].includes(o.status));
                  const hasAlert = anomalies.some(a => a.truckReg === truck.registrationNumber && a.status !== 'RESOLVED');
                  const isSelected = selected === truck.id;
                  return (
                    <button
                      key={truck.id}
                      onClick={() => setSelected(isSelected ? null : truck.id)}
                      className={`w-full flex items-center gap-4 px-6 py-4 text-left transition hover:bg-slate-50 ${isSelected ? 'bg-blue-50' : ''}`}
                    >
                      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-lg flex-shrink-0">
                        🚛
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-bold text-gray-900 text-sm">{truck.registrationNumber}</p>
                          {hasAlert && (
                            <span className="text-[10px] font-black text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full border border-red-200 animate-pulse">
                              🚨 ALERT
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">{truck.tspName}</p>
                        {order && <p className="text-xs text-blue-600 mt-0.5 truncate">→ {order.destinationName}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${TRUCK_STATUS_COLOR[truck.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {truck.status?.replace(/_/g, ' ')}
                        </span>
                        <p className="text-xs text-gray-400">{truck.compartments?.length}C · {truck.capacity?.toLocaleString()}L</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Detail panel */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              {selectedTruck ? (
                <>
                  <div className="px-5 py-4 border-b border-gray-100 bg-slate-50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-xl">🚛</div>
                      <div>
                        <p className="font-bold text-gray-900">{selectedTruck.registrationNumber}</p>
                        <p className="text-xs text-gray-500">{selectedTruck.tspName}</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 space-y-3">

                    {/* Status */}
                    <div>
                      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1.5">Status</p>
                      <span className={`text-sm font-bold px-3 py-1 rounded-full ${TRUCK_STATUS_COLOR[selectedTruck.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {selectedTruck.status?.replace(/_/g, ' ')}
                      </span>
                    </div>

                    {/* Compartments */}
                    <div>
                      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1.5">Compartments</p>
                      <div className="space-y-1.5">
                        {selectedTruck.compartments?.map((c: any) => (
                          <div key={c.id} className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                            <div className="flex justify-between text-xs">
                              <span className="font-medium text-gray-700">C{c.id} · {c.fuelType}</span>
                              <span className="font-bold text-gray-900">{c.capacity?.toLocaleString()}L cap.</span>
                            </div>
                            {c.currentVolume > 0 && (
                              <>
                                <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-blue-500 rounded-full"
                                    style={{ width: `${Math.round((c.currentVolume / c.capacity) * 100)}%` }}
                                  />
                                </div>
                                <p className="text-xs text-gray-400 mt-1">{c.currentVolume?.toLocaleString()}L loaded</p>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Active order */}
                    {selectedOrder && (
                      <div>
                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1.5">Current Order</p>
                        <div className="bg-blue-50 rounded-xl px-3 py-2.5 border border-blue-200">
                          <p className="text-sm font-bold text-blue-900">#{shortOrderId(selectedOrder.id)}</p>
                          <p className="text-xs text-blue-700 mt-0.5">{selectedOrder.volume?.toLocaleString()}L {selectedOrder.fuelType} → {selectedOrder.destinationName}</p>
                          <p className="text-xs text-blue-500 mt-0.5">Client: {selectedOrder.clientName}</p>
                        </div>
                      </div>
                    )}

                    {/* Event timeline */}
                    {selectedOrder && (
                      <div className="border-t border-gray-100 pt-3">
                        <OrderTimeline order={selectedOrder} />
                      </div>
                    )}

                    {/* QR */}
                    {selectedTruck.qrCode && (
                      <div>
                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">QR Code</p>
                        <p className="font-mono text-xs bg-slate-100 px-3 py-2 rounded-lg text-gray-700 border border-slate-200">
                          {selectedTruck.qrCode}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full min-h-64 text-center p-8">
                  <p className="text-3xl mb-3">👆</p>
                  <p className="text-sm font-semibold text-gray-700">Select a truck</p>
                  <p className="text-xs text-gray-400 mt-1">Click any row to see compartment details and active order</p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function KpiTile({ label, value, icon, color, highlight }: {
  label: string; value: number; icon: string; color: string; highlight?: boolean;
}) {
  const colors: Record<string, string> = {
    slate: 'bg-slate-50  border-slate-200',
    blue:  'bg-blue-50   border-blue-200',
    green: 'bg-emerald-50 border-emerald-200',
    red:   'bg-red-50    border-red-200',
  };
  return (
    <div className={`relative flex flex-col items-center justify-center p-5 rounded-2xl border-2 ${colors[color] ?? 'bg-gray-50 border-gray-200'}`}>
      {highlight && <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />}
      <span className="text-2xl mb-1">{icon}</span>
      <p className="text-3xl font-black text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 text-center mt-0.5">{label}</p>
    </div>
  );
}
