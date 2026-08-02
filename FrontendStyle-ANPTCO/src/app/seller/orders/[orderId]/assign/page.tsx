'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api, type ApiOrder, type ApiConnection } from '@/src/lib/api';

export default function AssignPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.orderId as string;
  const user = getCurrentUser();

  const [order,       setOrder]       = useState<ApiOrder | null>(null);
  const [transporters, setTransporters] = useState<ApiConnection[]>([]);
  const [transporter, setTransporter] = useState('');
  const [loading,     setLoading]     = useState(true);
  const [busy,        setBusy]        = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, conns] = await Promise.all([api.orders.get(orderId), api.connections.list()]);
      setOrder(o);
      setTransporters(conns.filter(c => c.status === 'APPROVED'));
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

  const handleAccept = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.orders.accept(orderId);
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Failed to accept order');
    } finally {
      setBusy(false);
    }
  };

  const handleAssignTsp = async () => {
    if (!transporter) { setError('Select a transporter'); return; }
    setBusy(true);
    setError(null);
    try {
      await api.orders.assignTsp(orderId, transporter);
      router.push('/seller/orders');
    } catch (e: any) {
      setError(e.message ?? 'Failed to assign transporter');
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="SELLER_MANAGER" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Review Order" user={user} />
        <main className="flex-1 overflow-y-auto p-6">
          {loading && <p className="text-gray-500">Loading order...</p>}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 max-w-2xl mx-auto">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
          {!loading && order && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Order Details</h2>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-gray-500">Order ID</dt>
                    <dd className="font-semibold text-gray-900 font-mono">{order.id}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Status</dt>
                    <dd className="font-semibold text-gray-900">{order.status}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Volume</dt>
                    <dd className="font-semibold text-gray-900">{order.volume_liters?.toLocaleString()} L</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Fuel Type</dt>
                    <dd className="font-semibold text-gray-900">{order.fuel_type}</dd>
                  </div>
                  {order.destination_station_id && (
                    <div>
                      <dt className="text-gray-500">Destination Station</dt>
                      <dd className="font-semibold text-gray-900 font-mono text-xs">
                        …{order.destination_station_id.slice(-8)}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              {order.status === 'PLACED' && (
                <button
                  onClick={handleAccept}
                  disabled={busy}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition-colors"
                >
                  {busy ? 'Accepting...' : 'Accept Order'}
                </button>
              )}

              {order.status === 'ACCEPTED_BY_SELLER' && (
                <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                  <h3 className="font-semibold text-gray-900">Assign a Transporter</h3>
                  {transporters.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No connected transporters yet. Approve a connection request on the{' '}
                      <button onClick={() => router.push('/seller/transporters')} className="text-blue-600 hover:underline">
                        Transporters
                      </button> page first.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-gray-500">Select a connected transporter to assign this order to.</p>
                      <select
                        value={transporter} onChange={e => setTransporter(e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select transporter…</option>
                        {transporters.map(c => (
                          <option key={c.id} value={c.transporter_id}>
                            {c.transporter_email || `Transport Admin (…${c.transporter_id.slice(-8)})`}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={handleAssignTsp}
                        disabled={busy || !transporter}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition-colors"
                      >
                        {busy ? 'Assigning...' : 'Assign Transporter'}
                      </button>
                    </>
                  )}
                </div>
              )}

              {!['PLACED', 'ACCEPTED_BY_SELLER'].includes(order.status) && (
                <p className="text-center text-sm text-gray-400">
                  This order has moved past the seller review stage.
                </p>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
