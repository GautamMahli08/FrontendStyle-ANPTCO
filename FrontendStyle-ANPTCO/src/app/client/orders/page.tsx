'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api, type ApiOrder } from '@/src/lib/api';

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

const FILTERS = ['ALL', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
type Filter = typeof FILTERS[number];

export default function ClientOrders() {
  const router = useRouter();
  const user   = getCurrentUser();

  const [orders,  setOrders]  = useState<ApiOrder[]>([]);
  const [filter,  setFilter]  = useState<Filter>('ALL');
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOrders(await api.orders.list());
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
  }, [load, router, user]);

  const filtered = orders.filter(o => {
    if (filter === 'ACTIVE')    return !['COMPLETED','CANCELLED'].includes(o.status);
    if (filter === 'COMPLETED') return o.status === 'COMPLETED';
    if (filter === 'CANCELLED') return o.status === 'CANCELLED';
    return true;
  });

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="CLIENT" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="My Orders" user={user} />
        <main className="flex-1 overflow-y-auto p-6 space-y-4">

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {error} — <button onClick={load} className="underline">retry</button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {FILTERS.map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  {f}
                </button>
              ))}
            </div>
            <button onClick={() => router.push('/client/orders/new')}
              className="text-xs font-semibold px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              + New Order
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200">
            {loading ? (
              <div className="p-12 flex justify-center">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-sm">
                No orders found.{' '}
                <button onClick={() => router.push('/client/orders/new')} className="text-blue-600 hover:underline">Place one</button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filtered.map(order => (
                  <div key={order.id} className="px-5 py-4 flex items-center justify-between">
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
                        {order.destination_station_id && ` · ${order.destination_station_id}`}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{new Date(order.created_at).toLocaleString()}</p>
                    </div>
                    {order.status === 'ARRIVED' && (
                      <button onClick={() => router.push(`/client/delivery/scan-qr?orderId=${order.id}`)}
                        className="text-xs font-semibold px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 flex-shrink-0">
                        Scan QR
                      </button>
                    )}
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
