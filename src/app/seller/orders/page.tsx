'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import {
  getCurrentUser, getUsers, getOrders, getTrucks,
  getSellerConnections, updateOrder, addNotification,
  assignTransporterAndDispatch,
} from '@/src/lib/demo-data';
import { logDemoEvent } from '@/src/app/client/dashboard/page';

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
  // which order has the inline TSP picker open
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [selectedTsp, setSelectedTsp] = useState<string>('');
  // per-order loading state: orderId → true
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
    const iv = setInterval(() => load(u), 3000);
    return () => clearInterval(iv);
  }, [router, load]);

  if (!mounted || !user) return null;

  // ── Accept ────────────────────────────────────────────────────
  function handleAccept(orderId: string) {
    setAccepting(prev => ({ ...prev, [orderId]: true }));
    setTimeout(() => {
      updateOrder(orderId, { status: 'ACCEPTED_BY_SELLER', workspaceId: user.workspaceId });
      logDemoEvent('seller-001', 'ORDER_ACCEPTED', `orderId=${orderId}`);
      const order = orders.find(o => o.id === orderId);
      if (order?.clientId) {
        addNotification({
          id: `notif-${Date.now()}`, userId: order.clientId,
          type: 'ORDER_ACCEPTED', title: '✅ Order Accepted',
          message: `Your order #${orderId.slice(0, 8)} has been accepted.`,
          read: false, createdAt: new Date(),
        });
      }
      setAccepting(prev => ({ ...prev, [orderId]: false }));
      load(user);
    }, 600);
  }

  // ── Decline ───────────────────────────────────────────────────
  function handleDecline(orderId: string) {
    updateOrder(orderId, { status: 'CANCELLED' });
    const order = orders.find(o => o.id === orderId);
    if (order?.clientId) {
      addNotification({
        id: `notif-${Date.now()}`, userId: order.clientId,
        type: 'ORDER_REJECTED', title: 'Order Declined',
        message: `Your order #${orderId.slice(0, 8)} was declined.`,
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

    // Assigning the transporter dispatches a truck — it leaves the depot immediately.
    const { dispatched } = assignTransporterAndDispatch(order.id, tsp.id);
    const tspName = tsp.companyName ?? tsp.firstName;
    logDemoEvent('seller-001', dispatched ? 'JOURNEY_STARTED' : 'ASSIGNED_TO_TSP', `orderId=${order.id} | tsp=${tspName}`);

    addNotification({
      id: `notif-${Date.now()}`, userId: tsp.id,
      type: 'ORDER_ASSIGNED_TO_TSP', title: '📦 New Order Assigned',
      message: dispatched
        ? `Order #${order.id.slice(0, 8)} — ${fuelSummary(order)} → ${order.destinationName}. Truck dispatched.`
        : `Order #${order.id.slice(0, 8)} — ${fuelSummary(order)} → ${order.destinationName}. Assign a truck.`,
      read: false, createdAt: new Date(),
    });
    if (order.clientId) {
      addNotification({
        id: `notif-${Date.now()}-c`, userId: order.clientId,
        type: 'ORDER_PROGRESS', title: dispatched ? '🚛 Truck En Route' : '🚛 Transport Assigned',
        message: dispatched
          ? `${tspName} dispatched a truck to ${order.destinationName}. Track it live.`
          : `Your order has been assigned to ${tspName}.`,
        read: false, createdAt: new Date(),
      });
    }

    setAssigningId(null);
    setSelectedTsp('');
    load(user);
  }

  // ── Derived lists ────────────────────────────────────────────
  const pending   = orders.filter(o => o.status === 'PLACED');
  const accepted  = orders.filter(o => o.status === 'ACCEPTED_BY_SELLER');
  const withTsp   = orders.filter(o => o.status === 'ASSIGNED_TO_TSP');
  const active    = orders.filter(o => ['ASSIGNED', 'EN_ROUTE', 'ARRIVED'].includes(o.status));
  const done      = orders.filter(o => o.status === 'COMPLETED');

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
              <p className="text-sm text-gray-500 mt-0.5">Review incoming requests and assign transport</p>
            </div>
            <div className="flex items-center gap-3">
              {pending.length > 0 && (
                <span className="bg-yellow-100 text-yellow-700 text-xs font-bold px-3 py-1.5 rounded-full border border-yellow-200">
                  {pending.length} pending review
                </span>
              )}
            </div>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: 'Pending',   value: pending.length,  color: 'text-yellow-600',  bg: 'bg-yellow-50',  border: 'border-yellow-200' },
              { label: 'Accepted',  value: accepted.length, color: 'text-purple-600',  bg: 'bg-purple-50',  border: 'border-purple-200' },
              { label: 'With TSP',  value: withTsp.length,  color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200'  },
              { label: 'In Transit',value: active.length,   color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-200'   },
              { label: 'Completed', value: done.length,     color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200'},
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
              {/* Table header */}
              <div className="grid grid-cols-[1fr_1.6fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-gray-100 bg-slate-50">
                {['Order', 'Fuel', 'Destination', 'Status', 'Action'].map(h => (
                  <p key={h} className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{h}</p>
                ))}
              </div>

              <div className="divide-y divide-gray-50">
                {orders.map(order => {
                  const isAssigning = assigningId === order.id;
                  const isAccepting = accepting[order.id];
                  const tsp = tsps.find(t => t.id === order.assignedTSPId);

                  return (
                    <div key={order.id}>
                      {/* Main row */}
                      <div className={`grid grid-cols-[1fr_1.6fr_1fr_1fr_auto] gap-4 px-5 py-4 items-center transition hover:bg-slate-50/60 ${
                        order.status === 'PLACED' ? 'bg-yellow-50/30' : ''
                      }`}>
                        {/* Order */}
                        <div>
                          <p className="font-bold text-gray-900 text-sm">#{order.id.slice(0, 8)}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{order.clientName}</p>
                          <p className="text-[10px] text-gray-300 mt-0.5">
                            {new Date(order.createdAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                          </p>
                        </div>

                        {/* Fuel */}
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{fuelSummary(order)}</p>
                          {order.fuelItems?.length > 1 && (
                            <p className="text-[11px] text-gray-400 mt-0.5">{order.fuelItems.length} fuel types · {order.volume?.toLocaleString()}L total</p>
                          )}
                        </div>

                        {/* Destination */}
                        <p className="text-sm text-gray-600 truncate">{order.destinationName ?? '—'}</p>

                        {/* Status */}
                        <span className={`inline-block text-[11px] font-bold px-2.5 py-1 rounded-full w-fit ${STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {order.status.replace(/_/g, ' ')}
                        </span>

                        {/* Action */}
                        <div className="flex items-center gap-2 justify-end min-w-[140px]">
                          {order.status === 'PLACED' && (
                            <>
                              <button
                                onClick={() => handleAccept(order.id)}
                                disabled={isAccepting}
                                className="text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg transition disabled:opacity-50 flex items-center gap-1"
                              >
                                {isAccepting ? (
                                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                ) : '✓'} Accept
                              </button>
                              <button
                                onClick={() => handleDecline(order.id)}
                                className="text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-lg transition"
                              >
                                Decline
                              </button>
                            </>
                          )}

                          {order.status === 'ACCEPTED_BY_SELLER' && (
                            <button
                              onClick={() => { setAssigningId(isAssigning ? null : order.id); setSelectedTsp(''); }}
                              className="text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition"
                            >
                              {isAssigning ? 'Cancel ✕' : 'Assign TSP →'}
                            </button>
                          )}

                          {order.status === 'ASSIGNED_TO_TSP' && (
                            <span className="text-xs text-gray-500 font-medium">
                              {tsp?.companyName ?? tsp?.firstName ?? '—'}
                            </span>
                          )}

                          {['ASSIGNED', 'EN_ROUTE', 'ARRIVED'].includes(order.status) && (
                            <button
                              onClick={() => router.push('/seller/fleet-monitor')}
                              className="text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition flex items-center gap-1"
                            >
                              📍 Track {order.assignedTruckRegistration ?? ''}
                            </button>
                          )}

                          {order.status === 'COMPLETED' && (
                            <span className="text-xs text-emerald-600 font-semibold">Done</span>
                          )}
                        </div>
                      </div>

                      {/* Inline TSP picker */}
                      {isAssigning && (
                        <div className="border-t border-blue-100 bg-slate-50">
                          {/* Header */}
                          <div className="px-5 pt-4 pb-3 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-bold text-gray-800">Assign Transport Provider</p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {fuelSummary(order)} → {order.destinationName}
                              </p>
                            </div>
                            <button
                              onClick={() => { setAssigningId(null); setSelectedTsp(''); }}
                              className="text-gray-400 hover:text-gray-600 transition"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>

                          {tsps.length === 0 ? (
                            <div className="px-5 pb-4 text-sm text-gray-400">
                              No approved transport providers linked. Go to Transporters to add one.
                            </div>
                          ) : (
                            <div className="px-5 pb-4">
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
                                        isSelected
                                          ? 'border-blue-500 bg-white shadow-md shadow-blue-100'
                                          : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm'
                                      }`}
                                    >
                                      {/* Selected checkmark */}
                                      {isSelected && (
                                        <div className="absolute top-3 right-3 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                          </svg>
                                        </div>
                                      )}

                                      {/* Avatar + name */}
                                      <div className="flex items-center gap-3 mb-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black flex-shrink-0 ${
                                          isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                                        }`}>
                                          {initial}
                                        </div>
                                        <div className="min-w-0">
                                          <p className="font-bold text-gray-900 text-sm leading-tight truncate">{name}</p>
                                          <p className="text-[11px] text-gray-400 mt-0.5">{t.email ?? 'Transport Provider'}</p>
                                        </div>
                                      </div>

                                      {/* Truck stats */}
                                      <div className="flex items-center gap-2 mt-1">
                                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                                          t.availableTrucks > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                                        }`}>
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
                                Confirm Assignment →
                              </button>
                            </div>
                          )}
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
