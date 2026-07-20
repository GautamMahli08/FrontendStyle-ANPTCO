'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api, type ApiOrder, type ApiTruck } from '@/src/lib/api';

export default function PlatformAdminDashboard() {
  const router = useRouter();
  const user = getCurrentUser();
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [trucks, setTrucks] = useState<ApiTruck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, t] = await Promise.all([api.orders.list(), api.trucks.list()]);
      setOrders(o);
      setTrucks(t);
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
      <Sidebar role="PLATFORM_ADMIN" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Admin Dashboard" user={user} />
        <main className="flex-1 overflow-y-auto p-6">
          {loading && <p className="text-slate-500">Loading...</p>}
          {error && <p className="text-red-600">{error}</p>}
          {!loading && !error && (
            <div className="grid grid-cols-2 gap-6 max-w-lg">
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm text-center">
                <p className="text-sm text-gray-500 mb-1">Total Orders</p>
                <p className="text-4xl font-bold text-gray-900">{orders.length}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm text-center">
                <p className="text-sm text-gray-500 mb-1">Fleet Size</p>
                <p className="text-4xl font-bold text-gray-900">{trucks.length}</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
