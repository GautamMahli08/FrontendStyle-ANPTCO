'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api, type ApiOrder } from '@/src/lib/api';

export default function DriverDashboard() {
  const router = useRouter();
  const user = getCurrentUser();
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const all = await api.orders.list();
      setOrders(all.filter(o => o.status === 'EN_ROUTE' || o.status === 'ARRIVED'));
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) { router.replace('/auth/login'); return; }
    load();
  }, [load, router, user]);

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="DRIVER" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Driver Dashboard" user={user} />
        <main className="flex-1 overflow-y-auto p-6">
          {loading && <p className="text-slate-500">Loading...</p>}
          {error && <p className="text-red-600">{error}</p>}
          {!loading && !error && (
            <>
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Active Trips ({orders.length})
              </h2>
              {orders.length === 0 ? (
                <p className="text-slate-400">No active trips assigned.</p>
              ) : (
                <div className="space-y-3">
                  {orders.map(order => (
                    <div
                      key={order.id}
                      className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 cursor-pointer hover:border-green-300 transition"
                      onClick={() => router.push(`/driver/trips/${order.id}`)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">Order #{order.id.slice(0, 8)}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {order.volume_liters?.toLocaleString()}L {order.fuel_type}
                          </p>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                          order.status === 'EN_ROUTE'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {order.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
