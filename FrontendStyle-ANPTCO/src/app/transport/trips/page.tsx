'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api, type ApiTrip, type ApiTruck } from '@/src/lib/api';

const STATUS_COLOR: Record<string, string> = {
  EN_ROUTE:          'bg-blue-100 text-blue-700',
  ARRIVED:           'bg-teal-100 text-teal-700',
  DELIVERY_ACCEPTED: 'bg-emerald-100 text-emerald-700',
  COMPLETED:         'bg-green-100 text-green-700',
  CANCELLED:         'bg-red-100 text-red-700',
};

const STATUS_LABEL: Record<string, string> = {
  EN_ROUTE:          'En Route',
  ARRIVED:           'Arrived',
  DELIVERY_ACCEPTED: 'Delivered',
  COMPLETED:         'Completed',
  CANCELLED:         'Cancelled',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function TripsPage() {
  const router = useRouter();
  const user   = getCurrentUser();

  const [trips,    setTrips]    = useState<ApiTrip[]>([]);
  const [trucks,   setTrucks]   = useState<ApiTruck[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filter,   setFilter]   = useState<string>('ALL');

  const truckById = new Map(trucks.map(t => [t.id, t]));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, tr] = await Promise.all([api.trips.list(), api.trucks.list()]);
      setTrips((t ?? []).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      setTrucks(tr ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) { router.replace('/auth/login'); return; }
    load();
  }, [user, router, load]);

  async function deleteTrip(id: string) {
    setDeleting(id);
    try {
      await api.trips.delete(id);
      setTrips(prev => prev.filter(t => t.id !== id));
    } catch {
      // keep row on failure
    } finally {
      setDeleting(null);
    }
  }

  const statuses = ['ALL', 'EN_ROUTE', 'ARRIVED', 'DELIVERY_ACCEPTED', 'COMPLETED'];
  const visible  = filter === 'ALL' ? trips : trips.filter(t => t.status === filter);

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar role="TRANSPORT_ADMIN" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Trips" user={user} />

        <div className="flex-1 overflow-y-auto p-6">

          {/* Filter tabs */}
          <div className="flex gap-1 mb-5 bg-white border border-slate-200 rounded-xl p-1 w-fit">
            {statuses.map(s => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  filter === s
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {s === 'ALL' ? 'All' : (STATUS_LABEL[s] ?? s)}
                <span className={`ml-1.5 text-[10px] font-bold ${filter === s ? 'text-blue-200' : 'text-slate-400'}`}>
                  {s === 'ALL' ? trips.length : trips.filter(t => t.status === s).length}
                </span>
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="grid text-[10px] font-bold uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200 px-4 py-2.5"
                 style={{ gridTemplateColumns: '2fr 1.2fr 1.2fr 1.2fr 100px 80px' }}>
              <span>Destination</span>
              <span>Truck</span>
              <span>Created</span>
              <span>Updated</span>
              <span>Status</span>
              <span />
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-40 text-sm text-slate-400">Loading…</div>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-400">
                <span className="text-3xl">🚚</span>
                <p className="text-sm">No trips{filter !== 'ALL' ? ` with status ${STATUS_LABEL[filter] ?? filter}` : ''}</p>
              </div>
            ) : visible.map(t => {
              const truck = truckById.get(t.truck_id);
              const isDel = deleting === t.id;
              return (
                <div
                  key={t.id}
                  className="group grid items-center px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition"
                  style={{ gridTemplateColumns: '2fr 1.2fr 1.2fr 1.2fr 100px 80px' }}
                >
                  {/* Destination */}
                  <div className="min-w-0 pr-3">
                    <p className="text-sm font-semibold text-slate-800 truncate">{t.dest_name}</p>
                    {t.origin_name && (
                      <p className="text-xs text-slate-400 truncate">from {t.origin_name}</p>
                    )}
                    {t.order_ref && (
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{t.order_ref}</p>
                    )}
                  </div>

                  {/* Truck */}
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-slate-700 truncate">
                      {truck?.device_id ?? t.truck_id.slice(0, 8) + '…'}
                    </p>
                    {t.driver_name && (
                      <p className="text-xs text-slate-400 truncate">{t.driver_name}</p>
                    )}
                  </div>

                  {/* Created */}
                  <div>
                    <p className="text-xs text-slate-700">{fmtDate(t.created_at)}</p>
                    <p className="text-xs text-slate-400 font-mono">{fmtTime(t.created_at)}</p>
                  </div>

                  {/* Updated */}
                  <div>
                    <p className="text-xs text-slate-700">{fmtDate(t.updated_at)}</p>
                    <p className="text-xs text-slate-400 font-mono">{fmtTime(t.updated_at)}</p>
                  </div>

                  {/* Status */}
                  <div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${STATUS_COLOR[t.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => deleteTrip(t.id)}
                      disabled={isDel}
                      title="Remove trip"
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium text-slate-400 hover:text-red-500 disabled:opacity-30 px-2 py-1 rounded hover:bg-red-50"
                    >
                      {isDel ? '…' : 'Remove'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {visible.length > 0 && (
            <p className="text-xs text-slate-400 mt-3 text-right">
              {visible.length} trip{visible.length !== 1 ? 's' : ''}
              {filter !== 'ALL' ? ` · ${trips.length} total` : ''}
            </p>
          )}

        </div>
      </div>
    </div>
  );
}
