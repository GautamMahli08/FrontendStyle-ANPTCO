'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api, type ApiOrder, type ApiDeliveryNote, type ApiGeofence } from '@/src/lib/api';

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

  const [orders,       setOrders]       = useState<ApiOrder[]>([]);
  const [stations,     setStations]     = useState<Record<string, string>>({});
  const [filter,       setFilter]       = useState<Filter>('ALL');
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [noteLoading,  setNoteLoading]  = useState<string | null>(null); // order id being fetched
  const [noteModal,    setNoteModal]    = useState<ApiDeliveryNote | null>(null);

  const load = useCallback(async () => {
    try {
      const [orders, stationList] = await Promise.all([api.orders.list(), api.stations.list()]);
      setOrders(orders);
      setStations(Object.fromEntries(stationList.map((s: ApiGeofence) => [s.id, s.name])));
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

  const fetchNote = async (orderId: string) => {
    setNoteLoading(orderId);
    try {
      const note = await api.orders.getDeliveryNote(orderId);
      setNoteModal(note);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load delivery note');
    } finally {
      setNoteLoading(null);
    }
  };

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
                        {order.destination_station_id && ` · ${stations[order.destination_station_id] ?? order.destination_station_id.slice(-8).toUpperCase()}`}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{new Date(order.created_at).toLocaleString()}</p>
                    </div>
                    {order.status === 'ARRIVED' && (
                      <button onClick={() => router.push(`/client/delivery/scan-qr?orderId=${order.id}`)}
                        className="text-xs font-semibold px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 flex-shrink-0">
                        Scan QR
                      </button>
                    )}
                    {(order.status === 'DELIVERY_ACCEPTED' || order.status === 'COMPLETED') && (
                      <button
                        onClick={() => fetchNote(order.id)}
                        disabled={noteLoading === order.id}
                        className="text-xs font-semibold px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex-shrink-0 disabled:opacity-50">
                        {noteLoading === order.id ? '…' : 'Delivery Note'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Delivery Note Modal */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setNoteModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-800 text-lg">Delivery Note</h2>
              <button onClick={() => setNoteModal(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
            </div>

            {noteModal.qr_confirmed && (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-700 font-semibold">
                <span>✓</span> QR Confirmed
              </div>
            )}

            <div className="space-y-2 text-sm text-slate-700">
              {noteModal.note_data.dest_name && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Destination</span>
                  <span className="font-medium">{noteModal.note_data.dest_name}</span>
                </div>
              )}
              {noteModal.note_data.fuel_type && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Fuel Type</span>
                  <span className="font-medium">{noteModal.note_data.fuel_type}</span>
                </div>
              )}
              {noteModal.note_data.volume_ordered_liters != null && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Ordered</span>
                  <span className="font-medium">{noteModal.note_data.volume_ordered_liters.toLocaleString()} L</span>
                </div>
              )}
            </div>

            {/* Fuel loaded */}
            {noteModal.note_data.fuel_loaded && Object.keys(noteModal.note_data.fuel_loaded).length > 0 && (
              <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
                <p className="text-xs font-semibold text-slate-600 mb-1.5">Loaded per compartment</p>
                {Object.entries(noteModal.note_data.fuel_loaded).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs text-slate-600">
                    <span>Compartment {k}</span>
                    <span className="font-mono font-semibold">{Number(v).toLocaleString()} L</span>
                  </div>
                ))}
              </div>
            )}

            {/* Fuel delivered */}
            {noteModal.note_data.fuel_delivered && Object.keys(noteModal.note_data.fuel_delivered).length > 0 && (
              <div className="bg-teal-50 rounded-lg p-3 space-y-1.5">
                <p className="text-xs font-semibold text-teal-700 mb-1.5">Delivered per compartment</p>
                {Object.entries(noteModal.note_data.fuel_delivered).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs text-teal-600">
                    <span>Compartment {k}</span>
                    <span className="font-mono font-semibold">{Number(v).toLocaleString()} L</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1 text-xs text-slate-500">
              {noteModal.note_data.dist_m != null && (
                <p>Distance at scan: {noteModal.note_data.dist_m} m</p>
              )}
              {noteModal.note_data.accepted_at && (
                <p>Accepted: {new Date(noteModal.note_data.accepted_at).toLocaleString()}</p>
              )}
              <p>Generated: {new Date(noteModal.generated_at).toLocaleString()}</p>
            </div>

            {noteModal.download_url && (
              <a href={noteModal.download_url} target="_blank" rel="noopener noreferrer"
                className="block w-full text-center py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
                Download JSON
              </a>
            )}

            <button onClick={() => setNoteModal(null)}
              className="w-full py-2 rounded-lg border border-slate-200 text-sm text-slate-500 hover:bg-slate-50">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
