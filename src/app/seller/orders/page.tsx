'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import {
  getCurrentUser, getUsers, getOrders, getTrucks,
  getSellerConnections, updateOrder, addNotification, shortOrderId,
  advanceJourneys, advanceLoading,
} from '@/src/lib/demo-data';
import { logDemoEvent } from '@/src/app/client/dashboard/page';
import OrderTimeline from '@/src/components/orders/OrderTimeline';
import CopyId from '@/src/components/ui/CopyId';

const STATUS_COLOR: Record<string, string> = {
  PLACED:             'bg-yellow-100 text-yellow-700',
  ACCEPTED_BY_SELLER: 'bg-purple-100 text-purple-700',
  ASSIGNED_TO_TSP:    'bg-amber-100  text-amber-700',
  ASSIGNED:           'bg-indigo-100 text-indigo-700',
  LOADING:            'bg-cyan-100   text-cyan-700',
  LOADED:             'bg-sky-100    text-sky-700',
  EN_ROUTE:           'bg-blue-100   text-blue-700',
  ARRIVED:            'bg-teal-100   text-teal-700',
  COMPLETED:          'bg-emerald-100 text-emerald-700',
  CANCELLED:          'bg-red-100    text-red-700',
};

const TRACKABLE = ['ASSIGNED', 'LOADING', 'LOADED', 'EN_ROUTE', 'ARRIVED'];

function fuelSummary(order: any): string {
  if (order.fuelItems?.length > 1) {
    return order.fuelItems.map((f: any) => `${f.volume.toLocaleString()}L ${f.fuelType}`).join(' + ');
  }
  return `${order.volume?.toLocaleString()}L ${order.fuelType}`;
}

