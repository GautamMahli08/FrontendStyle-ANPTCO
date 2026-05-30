'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import { getCurrentUser, getTrucks, getOrders, getSensorRequests } from '@/src/lib/demo-data';

// ── Demo fuel telemetry per truck ─────────────────────────────
const DEMO_TELEMETRY: Record<string, { c1: number; c2: number; speed: number; ignition: boolean }> = {
  'truck-001': { c1: 4820, c2: 2975, speed: 54, ignition: true },
  'truck-002': { c1: 5900, c2: 3840, speed: 0,  ignition: false },
  'truck-003': { c1: 7750, c2: 0,    speed: 62, ignition: true },
  'truck-004': { c1: 0,    c2: 0,    speed: 0,  ignition: false },
};

export default function TransportDashboard() {
  const router = useRouter();
  const [user,           setUser]           = useState<any>(null);
  const [trucks,         setTrucks]         = useState<any[]>([]);
  const [orders,         setOrders]         = useState<any[]>([]);
  const [sensorRequests, setSensorRequests] = useState<any[]>([]);
  const [mounted,        setMounted]        = useState(false);
  const [tick,           setTick]           = useState(0);

  const loadData = useCallback((u: any) => {
    const allTrucks = getTrucks();
    const allOrders = getOrders();
    const allSensor = getSensorRequests();
    setTrucks(allTrucks.filter((t: any) => t.tspId === u.id));
    setOrders(allOrders.filter((o: any) => o.transportProviderId === u.id));
    setSensorRequests(allSensor.filter((r: any) => r.transporterId === u.id));
  }, []);

  useEffect(() => {
    setMounted(true);
    const u = getCurrentUser();
    if (!u || u.role !== 'TRANSPORT_ADMIN') { router.push('/'); return; }
    setUser(u);
    loadData(u);
    const iv = setInterval(() => setTick(t => t + 1), 4000);
    return () => clearInterval(iv);
  }, [router, loadData]);

  if (!mounted || !user) return null;

  const activeTrucks    = trucks.filter(t => t.status === 'EN_ROUTE' || t.status === 'ACTIVE');
  const idleTrucks      = trucks.filter(t => t.status === 'IDLE');
  const pendingInteg    = trucks.filter(t => t.status === 'PENDING_INTEGRATION');
  const pendingApproval = sensorRequests.filter(r => r.status === 'PENDING_SELLER_APPROVAL' || r.status === 'PENDING_ADMIN_APPROVAL');

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar userRole={user.role} />

      <div className="flex-1 min-w-0">
        <Header user={user} />

        <main className="p-6 space-y-6">

          {/* Welcome */}
          <div className="bg-gradient-to-r from-orange-600 to-orange-800 rounded-2xl p-6 text-white flex items-center justify-between">
            <div>
              <p className="text-orange-200 text-sm font-medium mb-1">{user.companyName || 'Transport Admin'}</p>
              <h1 className="text-2xl font-black">Transport Operations</h1>
              <p className="text-orange-200 text-sm mt-1">{user.firstName} {user.lastName} · Manage trucks, drivers & deliveries</p>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-orange-200 text-sm font-medium">Telemetry LIVE</span>
            </div>
          </div>

          {/* KPI tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Total Trucks"      value={trucks.length}         icon="🚛" color="slate"  />
            <KpiCard label="Active / En-Route" value={activeTrucks.length}   icon="📡" color="green"  />
            <KpiCard label="Idle & Ready"      value={idleTrucks.length}     icon="✅" color="blue"   />
            <KpiCard label="Pending Integration" value={pendingInteg.length} icon="⏳" color="orange" highlight={pendingInteg.length > 0} onClick={() => router.push('/transport/sensor-integration')} />
          </div>

          {/* Pending approval alert */}
          {pendingApproval.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-2xl p-5 flex items-start gap-4">
              <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center text-xl flex-shrink-0">⏳</div>
              <div className="flex-1">
                <h3 className="font-bold text-yellow-800">Sensor Integration Pending Approval</h3>
                <p className="text-yellow-700 text-sm mt-0.5 mb-3">
                  {pendingApproval.length} sensor request{pendingApproval.length > 1 ? 's' : ''} waiting for seller / platform admin review
                </p>
                <button
                  onClick={() => router.push('/transport/tickets')}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
                >
                  View Tickets →
                </button>
              </div>
            </div>
          )}

          {/* Truck telemetry grid */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">Live Fleet Telemetry</h2>
                <p className="text-xs text-gray-500 mt-0.5">Per-compartment fuel levels · Updates every 4s</p>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                LIVE
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {trucks.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-3xl mb-2">🚛</p>
                  <p className="text-gray-500 text-sm">No trucks registered yet.</p>
                  <button onClick={() => router.push('/transport/trucks/register')} className="mt-3 text-blue-600 hover:text-blue-700 text-sm font-medium">
                    Register a Truck →
                  </button>
                </div>
              ) : (
                trucks.map(truck => {
                  const telem = DEMO_TELEMETRY[truck.id];
                  const fuelPct = truck.capacity > 0
                    ? Math.round(((telem?.c1 || 0) + (telem?.c2 || 0)) / truck.capacity * 100)
                    : 0;
                  // slight jitter on each tick for demo effect
                  const jitter = (tick % 5 === 0) ? Math.floor(Math.random() * 5) : 0;
                  const speed  = telem?.ignition ? (telem.speed + jitter) : 0;

                  return (
                    <div key={truck.id} className="px-6 py-4 hover:bg-slate-50 transition">
                      <div className="flex flex-col lg:flex-row lg:items-center gap-4">

                        {/* Identity */}
                        <div className="flex items-center gap-3 min-w-0 lg:w-48 flex-shrink-0">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${
                            truck.status === 'EN_ROUTE' ? 'bg-blue-100' :
                            truck.status === 'IDLE'     ? 'bg-emerald-100' : 'bg-gray-100'
                          }`}>
                            🚛
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-gray-900 text-sm">{truck.registrationNumber}</p>
                            <TruckStatusBadge status={truck.status} />
                          </div>
                        </div>

                        {/* Compartments */}
                        <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
                          {truck.compartments?.map((c: any) => {
                            const current = c.id === 1 ? (telem?.c1 || c.currentVolume) : (telem?.c2 || c.currentVolume);
                            const pct = Math.round((current / c.capacity) * 100);
                            return (
                              <div key={c.id} className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-xs text-gray-500 font-medium">C{c.id} · {c.fuelType}</span>
                                  <span className="text-xs font-bold text-gray-700">{pct}%</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1">
                                  <div
                                    className={`h-1.5 rounded-full transition-all ${pct > 50 ? 'bg-emerald-500' : pct > 25 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <p className="text-xs text-gray-500">{current.toLocaleString()}L / {c.capacity.toLocaleString()}L</p>
                              </div>
                            );
                          })}
                        </div>

                        {/* Speed & GPS */}
                        <div className="flex gap-4 lg:w-40 flex-shrink-0">
                          <div className="text-center">
                            <p className="text-xs text-gray-500">Speed</p>
                            <p className="font-bold text-gray-900">{speed}<span className="text-xs text-gray-400"> km/h</span></p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-500">GPS</p>
                            <p className={`text-xs font-bold ${telem?.ignition ? 'text-emerald-600' : 'text-gray-400'}`}>
                              {telem?.ignition ? 'LIVE' : 'OFF'}
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-500">QR</p>
                            <p className={`text-xs font-bold ${truck.qrCode ? 'text-emerald-600' : 'text-orange-500'}`}>
                              {truck.qrCode ? 'READY' : 'PENDING'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Quick Actions + Orders */}
          <div className="grid lg:grid-cols-3 gap-6">

            {/* Quick Actions */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-900">Quick Actions</h2>
              </div>
              <div className="p-4 space-y-2">
                {[
                  { icon: '📦', label: 'View Orders',        sub: `${orders.length} assigned`,         path: '/transport/orders' },
                  { icon: '🚛', label: 'My Trucks',          sub: `${trucks.length} total`,             path: '/transport/trucks' },
                  { icon: '➕', label: 'Register Truck',     sub: 'Add new vehicle',                    path: '/transport/trucks/register' },
                  { icon: '👥', label: 'Drivers',            sub: 'Manage driver pool',                 path: '/transport/drivers' },
                  { icon: '📄', label: 'KYC Upload',         sub: 'Compliance documents',               path: '/transport/kyc-upload' },
                  { icon: '🎫', label: 'Sensor Tickets',     sub: `${sensorRequests.length} requests`, path: '/transport/tickets' },
                  { icon: '📊', label: 'Reports',            sub: 'Analytics',                          path: '/transport/reports' },
                ].map(item => (
                  <button
                    key={item.path}
                    onClick={() => router.push(item.path)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 border border-transparent transition text-left"
                  >
                    <span className="text-lg w-7 text-center">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{item.label}</p>
                      <p className="text-xs text-gray-500 truncate">{item.sub}</p>
                    </div>
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>

            {/* Recent orders */}
            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-900">Assigned Orders</h2>
                <button onClick={() => router.push('/transport/orders')} className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                  All →
                </button>
              </div>
              <div className="divide-y divide-gray-50">
                {orders.length === 0 ? (
                  <div className="px-6 py-10 text-center">
                    <p className="text-3xl mb-2">📭</p>
                    <p className="text-gray-500 text-sm">No orders assigned yet.</p>
                    <p className="text-gray-400 text-xs mt-1">Seller will assign orders to you once trucks are ready.</p>
                  </div>
                ) : (
                  orders.slice(0, 8).map((order: any) => (
                    <div key={order.id} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition">
                      <div>
                        <p className="font-semibold text-sm text-gray-900">Order #{order.id.slice(0, 8)}</p>
                        <p className="text-xs text-gray-500">{order.volume}L {order.fuelType}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor(order.status)}`}>
                          {order.status?.replace(/_/g, ' ')}
                        </span>
                        <p className="text-xs text-gray-400">{new Date(order.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon, color, highlight, onClick }: {
  label: string; value: number; icon: string; color: string; highlight?: boolean; onClick?: () => void;
}) {
  const colors: Record<string, string> = {
    slate:  'bg-slate-50  border-slate-200',
    green:  'bg-emerald-50 border-emerald-200',
    blue:   'bg-blue-50   border-blue-200',
    orange: 'bg-orange-50 border-orange-200',
  };
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center p-5 rounded-2xl border-2 ${colors[color] || 'bg-gray-50 border-gray-200'} transition hover:shadow-md ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      {highlight && <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full" />}
      <span className="text-2xl mb-1">{icon}</span>
      <p className="text-3xl font-black text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 text-center mt-0.5">{label}</p>
    </button>
  );
}

function TruckStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    IDLE:                'bg-emerald-100 text-emerald-700',
    EN_ROUTE:            'bg-blue-100 text-blue-700',
    ASSIGNED:            'bg-yellow-100 text-yellow-700',
    PENDING_INTEGRATION: 'bg-gray-100 text-gray-500',
    ACTIVE:              'bg-emerald-100 text-emerald-700',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[status] || 'bg-gray-100 text-gray-500'}`}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
}

function statusColor(s: string) {
  const m: Record<string, string> = {
    PLACED:          'bg-yellow-100 text-yellow-700',
    ACCEPTED:        'bg-blue-100 text-blue-700',
    TRUCKS_ASSIGNED: 'bg-indigo-100 text-indigo-700',
    EN_ROUTE:        'bg-cyan-100 text-cyan-700',
    COMPLETED:       'bg-emerald-100 text-emerald-700',
    CANCELLED:       'bg-red-100 text-red-700',
  };
  return m[s] || 'bg-gray-100 text-gray-600';
}
