'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api, type ApiOrder, type ApiTruck } from '@/src/lib/api';

const STATUS_COLOR: Record<string, string> = {
  PLACED:             'bg-yellow-100 text-yellow-700',
  ACCEPTED_BY_SELLER: 'bg-purple-100 text-purple-700',
  ASSIGNED_TO_TSP:    'bg-amber-100  text-amber-700',
  ASSIGNED:           'bg-indigo-100 text-indigo-700',
  LOADING:            'bg-cyan-100   text-cyan-700',
  LOADED:             'bg-sky-100    text-sky-700',
  EN_ROUTE:           'bg-blue-100   text-blue-700',
  ARRIVED:            'bg-teal-100   text-teal-700',
  COMPLETED:          'bg-emerald-100 text-emerald-700',
  CANCELLED:          'bg-red-100    text-red-700',
};

const ACTIONABLE = ['ASSIGNED_TO_TSP', 'ASSIGNED', 'LOADING', 'LOADED', 'EN_ROUTE', 'ARRIVED'];

const NEXT_ACTION: Record<string, string> = {
  ASSIGNED:  'Start Loading',
  LOADING:   'Mark Loaded',
  LOADED:    'Start Journey',
  EN_ROUTE:  'En Route (auto-arrival)',
  ARRIVED:   'Awaiting QR Scan',
};

type FuelEntry = { orderId: string; c: [string, string, string, string] };

export default function TransportOrders() {
  const router = useRouter();
  const user   = getCurrentUser();

  const [orders,    setOrders]    = useState<ApiOrder[]>([]);
  const [trucks,    setTrucks]    = useState<ApiTruck[]>([]);
  const [selTruck,  setSelTruck]  = useState<Record<string, string>>({});
  const [loading,   setLoading]   = useState(true);
  const [advancing, setAdvancing] = useState<string | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const [fuelEntry, setFuelEntry] = useState<FuelEntry | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, t] = await Promise.all([api.orders.list(), api.trucks.list()]);
      setOrders(o);
      setTrucks(t ?? []);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) { router.replace('/auth/login'); return; }
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load, router, user]);

  const runAction = async (orderId: string, action: () => Promise<unknown>) => {
    setAdvancing(orderId);
    setError(null);
    try {
      await action();
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Failed to update order');
    } finally {
      setAdvancing(null);
    }
  };

  const confirmFuel = async () => {
    if (!fuelEntry) return;
    const { orderId, c } = fuelEntry;
    const compartmentFuel: Record<string, number> = {};
    c.forEach((v, i) => {
      const n = parseFloat(v);
      if (!isNaN(n) && n > 0) compartmentFuel[String(i + 1)] = n;
    });
    setFuelEntry(null);
    await runAction(orderId, () => api.orders.finishLoading(orderId, compartmentFuel));
  };

  const advance = (order: ApiOrder) => {
    switch (order.status) {
      case 'ASSIGNED_TO_TSP': {
        const truckId = selTruck[order.id];
        if (!truckId) { setError('Select a truck first'); return; }
        runAction(order.id, () => api.orders.assignTruck(order.id, truckId));
        return;
      }
      case 'ASSIGNED':
        return runAction(order.id, () => api.orders.startLoading(order.id));
      case 'LOADING':
        // Open fuel entry form instead of immediately calling the API.
        setFuelEntry({ orderId: order.id, c: ['', '', '', ''] });
        return;
      case 'LOADED':
        return runAction(order.id, () => api.orders.depart(order.id));
      default: return;
    }
  };

  const actionable = orders.filter(o => ACTIONABLE.includes(o.status));
  const completed  = orders.filter(o => o.status === 'COMPLETED');

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="TRANSPORT_ADMIN" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Orders" user={user} />
        <main className="flex-1 overflow-y-auto p-6 space-y-6">

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {error} — <button onClick={load} className="underline">retry</button>
            </div>
          )}

          {/* Active / actionable orders */}
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800 text-sm">Active Orders ({actionable.length})</h2>
            </div>
            {loading ? (
              <div className="p-12 flex justify-center">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : actionable.length === 0 ? (
              <p className="p-8 text-center text-slate-400 text-sm">No active orders.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {actionable.map(order => {
                  const isLocked  = order.status === 'EN_ROUTE' || order.status === 'ARRIVED';
                  const needsTruck = order.status === 'ASSIGNED_TO_TSP';
                  const showFuel   = fuelEntry?.orderId === order.id;

                  return (
                    <div key={order.id} className="px-5 py-4 space-y-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[order.status] ?? 'bg-slate-100 text-slate-600'}`}>
                              {order.status.replace(/_/g, ' ')}
                            </span>
                            <span className="text-xs text-slate-400">#{order.id.slice(-6).toUpperCase()}</span>
                          </div>
                          <p className="text-xs text-slate-500">
                            {order.volume_liters != null && `${order.volume_liters.toLocaleString()} L`}
                            {order.fuel_type && ` · ${order.fuel_type}`}
                            {order.destination_station_id && ` · Stn …${order.destination_station_id.slice(-6).toUpperCase()}`}
                          </p>
                        </div>

                        {needsTruck ? (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <select
                              value={selTruck[order.id] ?? ''}
                              onChange={e => setSelTruck(s => ({ ...s, [order.id]: e.target.value }))}
                              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">Select truck…</option>
                              {trucks.map(t => (
                                <option key={t.id} value={t.id}>{t.device_id}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => advance(order)}
                              disabled={!!advancing || !selTruck[order.id]}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              {advancing === order.id ? '…' : 'Assign Truck'}
                            </button>
                          </div>
                        ) : !showFuel ? (
                          <button
                            onClick={() => advance(order)}
                            disabled={!!advancing || isLocked}
                            className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors
                              ${isLocked
                                ? 'bg-slate-100 text-slate-400 cursor-default'
                                : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'}`}
                          >
                            {advancing === order.id ? '…' : NEXT_ACTION[order.status]}
                          </button>
                        ) : null}
                      </div>

                      {/* Inline compartment fuel entry — shown when "Mark Loaded" clicked */}
                      {showFuel && fuelEntry && (
                        <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4 space-y-3">
                          <p className="text-xs font-semibold text-cyan-800">Enter fuel loaded per compartment (litres)</p>
                          <div className="grid grid-cols-4 gap-2">
                            {(['C1', 'C2', 'C3', 'C4'] as const).map((label, i) => (
                              <div key={label} className="space-y-1">
                                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="50"
                                  placeholder="0"
                                  value={fuelEntry.c[i]}
                                  onChange={e => {
                                    const next: [string,string,string,string] = [...fuelEntry.c] as [string,string,string,string];
                                    next[i] = e.target.value;
                                    setFuelEntry({ ...fuelEntry, c: next });
                                  }}
                                  className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                                />
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-slate-500">
                              Total: <span className="font-semibold text-slate-700">
                                {fuelEntry.c.reduce((s, v) => s + (parseFloat(v) || 0), 0).toLocaleString()} L
                              </span>
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setFuelEntry(null)}
                                className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={confirmFuel}
                                disabled={!!advancing}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50"
                              >
                                {advancing === order.id ? '…' : 'Confirm Load'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Completed */}
          {completed.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200">
              <div className="px-5 py-3.5 border-b border-slate-100">
                <h2 className="font-semibold text-slate-800 text-sm">Completed ({completed.length})</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {completed.slice(0, 5).map(order => (
                  <div key={order.id} className="px-5 py-3.5 flex items-center justify-between">
                    <p className="text-sm text-slate-600">#{order.id.slice(-6).toUpperCase()}</p>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">COMPLETED</span>
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
