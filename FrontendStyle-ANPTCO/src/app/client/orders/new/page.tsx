'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api, type ApiSeller, type ApiGeofence } from '@/src/lib/api';

const FUEL_TYPES = ['PETROL', 'DIESEL', 'JET_A1', 'LPG'];

export default function NewOrder() {
  const router = useRouter();
  const user   = getCurrentUser();

  const [sellers,   setSellers]   = useState<ApiSeller[]>([]);
  const [stations,  setStations]  = useState<ApiGeofence[]>([]);
  const [sellerId,  setSellerId]  = useState('');
  const [stationId, setStationId] = useState('');
  const [fuelType,  setFuelType]  = useState('DIESEL');
  const [volume,    setVolume]    = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!user) { router.replace('/auth/login'); return; }
    Promise.all([api.sellers.list(), api.stations.list()])
      .then(([s, st]) => { setSellers(s); setStations(st); })
      .catch(e => setError(e.message ?? 'Failed to load data'));
  }, [router, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellerId) { setError('Please select a seller'); return; }
    setSubmitting(true);
    setError(null);
    try {
      await api.orders.create({
        seller_workspace_id:    sellerId,
        destination_station_id: stationId || undefined,
        fuel_type:              fuelType,
        volume_liters:          volume ? Number(volume) : undefined,
      });
      router.push('/client/orders');
    } catch (e: any) {
      setError(e.message ?? 'Failed to place order');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="CLIENT" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="New Order" user={user} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-lg mx-auto">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="font-semibold text-slate-800 mb-5">Place Fuel Order</h2>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Seller *</label>
                  <select value={sellerId} onChange={e => setSellerId(e.target.value)} required
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select seller…</option>
                    {sellers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Delivery Station</label>
                  {stations.length === 0 ? (
                    <div className="border border-dashed border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-400 flex items-center justify-between">
                      <span>No stations registered</span>
                      <a href="/client/tanks" className="text-blue-600 font-semibold hover:underline text-xs">+ Add one</a>
                    </div>
                  ) : (
                    <select value={stationId} onChange={e => setStationId(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Select station…</option>
                      {stations.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Fuel Type</label>
                  <select value={fuelType} onChange={e => setFuelType(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {FUEL_TYPES.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Volume (litres)</label>
                  <input
                    type="number" min="1" step="1"
                    value={volume} onChange={e => setVolume(e.target.value)}
                    placeholder="e.g. 9100"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => router.back()}
                    className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                    Cancel
                  </button>
                  <button type="submit" disabled={submitting}
                    className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                    {submitting ? 'Placing…' : 'Place Order'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
