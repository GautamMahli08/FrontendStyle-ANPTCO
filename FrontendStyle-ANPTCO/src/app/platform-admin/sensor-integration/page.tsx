'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api, type ApiSensorRequest } from '@/src/lib/api';

const STATUS_COLOR: Record<string, string> = {
  PENDING_SELLER: 'bg-yellow-100 text-yellow-700',
  PENDING_ADMIN:  'bg-amber-100  text-amber-700',
  APPROVED:       'bg-emerald-100 text-emerald-700',
  REJECTED:       'bg-red-100    text-red-700',
};

const STEP_DESC: Record<string, string> = {
  PENDING_SELLER: 'Waiting for seller to review',
  PENDING_ADMIN:  'Seller approved — waiting for admin final sign-off',
  APPROVED:       'Fully approved · truck activated',
  REJECTED:       'Rejected',
};

export default function PlatformSensorIntegrationPage() {
  const router = useRouter();
  const user   = getCurrentUser();

  const [requests, setRequests] = useState<ApiSensorRequest[]>([]);
  const [filter,   setFilter]   = useState<string>('ALL');
  const [loading,  setLoading]  = useState(true);
  const [busy,     setBusy]     = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRequests(await api.sensorRequests.list());
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load sensor requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) { router.replace('/auth/login'); return; }
    load();
  }, [load, router, user]);

  const act = async (id: string, action: 'approve' | 'reject') => {
    setBusy(id); setError(null);
    try {
      await (action === 'approve' ? api.sensorRequests.approve(id) : api.sensorRequests.reject(id));
      await load();
    } catch (e: any) {
      setError(e.message ?? `Failed to ${action}`);
    } finally {
      setBusy(null);
    }
  };

  if (!user) return null;

  const FILTERS = ['ALL', 'PENDING_SELLER', 'PENDING_ADMIN', 'APPROVED', 'REJECTED'];
  const visible  = filter === 'ALL' ? requests : requests.filter(r => r.status === filter);

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="PLATFORM_ADMIN" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Sensor Integration" user={user} />
        <main className="flex-1 overflow-y-auto p-6 space-y-4">

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {error} — <button onClick={load} className="underline">retry</button>
            </div>
          )}

          <p className="text-xs text-slate-500">
            Two-step sensor approval: TSP submits → Seller reviews (Step 1) → Admin activates (Step 2).
            Activation creates the truck record and generates its QR code.
          </p>

          {/* Filter tabs */}
          <div className="flex gap-1 flex-wrap">
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filter === f ? 'bg-purple-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}>
                {f === 'ALL' ? `All (${requests.length})` : `${f.replace('_', ' ')} (${requests.filter(r => r.status === f).length})`}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-slate-200">
            {loading ? (
              <div className="p-12 flex justify-center">
                <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : visible.length === 0 ? (
              <p className="p-12 text-center text-slate-400 text-sm">No sensor requests found.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {visible.map(r => (
                  <div key={r.id} className="px-5 py-4 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[r.status]}`}>
                          {r.status.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs text-slate-400">#{r.id.slice(-6).toUpperCase()}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800 font-mono">{r.device_imei}</p>
                      {r.registration_no && <p className="text-xs text-slate-500">Reg: {r.registration_no}</p>}
                      <p className="text-xs text-slate-400 mt-0.5">{STEP_DESC[r.status]}</p>
                      <p className="text-[11px] text-slate-300">{new Date(r.created_at).toLocaleString()}</p>
                    </div>
                    {r.status === 'PENDING_ADMIN' && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => act(r.id, 'approve')} disabled={!!busy}
                          className="text-xs font-semibold px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                          {busy === r.id ? '…' : 'Activate'}
                        </button>
                        <button onClick={() => act(r.id, 'reject')} disabled={!!busy}
                          className="text-xs font-semibold px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 disabled:opacity-50">
                          Reject
                        </button>
                      </div>
                    )}
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
