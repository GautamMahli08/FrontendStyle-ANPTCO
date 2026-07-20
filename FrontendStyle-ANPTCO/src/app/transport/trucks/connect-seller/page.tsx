'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api, type ApiSeller, type ApiConnection } from '@/src/lib/api';

const STATUS_COLOR: Record<string, string> = {
  PENDING:  'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
};

export default function ConnectSellerPage() {
  const router = useRouter();
  const user = getCurrentUser();

  const [sellers,     setSellers]     = useState<ApiSeller[]>([]);
  const [connections, setConnections] = useState<ApiConnection[]>([]);
  const [sellerCode,  setSellerCode]  = useState('');
  const [loading,     setLoading]     = useState(true);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [success,     setSuccess]     = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([api.sellers.list(), api.connections.list()]);
      setSellers(s);
      setConnections(c);
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
  }, [load, router, user]);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellerCode.trim()) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await api.connections.request(sellerCode.trim());
      setSuccess('Connection request sent — waiting for seller approval.');
      setSellerCode('');
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Failed to request connection');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="TRANSPORT_ADMIN" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Connect Seller" user={user} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-6">

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-1">Request a Connection</h2>
              <p className="text-xs text-gray-500 mb-4">
                Enter the seller's code to send a connection request. Once approved, you'll be
                assignable as a transporter on their orders.
              </p>

              {sellers.length > 0 && (
                <div className="mb-4 text-xs text-gray-500">
                  Available sellers: {sellers.map(s => (
                    <span key={s.id} className="inline-block bg-gray-100 rounded px-2 py-0.5 mr-1.5 mt-1 font-mono">
                      {s.seller_code ?? s.slug}
                    </span>
                  ))}
                </div>
              )}

              <form onSubmit={handleRequest} className="flex gap-3">
                <input
                  type="text" value={sellerCode} onChange={e => setSellerCode(e.target.value)}
                  placeholder="SELLER-XXXX"
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button type="submit" disabled={submitting || !sellerCode.trim()}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold rounded-lg text-sm transition-colors">
                  {submitting ? 'Sending…' : 'Request'}
                </button>
              </form>

              {error   && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mt-4">{error}</p>}
              {success && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 mt-4">{success}</p>}
            </div>

            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3.5 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900 text-sm">Your Requests ({connections.length})</h2>
              </div>
              {loading ? (
                <p className="p-8 text-center text-gray-400 text-sm">Loading…</p>
              ) : connections.length === 0 ? (
                <p className="p-8 text-center text-gray-400 text-sm">No connection requests yet.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {connections.map(c => (
                    <div key={c.id} className="px-5 py-3.5 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-mono text-gray-800">{c.seller_code}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{new Date(c.requested_at).toLocaleString()}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[c.status]}`}>
                        {c.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
