'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import { getCurrentUser, getOrders, shortOrderId, stationFuelLevels } from '@/src/lib/demo-data';

// ── Demo event logger ────────────────────────────────────────
export function logDemoEvent(actor: string, action: string, detail: string) {
  if (typeof window === 'undefined') return;
  fetch('/api/demo-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actor, action, detail }),
  }).catch(() => {});
}

// ── Status helpers ────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  PLACED:             'bg-yellow-100 text-yellow-700',
  ACCEPTED_BY_SELLER: 'bg-purple-100 text-purple-700',
  ASSIGNED_TO_TSP:    'bg-amber-100  text-amber-700',
  ASSIGNED:           'bg-indigo-100 text-indigo-700',
  EN_ROUTE:           'bg-blue-100   text-blue-700',
  ARRIVED:            'bg-teal-100   text-teal-700',
  COMPLETED:          'bg-emerald-100 text-emerald-700',
  CANCELLED:          'bg-red-100    text-red-700',
};
const STATUS_MSG: Record<string, { icon: string; text: string }> = {
  PLACED:             { icon: '⏳', text: 'Waiting for seller to review your order' },
  ACCEPTED_BY_SELLER: { icon: '✅', text: 'Seller accepted — assigning transport provider' },
  ASSIGNED_TO_TSP:    { icon: '🚛', text: 'Transport provider assigned — selecting truck' },
  ASSIGNED:           { icon: '🔑', text: 'Truck assigned — ready to depart' },
  EN_ROUTE:           { icon: '🛣️', text: 'Your fuel truck is on the way!' },
  ARRIVED:            { icon: '📍', text: 'Truck has arrived — scan QR to accept delivery' },
  COMPLETED:          { icon: '🎉', text: 'Delivery complete!' },
};

// ── Fuel type SVG icons ───────────────────────────────────────
function FuelIcon({ type, size = 20 }: { type: string; size?: number }) {
  const s = size;
  if (type === 'DIESEL') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {/* Barrel/drum */}
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
      <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
    </svg>
  );
  if (type === 'PETROL') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" stroke="none">
      {/* Flame */}
      <path d="M12 2C9.5 6.5 7 9.5 7 13.5a5 5 0 0010 0C17 9.5 14.5 6.5 12 2zm0 15.5a3 3 0 01-3-3c0-1.8 1.2-3.5 3-5.5 1.8 2 3 3.7 3 5.5a3 3 0 01-3 3z" />
    </svg>
  );
  // PREMIUM
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {/* Lightning bolt */}
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ── Reserves config — base levels per station per fuel ───────
const FUEL_META: Record<string, { label: string; barColor: string; textColor: string; bgColor: string; iconBg: string; iconColor: string }> = {
  DIESEL:  { label: 'Diesel',  barColor: 'bg-blue-500',   textColor: 'text-blue-700',   bgColor: 'bg-blue-50',   iconBg: 'bg-blue-100',   iconColor: 'text-blue-600'   },
  PETROL:  { label: 'Petrol',  barColor: 'bg-orange-500', textColor: 'text-orange-700', bgColor: 'bg-orange-50', iconBg: 'bg-orange-100', iconColor: 'text-orange-600' },
  PREMIUM: { label: 'Premium', barColor: 'bg-purple-500', textColor: 'text-purple-700', bgColor: 'bg-purple-50', iconBg: 'bg-purple-100', iconColor: 'text-purple-600' },
};

// Display metadata only — fuel base/capacity/levels come from the shared
// stationFuelLevels() helper so the dashboard and order validation always agree.
const STATION_META = [
  { id: 'amerat-station', name: 'Station A', sub: 'Al Amerat, Muscat'  },
  { id: 'nakhal-station', name: 'Station B', sub: 'Nakhal, Al Batinah' },
];
const FUEL_KEYS = ['DIESEL', 'PETROL', 'PREMIUM'] as const;

