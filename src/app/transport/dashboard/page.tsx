'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import { getCurrentUser, getTrucks, getOrders, shortOrderId } from '@/src/lib/demo-data';

const STATUS_COLOR: Record<string, string> = {
  ASSIGNED_TO_TSP: 'bg-yellow-100 text-yellow-700',
  ASSIGNED:        'bg-indigo-100 text-indigo-700',
  EN_ROUTE:        'bg-blue-100   text-blue-700',
  ARRIVED:         'bg-teal-100   text-teal-700',
  COMPLETED:       'bg-emerald-100 text-emerald-700',
};

const TRUCK_STATUS_COLOR: Record<string, string> = {
  IDLE:                'bg-emerald-100 text-emerald-700',
  EN_ROUTE:            'bg-blue-100   text-blue-700',
  ASSIGNED:            'bg-indigo-100 text-indigo-700',
  ARRIVED:             'bg-teal-100   text-teal-700',
  PENDING_INTEGRATION: 'bg-gray-100   text-gray-500',
};

const DEMO_FUEL: Record<string, number[]> = {
  'truck-001': [82, 95],
  'truck-002': [61, 40],
  'truck-003': [97],
  'truck-004': [0, 0, 0],
};

function fuelSummary(order: any): string {
  if (order.fuelItems?.length > 1) {
    return order.fuelItems.map((f: any) => `${f.volume.toLocaleString()}L ${f.fuelType}`).join(' + ');
  }
  return `${order.volume?.toLocaleString()}L ${order.fuelType}`;
}

