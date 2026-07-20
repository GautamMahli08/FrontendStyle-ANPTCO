'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api, type ApiOrder } from '@/src/lib/api';

export default function TripDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.orderId as string;
  const user = getCurrentUser();
  const [order, setOrder] = useState<ApiOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOrder(await api.orders.get(orderId));
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load order');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!user) { router.replace('/auth/login'); return; }
    load();
  }, [load, router, user]);

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="DRIVER" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Trip Details" user={user} />
        <main className="flex-1 overflow-y-auto p-6">
          {loading && <p className="text-slate-500">Loading...</p>}
          {error && <p className="text-red-600">{error}</p>}
          {!loading && !error && order && (
            <div className="max-w-lg bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Order ID</p>
                <p className="font-mono text-sm text-gray-800">{order.id}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Status</p>
                <span className="inline-block text-sm font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  {order.status}
                </span>
              </div>
              {order.volume_liters != null && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Volume</p>
                  <p className="text-gray-800 font-medium">{order.volume_liters.toLocaleString()} L</p>
                </div>
              )}
              {order.fuel_type && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Fuel Type</p>
                  <p className="text-gray-800 font-medium">{order.fuel_type}</p>
                </div>
              )}
              {order.destination_station_id && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Destination Station</p>
                  <p className="text-gray-800 font-medium">{order.destination_station_id}</p>
                </div>
              )}
              <button
                onClick={() => router.push('/driver/dashboard')}
                className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                ← Back to Dashboard
              </button>
            </div>
          )}
          {!loading && !error && !order && (
            <p className="text-slate-400">Order not found.</p>
          )}
        </main>
      </div>
    </div>
  );
}
