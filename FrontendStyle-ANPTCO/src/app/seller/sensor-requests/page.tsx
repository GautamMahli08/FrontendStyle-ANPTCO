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

export default function SensorRequestsPage() {
  const router = useRouter();
  const user   = getCurrentUser();

  const [requests, setRequests] = useState<ApiSensorRequest[]>([]);
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

  const pending  = requests.filter(r => r.status === 'PENDING_SELLER');
  const resolved = requests.filter(r => r.status !== 'PENDING_SELLER');

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="SELLER_MANAGER" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Sensor Requests" user={user} />
        <main className="flex-1 overflow-y-auto p-6 space-y-6">

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {error} — <button onClick={load} className="underline">retry</button>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800 text-sm">Pending Your Review ({pending.length})</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Approve to forward to platform admin for final activation. Reject to decline the request.
              </p>
            </div>
            {loading ? (
              <div className="p-8 flex justify-center">
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : pending.length === 0 ? (
              <p className="p-8 text-center text-slate-400 text-sm">No pending sensor requests.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {pending.map(r => (
                  <div key={r.id} className="px-5 py-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 font-mono">{r.device_imei}</p>
                      {r.registration_no && <p className="text-xs text-slate-500">Reg: {r.registration_no}</p>}
                      <p className="text-xs text-slate-400 mt-0.5">Submitted {new Date(r.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => act(r.id, 'approve')} disabled={!!busy}
                        className="text-xs font-semibold px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                        {busy === r.id ? '…' : 'Approve'}
                      </button>
                      <button onClick={() => act(r.id, 'reject')} disabled={!!busy}
                        className="text-xs font-semibold px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 disabled:opacity-50">
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {resolved.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200">
              <div className="px-5 py-3.5 border-b border-slate-100">
                <h2 className="font-semibold text-slate-800 text-sm">Previously Reviewed ({resolved.length})</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {resolved.map(r => (
                  <div key={r.id} className="px-5 py-3.5 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-mono text-slate-700">{r.device_imei}</p>
                      {r.registration_no && <p className="text-xs text-slate-400">Reg: {r.registration_no}</p>}
                      <p className="text-[11px] text-slate-300">{new Date(r.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[r.status]}`}>
                      {r.status.replace('_', ' ')}
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