export default function TransportDashboard() {
  const router   = useRouter();
  const [user,    setUser]    = useState<any>(null);
  const [trucks,  setTrucks]  = useState<any[]>([]);
  const [orders,  setOrders]  = useState<any[]>([]);
  const [mounted, setMounted] = useState(false);
  const [tick,    setTick]    = useState(0);

  const load = useCallback((u: any) => {
    setTrucks(getTrucks().filter((t: any) => t.tspId === u.id));
    setOrders(getOrders().filter((o: any) => o.assignedTSPId === u.id));
  }, []);

  useEffect(() => {
    setMounted(true);
    const u = getCurrentUser();
    if (!u || u.role !== 'TRANSPORT_ADMIN') { router.push('/'); return; }
    setUser(u);
    load(u);
    const iv  = setInterval(() => load(u), 4000);
    const tiv = setInterval(() => setTick(t => t + 1), 2500);
    return () => { clearInterval(iv); clearInterval(tiv); };
  }, [router, load]);

  if (!mounted || !user) return null;

  const needsTruck  = orders.filter(o => o.status === 'ASSIGNED_TO_TSP');
  const active      = orders.filter(o => ['ASSIGNED', 'EN_ROUTE', 'ARRIVED'].includes(o.status));
  const done        = orders.filter(o => o.status === 'COMPLETED');
  const idleTrucks  = trucks.filter(t => t.status === 'IDLE');
  const enRoute     = trucks.filter(t => t.status === 'EN_ROUTE');

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar userRole={user.role} />
      <div className="flex-1 min-w-0">
        <Header user={user} />

        <main className="p-6 space-y-6">

          {/* Page header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Transport Portal · {user.companyName}</p>
              <h1 className="text-2xl font-black text-gray-900">{user.firstName} {user.lastName}</h1>
              <p className="text-sm text-gray-500 mt-0.5">Assign trucks, manage your fleet and track deliveries</p>
            </div>
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-sm font-semibold text-gray-700">Telemetry Live</span>
            </div>
          </div>

          {/* Action banner — orders waiting for a truck (mirrors the client's Scan-QR card) */}
          {needsTruck.length > 0 && (
            <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
              <div className="w-11 h-11 bg-amber-500 rounded-xl flex items-center justify-center text-xl flex-shrink-0 text-white">🚛</div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-amber-800">
                  {needsTruck.length} order{needsTruck.length > 1 ? 's' : ''} waiting for a truck
                </p>
                <p className="text-amber-700 text-sm mt-0.5 truncate">
                  #{shortOrderId(needsTruck[0].id)} · {fuelSummary(needsTruck[0])} → {needsTruck[0].destinationName}
                  {needsTruck.length > 1 ? ` · +${needsTruck.length - 1} more` : ''}
                </p>
              </div>
              <button
                onClick={() => router.push('/transport/orders')}
                className="bg-amber-600 hover:bg-amber-700 text-white font-black px-5 py-2.5 rounded-xl text-sm transition flex-shrink-0"
              >
                Review &amp; Assign →
              </button>
            </div>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi label="Need Truck"        value={needsTruck.length}  color="amber"  badge={needsTruck.length > 0}  onClick={() => router.push('/transport/orders')} />
            <Kpi label="Active Deliveries" value={active.length}      color="blue"   onClick={() => router.push('/transport/orders')} />
            <Kpi label="Idle Trucks"       value={idleTrucks.length}  color="green" />
            <Kpi label="Completed"         value={done.length}        color="slate" />
          </div>

          {/* Two-column: Orders + Action Required */}
          <div className="grid lg:grid-cols-3 gap-5">

            {/* Active Orders — 2/3 */}
            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-900 text-sm">Orders</h2>
                <button onClick={() => router.push('/transport/orders')} className="text-xs text-blue-600 hover:text-blue-700 font-semibold transition">
                  Manage All →
                </button>
              </div>
              <div className="divide-y divide-gray-50">
                {needsTruck.length === 0 && active.length === 0 ? (
                  <div className="px-5 py-10 text-center">
                    <p className="text-3xl mb-2">📦</p>
                    <p className="text-sm text-gray-400">No orders assigned yet.</p>
                  </div>
                ) : (
                  [...needsTruck, ...active].slice(0, 7).map(order => (
                    <div key={order.id} className={`flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition ${order.status === 'ASSIGNED_TO_TSP' ? 'bg-yellow-50/40' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900 text-sm">#{shortOrderId(order.id)}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {order.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{fuelSummary(order)} · {order.destinationName}</p>
                      </div>
                      {order.assignedTruckRegistration && (
                        <p className="text-xs text-gray-500 flex-shrink-0 font-medium">{order.assignedTruckRegistration}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Action Required — 1/3 */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-900 text-sm">Action Required</h2>
                <p className="text-xs text-gray-400 mt-0.5">What needs your attention now</p>
              </div>

              <div className="divide-y divide-gray-50">
                <ActionItem
                  step={1}
                  title={needsTruck.length > 0 ? `${needsTruck.length} order${needsTruck.length > 1 ? 's' : ''} need a truck assigned` : 'No orders pending assignment'}
                  desc="Assign a truck and driver for each new order"
                  urgent={needsTruck.length > 0}
                  onClick={() => router.push('/transport/orders')}
                  cta="Assign Trucks"
                  done={needsTruck.length === 0}
                />

                <ActionItem
                  step={2}
                  title={enRoute.length > 0 ? `${enRoute.length} truck${enRoute.length > 1 ? 's' : ''} currently en route` : 'No trucks on the road'}
                  desc="Monitor live progress from the orders page"
                  urgent={false}
                  onClick={() => router.push('/transport/orders')}
                  cta="View Deliveries"
                  done={enRoute.length === 0 && active.length === 0}
                />

                {idleTrucks.length === 0 && trucks.length > 0 && (
                  <ActionItem
                    step={3}
                    title="All trucks currently on assignment"
                    desc="No idle trucks available for new orders"
                    urgent={false}
                    onClick={() => router.push('/transport/trucks')}
                    cta="View Fleet"
                    done={false}
                  />
                )}

                {needsTruck.length === 0 && enRoute.length === 0 && (
                  <div className="px-5 py-8 text-center">
                    <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-2">
                      <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-gray-700">All caught up</p>
                    <p className="text-xs text-gray-400 mt-0.5">No pending actions right now</p>
                  </div>
                )}
              </div>

              {/* Idle fleet summary */}
              {idleTrucks.length > 0 && (
                <div className="mx-3 mb-3 border border-emerald-100 bg-emerald-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-2">Ready to Deploy</p>
                  <div className="space-y-1.5">
                    {idleTrucks.slice(0, 3).map((t: any) => (
                      <div key={t.id} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full flex-shrink-0" />
                        <p className="text-xs font-semibold text-emerald-800 truncate">{t.registrationNumber}</p>
                        <span className="text-[10px] text-emerald-500 ml-auto flex-shrink-0">IDLE</span>
                      </div>
                    ))}
                    {idleTrucks.length > 3 && (
                      <p className="text-[11px] text-emerald-500">+{idleTrucks.length - 3} more</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Live Fleet Telemetry */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900 text-sm">Live Fleet Telemetry</h2>
                <p className="text-xs text-gray-400 mt-0.5">Per-compartment fuel levels · auto-refresh</p>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />LIVE
              </span>
            </div>
            <div className="divide-y divide-gray-50">
              {trucks.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <p className="text-3xl mb-2">🚛</p>
                  <p className="text-sm text-gray-400">No trucks registered.</p>
                </div>
              ) : trucks.map(truck => {
                const fuelPcts = DEMO_FUEL[truck.id] ?? truck.compartments?.map(() => 80);
                return (
                  <div key={truck.id} className="px-6 py-4 hover:bg-slate-50 transition">
                    <div className="flex items-center gap-4 flex-wrap">
                      {/* Identity */}
                      <div className="flex items-center gap-3 w-44 flex-shrink-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${
                          truck.status === 'EN_ROUTE' ? 'bg-blue-100' : truck.status === 'IDLE' ? 'bg-emerald-100' : 'bg-slate-100'
                        }`}>🚛</div>
                        <div>
                          <p className="font-bold text-gray-900 text-sm">{truck.registrationNumber}</p>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${TRUCK_STATUS_COLOR[truck.status] ?? 'bg-gray-100 text-gray-500'}`}>
                            {truck.status?.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </div>

                      {/* Compartment bars */}
                      <div className="flex gap-2 flex-1 flex-wrap">
                        {truck.compartments?.map((c: any, ci: number) => {
                          const pct = Math.min(100, Math.max(0, (fuelPcts[ci] ?? 0) + (tick % 3 === 0 ? Math.floor(Math.random() * 3) - 1 : 0)));
                          return (
                            <div key={c.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100 min-w-[90px]">
                              <div className="flex justify-between items-center mb-1.5">
                                <span className="text-[10px] text-gray-400 font-medium">C{c.id} · {c.fuelType}</span>
                                <span className={`text-[10px] font-black ${pct > 50 ? 'text-emerald-600' : pct > 25 ? 'text-amber-600' : 'text-red-600'}`}>{pct}%</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full transition-all duration-700 ${pct > 50 ? 'bg-emerald-500' : pct > 25 ? 'bg-amber-500' : 'bg-red-500'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <p className="text-[10px] text-gray-400 mt-1">{Math.round(c.capacity * pct / 100).toLocaleString()}L</p>
                            </div>
                          );
                        })}
                      </div>

                      {/* QR status */}
                      <div className="flex-shrink-0 text-right">
                        <p className="text-[10px] text-gray-400 mb-0.5">QR</p>
                        <span className={`text-xs font-bold ${truck.qrCode ? 'text-emerald-600' : 'text-orange-500'}`}>
                          {truck.qrCode ? '✓ Ready' : 'Pending'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Completed deliveries */}
          {done.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-900 text-sm">Completed Deliveries</h2>
              </div>
              <div className="grid sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
                {done.map(o => (
                  <div key={o.id} className="border border-emerald-200 bg-emerald-50 rounded-xl p-3">
                    <p className="font-bold text-emerald-800 text-sm">#{shortOrderId(o.id)}</p>
                    <p className="text-xs text-emerald-600 mt-0.5">{fuelSummary(o)}</p>
                    <p className="text-[11px] text-emerald-500 mt-0.5">{o.destinationName}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}

function Kpi({ label, value, color, badge, onClick }: {
  label: string; value: number; color: string; badge?: boolean; onClick?: () => void;
}) {
  const c: Record<string, { card: string; num: string }> = {
    amber: { card: 'border-amber-200  bg-amber-50',    num: 'text-amber-700'   },
    blue:  { card: 'border-blue-200   bg-blue-50',     num: 'text-blue-700'    },
    green: { card: 'border-emerald-200 bg-emerald-50', num: 'text-emerald-700' },
    slate: { card: 'border-slate-200  bg-slate-50',    num: 'text-slate-600'   },
  };
  const style = c[color] ?? { card: 'border-gray-200 bg-gray-50', num: 'text-gray-700' };
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-start p-4 rounded-2xl border-2 ${style.card} transition ${onClick ? 'hover:shadow-md cursor-pointer' : 'cursor-default'}`}
    >
      {badge && <span className="absolute top-3 right-3 w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
      <p className={`text-3xl font-black ${style.num}`}>{value}</p>
      <p className="text-xs font-semibold text-gray-500 mt-1 leading-tight">{label}</p>
    </button>
  );
}

function ActionItem({ step, title, desc, urgent, onClick, cta, done }: {
  step: number; title: string; desc: string; urgent: boolean;
  onClick: () => void; cta: string; done: boolean;
}) {
  return (
    <div className={`px-5 py-4 ${urgent ? 'bg-amber-50/50' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0 mt-0.5 ${
          done ? 'bg-emerald-100 text-emerald-600' : urgent ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-400'
        }`}>
          {done ? '✓' : step}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold leading-tight ${urgent ? 'text-gray-900' : 'text-gray-400'}`}>{title}</p>
          <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
          {(urgent || (!done && step === 2 && onClick)) && (
            <button onClick={onClick} className="mt-2 text-xs font-bold text-blue-600 hover:text-blue-700 transition">
              {cta} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
