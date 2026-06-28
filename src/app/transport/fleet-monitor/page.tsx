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

export default function TransportFleetMonitorPage() {
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
    const timer = setInterval(load, 30_000); // refresh every 30 s
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

  const located   = markers.length;
  const unlocated = trucks.length - located;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="TRANSPORT_ADMIN" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Fleet Monitor" user={user} />
        <main className="flex-1 overflow-y-auto p-6 space-y-5">

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total Trucks',   value: trucks.length,                              color: 'slate' },
              { label: 'On Map',         value: located,                                    color: 'blue'  },
              { label: 'No GPS Yet',     value: unlocated,                                  color: 'amber' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500">{s.label}</p>
                <p className="text-2xl font-bold text-slate-800 mt-0.5">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Map */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-700">Live Positions</p>
              <span className="text-xs text-slate-400">Auto-refreshes every 30 s</span>
            </div>
            {loading ? (
              <div className="h-96 flex items-center justify-center text-slate-400 text-sm">Loading…</div>
            ) : markers.length === 0 ? (
              <div className="h-96 flex flex-col items-center justify-center text-slate-400 gap-2">
                <span className="text-3xl">📍</span>
                <p className="text-sm">No GPS data yet — trucks appear here once telemetry is received.</p>
              </div>
            ) : (
              <FleetMap markers={markers} height={420} />
            )}
          </div>

          {/* Truck list */}
          {trucks.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-700">Truck List</p>
              </div>
              <div className="divide-y divide-slate-100">
                {trucks.map(t => (
                  <div key={t.id} className="px-5 py-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800 font-mono">{t.device_id}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {t.latitude != null
                            ? `${t.latitude.toFixed(5)}, ${t.longitude!.toFixed(5)}`
                            : 'No GPS data'}
                          {t.speed != null && ` · ${t.speed} km/h`}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                          t.status === 'IDLE'     ? 'bg-green-100 text-green-700' :
                          t.status === 'EN_ROUTE' ? 'bg-blue-100  text-blue-700'  :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {t.status}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-1">{t.last_seen_at ? new Date(t.last_seen_at).toLocaleTimeString() : 'No signal'}</p>
                      </div>
                    </div>
                    {/* Vertical fuel compartment bars — 9100 L capacity each */}
                    {(() => {
                      const CAP = 9100;
                      const colors = ['bg-blue-500','bg-cyan-400','bg-teal-500','bg-sky-500'];
                      const totalLoaded = [1,2,3,4].reduce((s,i) => s + (t.compartment_fuel?.[String(i)] ?? 0), 0);
                      return (
                        <div className="space-y-1.5">
                          <div className="flex gap-2">
                            {[1,2,3,4].map(i => {
                              const liters = t.compartment_fuel?.[String(i)] ?? 0;
                              const pct    = Math.min(100, (liters / CAP) * 100);
                              const isEmpty = liters === 0;
                              return (
                                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                                  <span className="text-[8px] font-bold text-slate-400">C{i}</span>
                                  <div className="relative w-full bg-slate-100 rounded overflow-hidden" style={{height: 52}}>
                                    <div
                                      className={`absolute bottom-0 w-full transition-all duration-700 ${isEmpty ? 'bg-slate-200 opacity-40' : colors[i-1]}`}
                                      style={{height: `${Math.max(pct, isEmpty ? 100 : 2)}%`}}
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <span className={`text-[9px] font-bold ${isEmpty ? 'text-slate-400' : 'text-white drop-shadow-sm'}`}>
                                        {isEmpty ? '—' : pct < 1 ? `${pct.toFixed(1)}%` : `${pct.toFixed(0)}%`}
                                      </span>
                                    </div>
                                  </div>
                                  <span className="text-[8px] font-semibold text-slate-600 font-mono">{liters.toLocaleString()}</span>
                                  <span className="text-[7px] text-slate-400">/{CAP.toLocaleString()}L</span>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex justify-between text-[9px] pt-0.5 border-t border-slate-100">
                            <span className="text-slate-400">Total</span>
                            <span className="font-semibold text-slate-600">{totalLoaded.toLocaleString()} / {(CAP*4).toLocaleString()} L</span>
                          </div>
                        </div>
                      );
                    })()}
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
