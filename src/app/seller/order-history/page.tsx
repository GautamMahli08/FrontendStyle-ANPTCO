'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import OrderTimeline from '@/src/components/orders/OrderTimeline';
import CopyId from '@/src/components/ui/CopyId';
import {
  getCurrentUser, getOrders, getTrucks, shortOrderId, destinationCoords, FIXED_DEPOT,
} from '@/src/lib/demo-data';
import { getCachedRoadRoute } from '@/src/lib/route-geometry';
import { getHistory } from '@/src/lib/telemetry-store';

const RouteReplayMap = dynamic(() => import('@/src/components/fleet/RouteReplayMap'), {
  ssr: false,
  loading: () => <div className="w-full h-[220px] flex items-center justify-center text-sm text-gray-400">Loading route…</div>,
});

const STATUS_PILL: Record<string, string> = {
  ASSIGNED:  'bg-indigo-100  text-indigo-700',
  LOADING:   'bg-cyan-100    text-cyan-700',
  LOADED:    'bg-sky-100     text-sky-700',
  EN_ROUTE:  'bg-blue-100    text-blue-700',
  ARRIVED:   'bg-teal-100    text-teal-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  DELIVERY_FAILED: 'bg-red-100 text-red-700',
  TRIP_EXCEPTION:  'bg-orange-100 text-orange-700',
};

export default function OrderHistoryPage() {
  const router = useRouter();
  const [user,       setUser]       = useState<any>(null);
  const [mounted,    setMounted]    = useState(false);
  const [orders,     setOrders]     = useState<any[]>([]);
  const [trucks,     setTrucks]     = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback((u: any) => {
    setOrders(
      getOrders()
        .filter((o: any) => o.workspaceId === u.workspaceId)
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    );
    setTrucks(getTrucks());
  }, []);

  useEffect(() => {
    setMounted(true);
    const u = getCurrentUser();
    if (!u || u.role !== 'SELLER_MANAGER') { router.push('/'); return; }
    setUser(u);
    load(u);
    const iv = setInterval(() => load(u), 3000);
    return () => clearInterval(iv);
  }, [router, load]);

  if (!mounted || !user) return null;

  const truckFor = (order: any) => trucks.find(t => t.id === order.assignedTruckId);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar userRole={user.role} />
      <div className="flex-1 min-w-0">
        <Header user={user} />
        <main className="p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Order History</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Every dispatch sent from your ERP, with its event timeline and recorded route.
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            {orders.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-3xl mb-2">📭</p>
                <p className="text-sm text-gray-400">No orders yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {orders.map(order => {
                  const isOpen = expandedId === order.id;
                  const truck  = truckFor(order);
                  return (
                    <div key={order.id}>
                      <button
                        onClick={() => setExpandedId(isOpen ? null : order.id)}
                        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 transition"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-gray-900 text-sm">#{shortOrderId(order.id)}</p>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_PILL[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                              {String(order.status).replace(/_/g, ' ')}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5 truncate">
                            {order.assignedTruckRegistration ?? '—'} · {order.volume?.toLocaleString()}L {order.fuelType} · → {order.destinationName ?? '—'}
                          </p>
                        </div>
                        <p className="text-xs text-gray-400 flex-shrink-0">
                          {order.createdAt ? new Date(order.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </p>
                        <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {isOpen && (
                        <div className="px-5 pb-5 space-y-4">
                          <div className="rounded-xl overflow-hidden border border-gray-200">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide px-4 pt-3">Route History (recorded telemetry)</p>
                            <RouteReplayMap
                              points={truck ? getHistory(truck.id).map(p => ({ lat: p.lat, lng: p.lng })) : []}
                              roadRoute={getCachedRoadRoute(FIXED_DEPOT, destinationCoords(order))}
                              className="w-full h-[240px]"
                            />
                          </div>

                          <div className="rounded-xl border border-gray-200 grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
                            <div className="p-4">
                              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Delivery Details</p>
                              <dl className="space-y-2.5 text-sm">
                                <div className="flex items-start gap-3">
                                  <dt className="text-gray-400 w-24 flex-shrink-0">Driver</dt>
                                  <dd className="font-semibold text-gray-900 truncate">{order.assignedDriverName ?? '—'}</dd>
                                </div>
                                <div className="flex items-start gap-3">
                                  <dt className="text-gray-400 w-24 flex-shrink-0">Order</dt>
                                  <dd className="font-semibold text-gray-900">
                                    <CopyId value={shortOrderId(order.id)} label={`#${shortOrderId(order.id)}`} />
                                  </dd>
                                </div>
                                <div className="flex items-start gap-3">
                                  <dt className="text-gray-400 w-24 flex-shrink-0">Cargo</dt>
                                  <dd className="font-semibold text-gray-900 truncate">{order.volume?.toLocaleString()}L {order.fuelType}</dd>
                                </div>
                                <div className="flex items-start gap-3">
                                  <dt className="text-gray-400 w-24 flex-shrink-0">Destination</dt>
                                  <dd className="font-semibold text-gray-900 truncate">{order.destinationName ?? '—'}</dd>
                                </div>
                                <div className="flex items-start gap-3">
                                  <dt className="text-gray-400 w-24 flex-shrink-0">Client</dt>
                                  <dd className="font-semibold text-gray-900 truncate">{order.clientName ?? '—'}</dd>
                                </div>
                                {order.erpDispatchNo && (
                                  <div className="flex items-start gap-3">
                                    <dt className="text-gray-400 w-24 flex-shrink-0">Order Ref</dt>
                                    <dd className="font-mono text-gray-900 truncate">{order.erpDispatchNo}</dd>
                                  </div>
                                )}
                              </dl>
                            </div>
                            <div className="p-4">
                              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
                                Event Timeline · #{shortOrderId(order.id)}
                              </p>
                              <OrderTimeline order={order} showHeader={false} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