export default function SellerOrdersPage() {
  const router = useRouter();
  const [user,        setUser]        = useState<any>(null);
  const [orders,      setOrders]      = useState<any[]>([]);
  const [tsps,        setTsps]        = useState<any[]>([]);
  const [mounted,     setMounted]     = useState(false);
  // which order row is expanded for details
  const [detailId,    setDetailId]    = useState<string | null>(null);
  // which order has the TSP picker open
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [selectedTsp, setSelectedTsp] = useState<string>('');
  // per-order accept spinner
  const [accepting,   setAccepting]   = useState<Record<string, boolean>>({});

  const load = useCallback((u: any) => {
    const all = getOrders()
      .filter((o: any) => o.workspaceId === u.workspaceId)
      .map((o: any) => ({ ...o, createdAt: new Date(o.createdAt) }))
      .sort((a: any, b: any) => b.createdAt - a.createdAt);
    setOrders(all);

    const connections = getSellerConnections()
      .filter((c: any) => c.sellerId === u.id && c.status === 'APPROVED')
      .map((c: any) => c.transporterId);
    const allTrucks = getTrucks();
    const linked = getUsers()
      .filter((u: any) => u.role === 'TRANSPORT_ADMIN' && u.verified && connections.includes(u.id))
      .map((t: any) => {
        const tspTrucks = allTrucks.filter((tr: any) => tr.tspId === t.id);
        return {
          ...t,
          totalTrucks:     tspTrucks.length,
          availableTrucks: tspTrucks.filter((tr: any) => tr.status === 'IDLE' || tr.status === 'ACTIVE').length,
        };
      });
    setTsps(linked);
  }, []);

  useEffect(() => {
    setMounted(true);
    const u = getCurrentUser();
    if (!u || u.role !== 'SELLER_MANAGER') { router.push('/'); return; }
    setUser(u);
    load(u);
    // Keep order statuses fresh (LOADING→LOADED, EN_ROUTE→ARRIVED) even though the
    // map lives on Fleet Monitor now.
    const iv = setInterval(() => { advanceLoading(); advanceJourneys(); load(u); }, 3000);
    return () => clearInterval(iv);
  }, [router, load]);

  if (!mounted || !user) return null;

  // ── Accept ────────────────────────────────────────────────────
  function handleAccept(orderId: string) {
    setAccepting(prev => ({ ...prev, [orderId]: true }));
    setTimeout(() => {
      updateOrder(orderId, { status: 'ACCEPTED_BY_SELLER', workspaceId: user.workspaceId, acceptedAt: new Date() });
      logDemoEvent('seller-001', 'ORDER_ACCEPTED', `orderId=${orderId}`);
      const order = orders.find(o => o.id === orderId);
      if (order?.clientId) {
        addNotification({
          id: `notif-${Date.now()}`, userId: order.clientId,
          type: 'ORDER_ACCEPTED', title: '✅ Order Accepted',
          message: `Your order #${shortOrderId(orderId)} has been accepted.`,
          read: false, createdAt: new Date(),
        });
      }
      setAccepting(prev => ({ ...prev, [orderId]: false }));
      load(user);
    }, 600);
  }

  // ── Decline ───────────────────────────────────────────────────
  function handleDecline(orderId: string) {
    updateOrder(orderId, { status: 'CANCELLED', cancelledAt: new Date() });
    const order = orders.find(o => o.id === orderId);
    if (order?.clientId) {
      addNotification({
        id: `notif-${Date.now()}`, userId: order.clientId,
        type: 'ORDER_REJECTED', title: 'Order Declined',
        message: `Your order #${shortOrderId(orderId)} was declined.`,
        read: false, createdAt: new Date(),
      });
    }
    load(user);
  }

  // ── Assign to TSP ─────────────────────────────────────────────
  function handleAssign(order: any) {
    if (!selectedTsp) return;
    const tsp = tsps.find(t => t.id === selectedTsp);
    if (!tsp) return;

    const tspName = tsp.companyName ?? tsp.firstName;
    updateOrder(order.id, {
      status:          'ASSIGNED_TO_TSP',
      assignedTSPId:   tsp.id,
      assignedToTspAt: new Date(),
    });
    logDemoEvent('seller-001', 'ASSIGNED_TO_TSP', `orderId=${order.id} | tsp=${tspName}`);

    addNotification({
      id: `notif-${Date.now()}`, userId: tsp.id,
      type: 'ORDER_ASSIGNED_TO_TSP', title: '📦 New Order Assigned',
      message: `Order #${shortOrderId(order.id)} — ${fuelSummary(order)} → ${order.destinationName}. Assign a truck to dispatch.`,
      read: false, createdAt: new Date(),
    });
    if (order.clientId) {
      addNotification({
        id: `notif-${Date.now()}-c`, userId: order.clientId,
        type: 'ORDER_PROGRESS', title: '🚛 Transporter Assigned',
        message: `Your order has been assigned to ${tspName}. They will dispatch a truck shortly.`,
        read: false, createdAt: new Date(),
      });
    }

    setAssigningId(null);
    setSelectedTsp('');
    load(user);
  }

  // ── Derived counts ───────────────────────────────────────────
  const pending  = orders.filter(o => o.status === 'PLACED');
  const accepted = orders.filter(o => o.status === 'ACCEPTED_BY_SELLER');
  const withTsp  = orders.filter(o => o.status === 'ASSIGNED_TO_TSP');
  const active   = orders.filter(o => TRACKABLE.includes(o.status));
  const done     = orders.filter(o => o.status === 'COMPLETED');

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar userRole={user.role} />
      <div className="flex-1 min-w-0">
        <Header user={user} />
        <main className="p-6 space-y-6">

          {/* Page header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Seller Portal · ANPTCO</p>
              <h1 className="text-2xl font-black text-gray-900">Orders</h1>
              <p className="text-sm text-gray-500 mt-0.5">Review requests, assign transport, and open a delivery to monitor it</p>
            </div>
            {pending.length > 0 && (
              <span className="bg-yellow-100 text-yellow-700 text-xs font-bold px-3 py-1.5 rounded-full border border-yellow-200">
                {pending.length} pending review
              </span>
            )}
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: 'Pending',    value: pending.length,  color: 'text-yellow-600',  bg: 'bg-yellow-50',  border: 'border-yellow-200' },
              { label: 'Accepted',   value: accepted.length, color: 'text-purple-600',  bg: 'bg-purple-50',  border: 'border-purple-200' },
              { label: 'With TSP',   value: withTsp.length,  color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200'  },
              { label: 'In Transit', value: active.length,   color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-200'   },
              { label: 'Completed',  value: done.length,     color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200'},
            ].map(k => (
              <div key={k.label} className={`${k.bg} border ${k.border} rounded-2xl px-4 py-3 text-center`}>
                <p className={`text-2xl font-black ${k.color}`}>{k.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>

          {/* Orders list */}
          {orders.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center">
              <p className="text-5xl mb-3">📦</p>
              <p className="font-bold text-gray-900 mb-1">No orders yet</p>
              <p className="text-sm text-gray-400">Client orders will appear here in real-time.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              {/* Header row */}
              <div className="grid grid-cols-[0.9fr_1.4fr_1fr_0.8fr_minmax(180px,auto)] gap-4 px-5 py-3 border-b border-gray-100 bg-slate-50">
                {['Order', 'Fuel', 'Destination', 'Status', 'Action'].map((h, i) => (
                  <p key={i} className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{h}</p>
                ))}
              </div>

              <div className="divide-y divide-gray-50">
                {orders.map(order => {
                  const isOpen      = detailId === order.id;
                  const isAssigning = assigningId === order.id;
                  const isAccepting = accepting[order.id];
                  const tsp = tsps.find(t => t.id === order.assignedTSPId);

                  return (
                    <div key={order.id}>
                      {/* Clickable summary row */}
                      <div
                        onClick={() => { setDetailId(isOpen ? null : order.id); setAssigningId(null); }}
                        className={`grid grid-cols-[0.9fr_1.4fr_1fr_0.8fr_minmax(180px,auto)] gap-4 px-5 py-4 items-center cursor-pointer transition hover:bg-slate-50/60 ${
                          order.status === 'PLACED' ? 'bg-yellow-50/30' : ''
                        }`}
                      >
                        <div>
                          <CopyId value={shortOrderId(order.id)} label={`#${shortOrderId(order.id)}`} className="font-bold text-gray-900 text-sm" />
                          <p className="text-xs text-gray-400 mt-0.5">{order.clientName}</p>
                          <p className="text-[10px] text-gray-300 mt-0.5">
                            {new Date(order.createdAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{fuelSummary(order)}</p>
                          {order.fuelItems?.length > 1 && (
                            <p className="text-[11px] text-gray-400 mt-0.5">{order.fuelItems.length} fuel types · {order.volume?.toLocaleString()}L total</p>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 truncate">{order.destinationName ?? '—'}</p>
                        <span className={`inline-block text-[11px] font-bold px-2.5 py-1 rounded-full w-fit ${STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {order.status.replace(/_/g, ' ')}
                        </span>

                        {/* Action — the next step for this order */}
                        <div className="flex items-center justify-between gap-2" onClick={e => e.stopPropagation()}>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {order.status === 'PLACED' && (
                              <>
                                <button
                                  onClick={() => handleAccept(order.id)}
                                  disabled={isAccepting}
                                  className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                                >
                                  {isAccepting ? '…' : '✓ Accept'}
                                </button>
                                <button
                                  onClick={() => handleDecline(order.id)}
                                  className="text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1.5 rounded-lg transition"
                                >
                                  Decline
                                </button>
                              </>
                            )}
                            {order.status === 'ACCEPTED_BY_SELLER' && (
                              <button
                                onClick={() => { setDetailId(order.id); setAssigningId(order.id); setSelectedTsp(''); }}
                                className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition"
                              >
                                Assign transporter
                              </button>
                            )}
                            {order.status === 'ASSIGNED_TO_TSP' && (
                              <span className="text-xs text-amber-600 font-semibold">⏳ Awaiting transporter</span>
                            )}
                            {TRACKABLE.includes(order.status) && (
                              <button
                                onClick={() => router.push(`/seller/fleet-monitor?order=${order.id}`)}
                                className="text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition"
                              >
                                🚛 Track
                              </button>
                            )}
                            {order.status === 'COMPLETED' && (
                              <button
                                onClick={() => router.push(`/seller/fleet-monitor?order=${order.id}`)}
                                className="text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg transition"
                              >
                                View
                              </button>
                            )}
                            {order.status === 'CANCELLED' && <span className="text-xs text-gray-400">—</span>}
                          </div>
                          <svg
                            onClick={() => { setDetailId(isOpen ? null : order.id); setAssigningId(null); }}
                            className={`w-4 h-4 text-gray-300 cursor-pointer transition-transform flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {isOpen && (
                        <div className="border-t border-gray-100 bg-slate-50 px-5 py-4 space-y-4">

                          {/* Quick facts */}
                          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <Fact label="Fuel" value={fuelSummary(order)} />
                            <Fact label="Destination" value={order.destinationName ?? '—'} sub={order.destinationAddress} />
                            <Fact label="Client" value={order.clientName ?? '—'} />
                            <Fact
                              label="Transport"
                              value={order.assignedTruckRegistration ?? tsp?.companyName ?? tsp?.firstName ?? 'Not assigned'}
                              sub={order.assignedDriverName}
                            />
                          </div>
                          {order.notes && (
                            <p className="text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-2">
                              📝 {order.notes}
                            </p>
                          )}

                          {/* TSP picker */}
                          {isAssigning && (
                            <div className="bg-white border border-blue-100 rounded-xl p-4">
                              <p className="text-sm font-bold text-gray-800 mb-3">Choose a transport provider</p>
                              {tsps.length === 0 ? (
                                <p className="text-sm text-gray-400">No approved transport providers linked. Go to Transporters to add one.</p>
                              ) : (
                                <>
                                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                                    {tsps.map(t => {
                                      const isSelected = selectedTsp === t.id;
                                      const name       = t.companyName ?? `${t.firstName} ${t.lastName}`;
                                      const initial    = name[0].toUpperCase();
                                      return (
                                        <button
                                          key={t.id}
                                          onClick={() => setSelectedTsp(t.id)}
                                          className={`relative text-left p-4 rounded-2xl border-2 transition-all ${
                                            isSelected ? 'border-blue-500 bg-white shadow-md shadow-blue-100' : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm'
                                          }`}
                                        >
                                          {isSelected && (
                                            <div className="absolute top-3 right-3 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                            </div>
                                          )}
                                          <div className="flex items-center gap-3 mb-3">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black flex-shrink-0 ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                              {initial}
                                            </div>
                                            <div className="min-w-0">
                                              <p className="font-bold text-gray-900 text-sm leading-tight truncate">{name}</p>
                                              <p className="text-[11px] text-gray-400 mt-0.5">{t.email ?? 'Transport Provider'}</p>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${t.availableTrucks > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.availableTrucks > 0 ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                              {t.availableTrucks} available
                                            </div>
                                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-500">
                                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                                              {t.totalTrucks - t.availableTrucks} on duty
                                            </div>
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <button
                                    onClick={() => handleAssign(order)}
                                    disabled={!selectedTsp}
                                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-sm px-6 py-2.5 rounded-xl transition"
                                  >
                                    Confirm Assignment
                                  </button>
                                </>
                              )}
                            </div>
                          )}

                          {/* Timeline */}
                          <div className="border-t border-gray-100 pt-3">
                            <OrderTimeline order={order} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm font-semibold text-gray-800 truncate">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 truncate">{sub}</p>}
    </div>
  );
}
