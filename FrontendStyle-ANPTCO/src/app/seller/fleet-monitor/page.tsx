'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api, type ApiTruck } from '@/src/lib/api';
import type { FleetMarker } from '@/src/components/FleetMap';

const FleetMap = dynamic(() => import('@/src/components/FleetMap'), { ssr: false });

export default function SellerFleetMonitorPage() {
  const router = useRouter();
  const user   = getCurrentUser();

  const [trucks,  setTrucks]  = useState<ApiTruck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTrucks((await api.trucks.list()) ?? []);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load trucks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) { router.replace('/auth/login'); return; }
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load, router, user]);

  if (!user) return null;

  const markers: FleetMarker[] = trucks
    .filter(t => t.latitude != null && t.longitude != null)
    .map(t => ({
      id:               t.id,
      lat:              t.latitude!,
      lng:              t.longitude!,
      label:            t.device_id,
      status:           t.status,
      speed:            t.speed ?? null,
      totalFuel:        t.total_fuel_liters,
      compartmentFuel:  t.compartment_fuel,
    }));

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="SELLER_MANAGER" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Fleet Monitor" user={user} />
        <main className="flex-1 overflow-y-auto p-6 space-y-5">

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
          )}

          {/* Map */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-slate-700">Active Delivery Trucks</p>
                <p className="text-xs text-slate-400 mt-0.5">Trucks currently on orders assigned to your seller account</p>
              </div>
              <span className="text-xs text-slate-400">Auto-refreshes every 30 s</span>
            </div>
            {loading ? (
              <div className="h-96 flex items-center justify-center text-slate-400 text-sm">Loading…</div>
            ) : markers.length === 0 ? (
              <div className="h-96 flex flex-col items-center justify-center text-slate-400 gap-2">
                <span className="text-3xl">🗺️</span>
                <p className="text-sm font-medium text-slate-500">No active trucks</p>
                <p className="text-xs text-slate-400">Trucks appear here once an order is assigned and the truck has GPS.</p>
              </div>
            ) : (
              <FleetMap markers={markers} height={420} />
            )}
          </div>

          {/* Truck table */}
          {trucks.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">
                  {trucks.length} truck{trucks.length !== 1 ? 's' : ''} on active orders
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {trucks.map(t => (
                  <div key={t.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800 font-mono">{t.device_id}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {t.latitude != null
                          ? `${t.latitude.toFixed(5)}, ${t.longitude!.toFixed(5)}`
                          : 'Awaiting GPS'}
                        {t.speed != null && ` · ${t.speed} km/h`}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      t.status === 'EN_ROUTE' ? 'bg-blue-100  text-blue-700'  :
                      t.status === 'ARRIVED'  ? 'bg-teal-100  text-teal-700'  :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {t.status}
                    </span>
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
