'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import { getCurrentUser, getOrders, getKYCDocuments, getFuelAnomalies, shortOrderId, getProductMode, getModules } from '@/src/lib/demo-data';

const STATUS_COLOR: Record<string, string> = {
  PLACED:             'bg-yellow-100 text-yellow-700',
  ACCEPTED_BY_SELLER: 'bg-purple-100 text-purple-700',
  ASSIGNED_TO_TSP:    'bg-yellow-100 text-yellow-700',
  ASSIGNED:           'bg-indigo-100 text-indigo-700',
  EN_ROUTE:           'bg-blue-100   text-blue-700',
  ARRIVED:            'bg-teal-100   text-teal-700',
  COMPLETED:          'bg-emerald-100 text-emerald-700',
  CANCELLED:          'bg-red-100    text-red-700',
};

export default function SellerDashboard() {
  const router  = useRouter();
  const [user,      setUser]      = useState<any>(null);
  const [orders,    setOrders]    = useState<any[]>([]);
  const [kycDocs,   setKycDocs]   = useState<any[]>([]);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [mounted,   setMounted]   = useState(false);
  const [mode,      setMode]      = useState<'full' | 'monitoring'>('full');

  const load = useCallback((u: any) => {
    setOrders(getOrders().filter((o: any) => o.workspaceId === u.workspaceId));
    setKycDocs(getKYCDocuments());
    setAnomalies(getFuelAnomalies());
  }, []);

  useEffect(() => {
    setMounted(true);
    const u = getCurrentUser();
    if (!u || u.role !== 'SELLER_MANAGER') { router.push('/'); return; }
    setUser(u);
    setMode(getProductMode());
    load(u);
    const iv = setInterval(() => load(u), 3000);
    return () => clearInterval(iv);
  }, [router, load]);

  if (!mounted || !user) return null;

  const modules        = getModules(mode);
  const isMonitoring    = mode === 'monitoring';
  const pending        = orders.filter(o => o.status === 'PLACED');
  const awaitingTSP    = orders.filter(o => o.status === 'ACCEPTED_BY_SELLER');
  const active         = orders.filter(o => ['ASSIGNED_TO_TSP', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED'].includes(o.status));
  const completed      = orders.filter(o => o.status === 'COMPLETED');
  const pendingKYC     = modules.ordering ? kycDocs.filter(k => k.reviewStatus === 'PENDING' && k.sellerCode === user.sellerCode) : [];
  const openAlerts     = anomalies.filter(a => a.status !== 'RESOLVED');
  const manageOrdersHref = isMonitoring ? '/seller/order-history' : '/seller/orders';

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar userRole={user.role} />

      <div className="flex-1 min-w-0">
        <Header user={user} />

        <main className="p-6 space-y-6">

          {/* Page header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">
                {isMonitoring ? 'Monitoring Portal' : 'Seller Portal'} · {user.companyName ?? 'ANPTCO'}
              </p>
              <h1 className="text-2xl font-black text-gray-900">{user.firstName} {user.lastName}</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {isMonitoring ? 'Monitor your fleet and delivery activity in real time' : 'Review orders, manage KYC and monitor your fleet'}
              </p>
            </div>
            <div className="hidden md:flex items-center gap-3">
              <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-center shadow-sm">
                <p className="text-2xl font-black text-gray-900">{active.length}</p>
                <p className="text-xs text-gray-500">Active Deliveries</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-center shadow-sm">
                <p className="text-2xl font-black text-gray-900">{orders.length}</p>
                <p className="text-xs text-gray-500">Total Orders</p>
              </div>
            </div>
          </div>

          {/* Theft alert banner */}
          {openAlerts.length > 0 && (
            <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-5 flex items-start gap-4">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-xl flex-shrink-0">🚨</div>
              <div className="flex-1">
                <p className="font-bold text-red-800 text-lg">{openAlerts.length} Fuel Anomaly Alert{openAlerts.length > 1 ? 's' : ''}</p>
                <p className="text-red-600 text-sm mt-0.5">
                  {openAlerts[0].truckReg} — {openAlerts[0].fuelDropLiters}L unexpected drop on {openAlerts[0].compartment}. {openAlerts[0].location}
                </p>
              </div>
              <button
                onClick={() => router.push('/seller/fleet-monitor')}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-xl text-sm transition flex-shrink-0"
              >
                View Alerts
              </button>
            </div>
          )}

          {/* Pending orders banner — marketplace accept/assign flow only */}
          {modules.ordering && pending.length > 0 && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 flex items-start gap-4">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-xl flex-shrink-0">📦</div>
              <div className="flex-1">
                <p className="font-bold text-amber-800 text-lg">{pending.length} New Order{pending.length > 1 ? 's' : ''} Waiting</p>
                <p className="text-amber-700 text-sm mt-0.5">
                  Review and accept {pending.length === 1 ? 'this order' : 'these orders'} to assign to a transport provider.
                </p>
              </div>
              <button
                onClick={() => router.push('/seller/orders')}
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-4 py-2 rounded-xl text-sm transition flex-shrink-0"
              >
                Review Orders
              </button>
            </div>
          )}

          {/* KPIs — the accept/assign steps only exist in the marketplace flow */}
          <div className={`grid grid-cols-2 ${modules.ordering ? 'lg:grid-cols-4' : ''} gap-4`}>
            {modules.ordering && (
              <>
                <Kpi label="Pending Review"    value={pending.length}     color="amber"   badge={pending.length > 0}     onClick={() => router.push('/seller/orders')} />
                <Kpi label="Awaiting TSP"      value={awaitingTSP.length} color="purple"  badge={awaitingTSP.length > 0} onClick={() => router.push('/seller/orders')} />
              </>
            )}
            <Kpi label="Active Deliveries" value={active.length}      color="blue"    onClick={() => router.push('/seller/fleet-monitor')} />
            <Kpi label="Completed"         value={completed.length}   color="green"   onClick={() => router.push(manageOrdersHref)} />
          </div>

          {/* Two-column: Recent Orders + Quick Actions */}
          <div className="grid lg:grid-cols-3 gap-5">

            {/* Recent Orders — 2/3 */}
            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-900 text-sm">Recent Orders</h2>
                <button onClick={() => router.push(manageOrdersHref)} className="text-xs text-blue-600 hover:text-blue-700 font-semibold transition">
                  {isMonitoring ? 'View History' : 'Manage All'}
                </button>
              </div>
              <div className="divide-y divide-gray-50">
                {orders.slice(0, 7).map(order => (
                  <div key={order.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 text-sm">#{shortOrderId(order.id)}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {order.status?.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {order.clientName} · {order.fuelItems?.length > 1
                          ? order.fuelItems.map((f: any) => `${f.volume.toLocaleString()}L ${f.fuelType}`).join(' + ')
                          : `${order.volume?.toLocaleString()}L ${order.fuelType}`}
                      </p>
                    </div>
                    <p className="text-[11px] text-gray-400 flex-shrink-0">{order.destinationName ?? '—'}</p>
                  </div>
                ))}
                {orders.length === 0 && (
                  <div className="px-5 py-10 text-center">
                    <p className="text-3xl mb-2">📭</p>
                    <p className="text-sm text-gray-400">No orders yet.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Action Queue — 1/3 */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-900 text-sm">Action Required</h2>
                <p className="text-xs text-gray-400 mt-0.5">What needs your attention now</p>
              </div>

              <div className="divide-y divide-gray-50">

                {modules.ordering && (
                  <>
                    {/* Step 1 — Review new orders */}
                    <ActionItem
                      step={1}
                      title={pending.length > 0 ? `${pending.length} order${pending.length > 1 ? 's' : ''} waiting for review` : 'No new orders'}
                      desc="Accept or decline incoming client requests"
                      urgent={pending.length > 0}
                      onClick={() => router.push('/seller/orders')}
                      cta="Review Orders"
                      done={pending.length === 0}
                    />

                    {/* Step 2 — Assign accepted orders to TSP */}
                    <ActionItem
                      step={2}
                      title={awaitingTSP.length > 0 ? `${awaitingTSP.length} order${awaitingTSP.length > 1 ? 's' : ''} need TSP assignment` : 'No orders awaiting TSP'}
                      desc="Assign each accepted order to a transport provider"
                      urgent={awaitingTSP.length > 0}
                      onClick={() => router.push('/seller/orders')}
                      cta="Assign TSP"
                      done={awaitingTSP.length === 0}
                    />
                  </>
                )}

                {/* KYC */}
                {pendingKYC.length > 0 && (
                  <ActionItem
                    step={3}
                    title={`${pendingKYC.length} KYC document${pendingKYC.length > 1 ? 's' : ''} pending`}
                    desc="Review and approve transporter KYC submissions"
                    urgent
                    onClick={() => router.push('/seller/kyc-review')}
                    cta="Review KYC"
                    done={false}
                  />
                )}

                {/* All clear */}
                {(!modules.ordering || (pending.length === 0 && awaitingTSP.length === 0)) && pendingKYC.length === 0 && (
                  <div className="px-5 py-8 text-center">
                    <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-2">
                      <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-gray-700">All caught up</p>
                    <p className="text-xs text-gray-400 mt-0.5">No pending actions right now</p>
                  </div>
                )}
              </div>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}

function Kpi({ label, value, color, onClick, badge }: {
  label: string; value: number; color: string; onClick?: () => void; badge?: boolean;
}) {
  const c: Record<string, { card: string; num: string }> = {
    amber:  { card: 'border-amber-200  bg-amber-50',   num: 'text-amber-700'  },
    purple: { card: 'border-purple-200 bg-purple-50',  num: 'text-purple-700' },
    blue:   { card: 'border-blue-200   bg-blue-50',    num: 'text-blue-700'   },
    green:  { card: 'border-emerald-200 bg-emerald-50', num: 'text-emerald-700'},
  };
  const style = c[color] ?? { card: 'border-gray-200 bg-gray-50', num: 'text-gray-700' };
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-start p-4 rounded-2xl border-2 ${style.card} transition ${onClick ? 'hover:shadow-md cursor-pointer' : 'cursor-default'}`}
    >
      {badge && <span className="absolute top-3 right-3 w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
      <p className={`text-3xl font-black ${style.num}`}>{value}</p>
      <p className="text-xs font-semibold text-gray-500 mt-1 leading-tight">{label}</p>
    </button>
  );
}

function ActionItem({ step, title, desc, urgent, onClick, cta, done }: {
  step: number; title: string; desc: string; urgent: boolean;
  onClick: () => void; cta: string; done: boolean;
}) {
  return (
    <div className={`px-5 py-4 ${urgent ? 'bg-amber-50/50' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0 mt-0.5 ${
          done ? 'bg-emerald-100 text-emerald-600' : urgent ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-400'
        }`}>
          {done ? '✓' : step}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold leading-tight ${urgent ? 'text-gray-900' : 'text-gray-400'}`}>{title}</p>
          <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
          {urgent && (
            <button
              onClick={onClick}
              className="mt-2 text-xs font-bold text-blue-600 hover:text-blue-700 transition"
            >
              {cta}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