export default function ClientDashboard() {
  const router  = useRouter();
  const [user,    setUser]    = useState<any>(null);
  const [orders,  setOrders]  = useState<any[]>([]);
  const [mounted, setMounted] = useState(false);

  const load = useCallback((u: any) => {
    setOrders(getOrders().filter((o: any) => o.clientId === u.id));
  }, []);

  useEffect(() => {
    setMounted(true);
    const u = getCurrentUser();
    if (!u || u.role !== 'CLIENT') { router.push('/'); return; }
    setUser(u);
    load(u);
    const iv = setInterval(() => load(u), 3000);
    return () => clearInterval(iv);
  }, [router, load]);

  if (!mounted || !user) return null;

  const active    = orders.filter(o => !['COMPLETED', 'CANCELLED'].includes(o.status));
  const completed = orders.filter(o => o.status === 'COMPLETED');
  const arrived   = active.find(o => o.status === 'ARRIVED');

  // Per-station reserves from the shared source of truth (seed + completed deliveries).
  const stationData = STATION_META.map(station => {
    const levels = stationFuelLevels(station.id);
    const fuelLevels = Object.fromEntries(
      FUEL_KEYS.map(fuel => {
        const l = levels[fuel] ?? { current: 0, capacity: 1 };
        return [fuel, { current: l.current, capacity: l.capacity, pct: Math.round((l.current / l.capacity) * 100) }];
      })
    );
    return { ...station, fuelLevels };
  });

  // Combined totals across all stations
  const combinedTotals = Object.fromEntries(
    FUEL_KEYS.map(fuel => {
      const totalCurrent  = stationData.reduce((s, st) => s + st.fuelLevels[fuel].current,  0);
      const totalCapacity = stationData.reduce((s, st) => s + st.fuelLevels[fuel].capacity, 0);
      return [fuel, { current: totalCurrent, capacity: totalCapacity, pct: Math.round((totalCurrent / totalCapacity) * 100) }];
    })
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar userRole={user.role} />

      <div className="flex-1 min-w-0">
        <Header user={user} />

        <main className="p-6 space-y-6">

          {/* ── Page header ── */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Client Portal</p>
              <h1 className="text-2xl font-black text-gray-900">{user.companyName ?? `${user.firstName} ${user.lastName}`}</h1>
              <p className="text-sm text-gray-500 mt-0.5">Track your fuel orders and reserve levels in real-time</p>
            </div>
            <button
              onClick={() => router.push('/client/orders/new')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition flex items-center gap-2 shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              New Order
            </button>
          </div>

          {/* ── Arrived CTA ── */}
          {arrived && (
            <div className="bg-teal-50 border-2 border-teal-400 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
              <div className="w-11 h-11 bg-teal-500 rounded-xl flex items-center justify-center text-xl flex-shrink-0 text-white">📍</div>
              <div className="flex-1">
                <p className="font-black text-teal-800">Truck has arrived at your location</p>
                <p className="text-teal-700 text-sm mt-0.5">
                  {arrived.assignedTruckRegistration} · {arrived.volume?.toLocaleString()}L {arrived.fuelType} · {arrived.destinationName}
                </p>
              </div>
              <button
                onClick={() => router.push('/client/delivery/scan-qr')}
                className="bg-teal-600 hover:bg-teal-700 text-white font-black px-5 py-2.5 rounded-xl text-sm transition flex-shrink-0"
              >
                Scan QR
              </button>
            </div>
          )}

          {/* ── KPI row ── */}
          <div className="grid grid-cols-3 gap-4">
            <KpiCard icon="🔄" label="Active Orders"  value={active.length}    accent="blue"  />
            <KpiCard icon="✅" label="Completed"      value={completed.length} accent="green" />
            <KpiCard icon="📦" label="Total Orders"   value={orders.length}    accent="slate" />
          </div>

          {/* ── Fuel Reserves ── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-900 text-sm uppercase tracking-wide">Fuel Reserves</h2>
                <p className="text-xs text-gray-400 mt-0.5">Levels update automatically when a delivery is confirmed</p>
              </div>
              <span className="text-xs bg-slate-100 text-slate-500 font-semibold px-3 py-1 rounded-full">
                {stationData.length} Stations
              </span>
            </div>

            {/* Tank containers — one per fuel type */}
            <div className="grid grid-cols-3 gap-4">
              {FUEL_KEYS.map(fuel => {
                const t = combinedTotals[fuel];
                const m = FUEL_META[fuel];
                const low = t.pct < 20;
                const critical = t.pct < 10;
                const fillColor   = critical ? '#ef4444' : low ? '#f59e0b' : fuel === 'DIESEL' ? '#3b82f6' : fuel === 'PETROL' ? '#f97316' : '#a855f7';
                const fillColorLt = critical ? '#fca5a5' : low ? '#fde68a' : fuel === 'DIESEL' ? '#93c5fd' : fuel === 'PETROL' ? '#fdba74' : '#d8b4fe';
                const borderColor = critical ? 'border-red-300'   : low ? 'border-amber-300'  : fuel === 'DIESEL' ? 'border-blue-200'   : fuel === 'PETROL' ? 'border-orange-200'  : 'border-purple-200';
                const bgColor     = critical ? 'bg-red-50'        : low ? 'bg-amber-50'       : fuel === 'DIESEL' ? 'bg-blue-50'        : fuel === 'PETROL' ? 'bg-orange-50'       : 'bg-purple-50';
                const labelColor  = critical ? 'text-red-600'     : low ? 'text-amber-600'    : fuel === 'DIESEL' ? 'text-blue-700'     : fuel === 'PETROL' ? 'text-orange-700'    : 'text-purple-700';
                return (
                  <div key={fuel} className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                    {/* Tank visual */}
                    <div className={`relative h-44 ${bgColor} border-b-2 ${borderColor} overflow-hidden`}>
                      {/* Tick marks on the side */}
                      {[75, 50, 25].map(tick => (
                        <div key={tick} className="absolute left-0 right-0 flex items-center" style={{ bottom: `${tick}%` }}>
                          <div className="w-3 h-px bg-gray-300/60" />
                          <span className="text-[9px] text-gray-300 ml-1">{tick}%</span>
                        </div>
                      ))}

                      {/* Liquid fill — rises from bottom */}
                      <div
                        className="absolute bottom-0 left-0 right-0 transition-all duration-1000 ease-out"
                        style={{ height: `${t.pct}%` }}
                      >
                        {/* Wave top */}
                        <svg
                          className="absolute -top-3 left-0 w-full h-4"
                          viewBox="0 0 400 16"
                          preserveAspectRatio="none"
                          style={{ fill: fillColorLt }}
                        >
                          <path d="M0,8 C66,0 133,16 200,8 C266,0 333,16 400,8 L400,16 L0,16 Z" />
                        </svg>
                        {/* Fill body */}
                        <div className="absolute inset-0 top-2" style={{ background: `linear-gradient(to top, ${fillColor}, ${fillColorLt})` }} />
                      </div>

                      {/* Percentage — centered overlay */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <p className={`text-4xl font-black ${t.pct > 40 ? 'text-white drop-shadow' : labelColor}`}>
                          {t.pct}%
                        </p>
                        {(critical || low) && (
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full mt-1 ${critical ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}`}>
                            {critical ? '🚨 CRITICAL' : '⚠ LOW'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Label below tank */}
                    <div className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${m.iconBg} ${m.iconColor}`}>
                            <FuelIcon type={fuel} size={15} />
                          </div>
                          <p className="font-black text-gray-900">{m.label}</p>
                        </div>
                        <span className={`text-xs font-bold ${labelColor}`}>{t.current.toLocaleString()}L</span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">of {t.capacity.toLocaleString()}L total capacity</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Per-station data */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 bg-slate-50">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Breakdown by Station</p>
              </div>
              <div className="divide-y divide-gray-50">
                {stationData.map(station => {
                  const hasLow      = FUEL_KEYS.some(f => station.fuelLevels[f].pct < 20);
                  const hasCritical = FUEL_KEYS.some(f => station.fuelLevels[f].pct < 10);
                  return (
                    <div key={station.id} className="px-5 py-4 flex items-center gap-6">
                      {/* Station identity */}
                      <div className="w-32 flex-shrink-0">
                        <p className="font-bold text-gray-900 text-sm">{station.name}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{station.sub}</p>
                        <span className={`inline-block mt-1.5 text-[10px] font-black px-2 py-0.5 rounded-full ${
                          hasCritical ? 'bg-red-50 text-red-600 border border-red-200' :
                          hasLow      ? 'bg-amber-50 text-amber-600 border border-amber-200' :
                                        'bg-emerald-50 text-emerald-600 border border-emerald-200'
                        }`}>
                          {hasCritical ? '🚨 Critical' : hasLow ? '⚠ Low' : '✓ OK'}
                        </span>
                      </div>

                      {/* Fuel data columns */}
                      <div className="flex-1 grid grid-cols-3 gap-4">
                        {FUEL_KEYS.map(fuel => {
                          const lv = station.fuelLevels[fuel];
                          const m  = FUEL_META[fuel];
                          const isLow  = lv.pct < 20;
                          const isCrit = lv.pct < 10;
                          const valueColor = isCrit ? 'text-red-600' : isLow ? 'text-amber-600' : m.textColor;
                          return (
                            <div key={fuel} className={`rounded-xl px-3 py-2.5 ${isCrit ? 'bg-red-50' : isLow ? 'bg-amber-50' : m.bgColor}`}>
                              <div className="flex items-center gap-1.5 mb-1">
                                <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${isCrit ? 'bg-red-100 text-red-600' : isLow ? 'bg-amber-100 text-amber-600' : `${m.iconBg} ${m.iconColor}`}`}>
                                  <FuelIcon type={fuel} size={11} />
                                </div>
                                <span className="text-[11px] font-semibold text-gray-500">{m.label}</span>
                              </div>
                              <p className={`text-lg font-black leading-tight ${valueColor}`}>{lv.pct}<span className="text-xs font-medium text-gray-400">%</span></p>
                              <p className="text-[11px] text-gray-500 font-medium">{lv.current.toLocaleString()} L</p>
                              <p className="text-[10px] text-gray-400">of {lv.capacity.toLocaleString()} L</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Active Orders ── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900 text-sm uppercase tracking-wide">Active Orders</h2>
              {orders.length > 0 && (
                <button onClick={() => router.push('/client/orders')} className="text-xs text-blue-600 hover:text-blue-800 font-semibold transition">
                  View all
                </button>
              )}
            </div>

            {active.length > 0 || completed.length > 0 ? (
              <div className="space-y-3">
                {active.map(order => {
                  const msg = STATUS_MSG[order.status];
                  return (
                    <div
                      key={order.id}
                      className={`bg-white border-2 rounded-2xl p-4 shadow-sm transition ${
                        order.status === 'ARRIVED'  ? 'border-teal-300' :
                        order.status === 'EN_ROUTE' ? 'border-blue-200' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-black text-gray-900 text-sm">Order #{shortOrderId(order.id)}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {order.volume?.toLocaleString()}L {order.fuelType} · {order.destinationName}
                          </p>
                        </div>
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 ml-3 ${STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {order.status?.replace(/_/g, ' ')}
                        </span>
                      </div>

                      {msg && (
                        <div className={`flex items-center gap-2 text-xs rounded-xl px-3 py-2 font-medium ${
                          order.status === 'ARRIVED'  ? 'bg-teal-50 text-teal-800' :
                          order.status === 'EN_ROUTE' ? 'bg-blue-50 text-blue-800' :
                          'bg-slate-50 text-slate-700'
                        }`}>
                          <span>{msg.icon}</span> {msg.text}
                        </div>
                      )}

                      {order.assignedTruckRegistration && (
                        <div className="mt-2.5 flex items-center gap-3 text-xs text-gray-400 border-t border-gray-100 pt-2.5">
                          <span>{order.assignedTruckRegistration}</span>
                          {order.assignedDriverName && <span>· {order.assignedDriverName}</span>}
                        </div>
                      )}

                      {order.status === 'ARRIVED' && (
                        <button
                          onClick={() => router.push('/client/delivery/scan-qr')}
                          className="mt-3 w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 rounded-xl text-xs transition"
                        >
                          Scan QR Code — Accept Delivery
                        </button>
                      )}
                    </div>
                  );
                })}

                {completed.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-2xl p-4">
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3">Recently Completed</p>
                    <div className="space-y-2">
                      {completed.slice(0, 3).map(order => (
                        <div key={order.id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 text-gray-600">
                            <span className="text-emerald-500">✓</span>
                            <span className="font-medium">#{shortOrderId(order.id)}</span>
                            <span className="text-gray-400">·</span>
                            <span className="text-gray-500">{order.volume?.toLocaleString()}L {order.fuelType}</span>
                          </div>
                          <span className="text-xs text-gray-400">{order.destinationName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-10 text-center">
                <p className="text-4xl mb-2">⛽</p>
                <p className="font-bold text-gray-800 mb-1">No orders yet</p>
                <p className="text-gray-400 text-sm mb-5 max-w-xs mx-auto">
                  Place a fuel order and track it from depot to delivery in real-time.
                </p>
                <button
                  onClick={() => router.push('/client/orders/new')}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition"
                >
                  Place Your First Order
                </button>
              </div>
            )}
          </div>

        </main>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, accent }: { icon: string; label: string; value: number; accent: string }) {
  const colors: Record<string, string> = {
    blue:  'border-blue-200',
    green: 'border-emerald-200',
    slate: 'border-slate-200',
  };
  return (
    <div className={`flex items-center gap-4 p-5 rounded-2xl border-2 bg-white shadow-sm ${colors[accent]}`}>
      <span className="text-2xl">{icon}</span>
      <div>
        <p className="text-2xl font-black text-gray-900">{value}</p>
        <p className="text-xs font-medium text-gray-500">{label}</p>
      </div>
    </div>
  );
}
