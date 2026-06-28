'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api, type ApiOrder, type ApiGeofence } from '@/src/lib/api';

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

export default function ClientDashboard() {
  const router = useRouter();
  const user   = getCurrentUser();

  const [orders,   setOrders]   = useState<ApiOrder[]>([]);
  const [stations, setStations] = useState<ApiGeofence[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, s] = await Promise.all([api.orders.list(), api.stations.list()]);
      setOrders(o);
      setStations(s);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load data');
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

  const active    = orders.filter(o => !['COMPLETED','CANCELLED'].includes(o.status));
  const completed = orders.filter(o => o.status === 'COMPLETED').length;

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="CLIENT" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Dashboard" user={user} />
        <main className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Error banner */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {error} — <button onClick={load} className="underline">retry</button>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Orders',     value: orders.length,   color: 'text-blue-600'    },
              { label: 'Active',           value: active.length,   color: 'text-amber-600'   },
              { label: 'Completed',        value: completed,       color: 'text-emerald-600' },
              { label: 'My Stations',      value: stations.length, color: 'text-purple-600'  },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Active orders */}
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800 text-sm">Active Orders</h2>
              <button
                onClick={() => router.push('/client/orders/new')}
                className="text-xs font-semibold px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                + New Order
              </button>
            </div>

            {loading ? (
              <div className="p-8 flex justify-center">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : active.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                No active orders.{' '}
                <button onClick={() => router.push('/client/orders/new')} className="text-blue-600 hover:underline">
                  Place one now
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {active.map(order => {
                  const msg = STATUS_MSG[order.status];
                  return (
                    <div key={order.id} className="px-5 py-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[order.status] ?? 'bg-slate-100 text-slate-600'}`}>
                              {order.status.replace(/_/g, ' ')}
                            </span>
                            <span className="text-xs text-slate-400">#{order.id.slice(-6).toUpperCase()}</span>
                          </div>
                          {msg && (
                            <p className="text-xs text-slate-600 mt-1">{msg.icon} {msg.text}</p>
                          )}
                          <p className="text-[11px] text-slate-400 mt-1">
                            {order.volume_liters != null && `${order.volume_liters.toLocaleString()} L`}
                            {order.fuel_type && ` · ${order.fuel_type}`}
                            {order.destination_station_id && ` · ${order.destination_station_id}`}
                          </p>
                        </div>
                        {order.status === 'ARRIVED' && (
                          <button
                            onClick={() => router.push(`/client/delivery/scan-qr?orderId=${order.id}`)}
                            className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
                          >
                            Scan QR
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Stations */}
          {stations.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200">
              <div className="px-5 py-3.5 border-b border-slate-100">
                <h2 className="font-semibold text-slate-800 text-sm">My Stations</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {stations.map(s => (
                  <div key={s.id} className="px-5 py-3.5 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{s.name}</p>
                      <p className="text-xs text-slate-400">{s.latitude.toFixed(4)}, {s.longitude.toFixed(4)} · r={s.radius_meters}m</p>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">STATION</span>
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
