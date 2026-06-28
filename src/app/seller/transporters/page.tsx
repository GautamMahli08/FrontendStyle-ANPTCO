'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api, type ApiConnection } from '@/src/lib/api';

const STATUS_COLOR: Record<string, string> = {
  PENDING:  'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
};

export default function TransportersPage() {
  const router = useRouter();
  const user = getCurrentUser();

  const [connections, setConnections] = useState<ApiConnection[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [busy,        setBusy]        = useState<string | null>(null);
  const [error,       setError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setConnections(await api.connections.list());
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load transporters');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) { router.replace('/auth/login'); return; }
    load();
  }, [load, router, user]);

  const resolve = async (id: string, action: 'approve' | 'reject') => {
    setBusy(id);
    setError(null);
    try {
      await (action === 'approve' ? api.connections.approve(id) : api.connections.reject(id));
      await load();
    } catch (e: any) {
      setError(e.message ?? `Failed to ${action} request`);
    } finally {
      setBusy(null);
    }
  };

  if (!user) return null;

  const pending  = connections.filter(c => c.status === 'PENDING');
  const resolved = connections.filter(c => c.status !== 'PENDING');

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="SELLER_MANAGER" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Transporters" user={user} />
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-3.5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 text-sm">Pending Requests ({pending.length})</h2>
            </div>
            {loading ? (
              <p className="p-8 text-center text-gray-400 text-sm">Loading…</p>
            ) : pending.length === 0 ? (
              <p className="p-8 text-center text-gray-400 text-sm">No pending connection requests.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {pending.map(c => (
                  <div key={c.id} className="px-5 py-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-mono text-gray-800 truncate">{c.transporter_id}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">Requested {new Date(c.requested_at).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => resolve(c.id, 'approve')} disabled={!!busy}
                        className="text-xs font-semibold px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                        {busy === c.id ? '…' : 'Approve'}
                      </button>
                      <button onClick={() => resolve(c.id, 'reject')} disabled={!!busy}
                        className="text-xs font-semibold px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-3.5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 text-sm">Connected Transporters ({resolved.filter(c => c.status === 'APPROVED').length})</h2>
            </div>
            {resolved.length === 0 ? (
              <p className="p-8 text-center text-gray-400 text-sm">No resolved connections yet.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {resolved.map(c => (
                  <div key={c.id} className="px-5 py-3.5 flex items-center justify-between">
                    <p className="text-sm font-mono text-gray-700">{c.transporter_id}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[c.status]}`}>
                      {c.status}
                    </span>
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
