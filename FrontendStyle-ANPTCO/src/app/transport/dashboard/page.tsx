'use client';

import { useEffect, useState, useCallback } from 'react';
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
  EN_ROUTE:           'bg-blue-100   text-blue-700',
  ARRIVED:            'bg-teal-100   text-teal-700',
  COMPLETED:          'bg-emerald-100 text-emerald-700',
  CANCELLED:          'bg-red-100    text-red-700',
};

const TRUCK_STATUS_COLOR: Record<string, string> = {
  ACTIVE:   'bg-emerald-100 text-emerald-700',
  EN_ROUTE: 'bg-blue-100   text-blue-700',
  LOADING:  'bg-amber-100  text-amber-700',
  LOADED:   'bg-indigo-100 text-indigo-700',
  ARRIVED:  'bg-teal-100   text-teal-700',
  INACTIVE: 'bg-slate-100  text-slate-500',
};

export default function TransportDashboard() {
  const router = useRouter();
  const user   = getCurrentUser();

  const [orders,  setOrders]  = useState<ApiOrder[]>([]);
  const [trucks,  setTrucks]  = useState<ApiTruck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, t] = await Promise.all([api.orders.list(), api.trucks.list()]);
      setOrders(o);
      setTrucks(t);
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

  const assignable = orders.filter(o => o.status === 'ASSIGNED_TO_TSP');
  const active     = orders.filter(o => ['ASSIGNED','LOADING','LOADED','EN_ROUTE','ARRIVED'].includes(o.status));
  const completed  = orders.filter(o => o.status === 'COMPLETED').length;
  const activeTrucks = trucks.filter(t => t.status !== 'INACTIVE' && t.status !== 'ACTIVE');

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="TRANSPORT_ADMIN" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Transport Dashboard" user={user} />
        <main className="flex-1 overflow-y-auto p-6 space-y-6">

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {error} — <button onClick={load} className="underline">retry</button>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Fleet Size',       value: trucks.length,       color: 'text-blue-600'    },
              { label: 'Trucks Active',    value: activeTrucks.length, color: 'text-amber-600'   },
              { label: 'Needs Assignment', value: assignable.length,   color: 'text-yellow-600'  },
              { label: 'Completed',        value: completed,           color: 'text-emerald-600' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Orders needing truck assignment */}
          {assignable.length > 0 && (
            <div className="bg-white rounded-xl border border-amber-200">
              <div className="px-5 py-3.5 border-b border-amber-100 flex items-center gap-2">
                <span className="text-amber-600">🚛</span>
                <h2 className="font-semibold text-slate-800 text-sm">Needs Truck Assignment ({assignable.length})</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {assignable.map(order => (
                  <div key={order.id} className="px-5 py-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-700">#{order.id.slice(-6).toUpperCase()}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {order.volume_liters != null && `${order.volume_liters.toLocaleString()} L`}
                        {order.fuel_type && ` · ${order.fuel_type}`}
                      </p>
                    </div>
                    <button
                      onClick={() => router.push(`/transport/orders?orderId=${order.id}`)}
                      className="text-xs font-semibold px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                    >
                      Assign Truck
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active deliveries */}
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800 text-sm">Active Deliveries</h2>
              <button onClick={() => router.push('/transport/orders')} className="text-xs text-blue-600 hover:underline">View all</button>
            </div>
            {loading ? (
              <div className="p-8 flex justify-center">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : active.length === 0 ? (
              <p className="p-8 text-center text-slate-400 text-sm">No active deliveries.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {active.map(order => (
                  <div key={order.id} className="px-5 py-3.5 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-700">#{order.id.slice(-6).toUpperCase()}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {order.volume_liters != null && `${order.volume_liters.toLocaleString()} L`}
                        {order.fuel_type && ` · ${order.fuel_type}`}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[order.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {order.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fleet */}
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800 text-sm">Fleet</h2>
              <button onClick={() => router.push('/transport/trucks')} className="text-xs text-blue-600 hover:underline">Manage</button>
            </div>
            {trucks.length === 0 ? (
              <p className="p-8 text-center text-slate-400 text-sm">No trucks registered yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {trucks.map(truck => (
                  <div key={truck.id} className="px-5 py-3.5 flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700">{truck.device_id}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TRUCK_STATUS_COLOR[truck.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {truck.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
