'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api, type ApiOrder, type ApiTruck, type ApiAssetEvent, type ApiAdminWorkspace } from '@/src/lib/api';

const STATUS_COLOR: Record<string, string> = {
  PLACED:             'bg-yellow-100 text-yellow-700',
  ACCEPTED_BY_SELLER: 'bg-purple-100 text-purple-700',
  ASSIGNED_TO_TSP:    'bg-amber-100  text-amber-700',
  ASSIGNED:           'bg-indigo-100 text-indigo-700',
  LOADING:            'bg-cyan-100   text-cyan-700',
  LOADED:             'bg-sky-100    text-sky-700',
  EN_ROUTE:           'bg-blue-100   text-blue-700',
  ARRIVED:            'bg-teal-100   text-teal-700',
  DELIVERY_ACCEPTED:  'bg-lime-100   text-lime-700',
  COMPLETED:          'bg-emerald-100 text-emerald-700',
  CANCELLED:          'bg-red-100    text-red-700',
};

const EVENT_ICON: Record<string, string> = {
  FUEL_FILL:              '⛽',
  FUEL_DRAIN:             '📉',
  BATTERY_ON:             '🔋',
  BATTERY_OFF:            '🔌',
  IGNITION_ON:            '🔑',
  IGNITION_OFF:           '🛑',
  MOVEMENT_START:         '▶️',
  MOVEMENT_STOP:          '⏹️',
  GEOFENCE_ENTER_STATION: '📍',
  GEOFENCE_EXIT_STATION:  '📍',
  GEOFENCE_ENTER_DEPOT:   '🏭',
  GEOFENCE_EXIT_DEPOT:    '🏭',
};

function StatCard({ label, value, sub, color = 'text-gray-900' }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const user   = getCurrentUser();

  const [orders,     setOrders]     = useState<ApiOrder[]>([]);
  const [trucks,     setTrucks]     = useState<ApiTruck[]>([]);
  const [events,     setEvents]     = useState<ApiAssetEvent[]>([]);
  const [workspaces, setWorkspaces] = useState<ApiAdminWorkspace[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, t, e, w] = await Promise.all([
        api.orders.list(),
        api.trucks.list(),
        api.fleet.events(),
        api.admin.listWorkspaces(),
      ]);
      setOrders(o);
      setTrucks(t);
      setEvents(e);
      setWorkspaces(w);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) { router.replace('/auth/login'); return; }
    load();
  }, [load, router, user]);

  if (!user) return null;

  const activeOrders    = orders.filter(o => !['COMPLETED', 'CANCELLED'].includes(o.status));
  const completedOrders = orders.filter(o => o.status === 'COMPLETED');
  const activeTrucks    = trucks.filter(t => t.status === 'EN_ROUTE' || t.status === 'ACTIVE');

  // Order breakdown by status
  const statusCounts = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {});

  // Event breakdown by type (last 20)
  const eventCounts = events.slice(0, 200).reduce<Record<string, number>>((acc, e) => {
    acc[e.event_type] = (acc[e.event_type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="PLATFORM_ADMIN" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Platform Analytics" user={user} />
        <main className="flex-1 overflow-y-auto p-6 space-y-6">

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {error} — <button onClick={load} className="underline">retry</button>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center pt-20">
              <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* KPI row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Total Orders"      value={orders.length}      sub={`${activeOrders.length} active`} />
                <StatCard label="Completed"         value={completedOrders.length} color="text-emerald-600" />
                <StatCard label="Fleet Size"        value={trucks.length}      sub={`${activeTrucks.length} en route`} />
                <StatCard label="Workspaces"        value={workspaces.length}  />
              </div>

              {/* Order status breakdown */}
              {orders.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="font-semibold text-slate-800 text-sm mb-4">Orders by Status</h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(statusCounts).sort(([, a], [, b]) => b - a).map(([status, count]) => (
                      <div key={status} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${STATUS_COLOR[status] ?? 'bg-slate-100 text-slate-600'}`}>
                        <span>{status.replace(/_/g, ' ')}</span>
                        <span className="bg-white/60 rounded-full px-1.5">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent orders */}
              {orders.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200">
                  <div className="px-5 py-3.5 border-b border-slate-100">
                    <h3 className="font-semibold text-slate-800 text-sm">Recent Orders</h3>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {orders.slice(0, 8).map(o => (
                      <div key={o.id} className="px-5 py-3 flex items-center justify-between">
                        <div>
                          <span className="text-xs font-mono text-slate-500">#{o.id.slice(-6).toUpperCase()}</span>
                          <span className="ml-3 text-xs text-slate-500">
                            {o.volume_liters != null && `${o.volume_liters.toLocaleString()} L`}
                            {o.fuel_type && ` · ${o.fuel_type}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[o.status] ?? 'bg-slate-100 text-slate-600'}`}>
                            {o.status.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[11px] text-slate-400">{new Date(o.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Event activity */}
              {events.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="font-semibold text-slate-800 text-sm mb-4">Asset Event Activity (last 200)</h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(eventCounts).sort(([, a], [, b]) => b - a).map(([type, count]) => (
                      <div key={type} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs text-slate-700">
                        <span>{EVENT_ICON[type] ?? '•'}</span>
                        <span className="font-medium">{type.replace(/_/g, ' ')}</span>
                        <span className="text-slate-400">×{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {orders.length === 0 && events.length === 0 && (
                <div className="text-center py-16 text-slate-400">
                  <p className="text-4xl mb-3">📊</p>
                  <p className="font-medium">No data yet</p>
                  <p className="text-sm">Analytics will appear once orders and events are recorded.</p>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
