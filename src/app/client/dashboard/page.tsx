'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import { getCurrentUser, getOrders } from '@/src/lib/demo-data';

export default function ClientDashboard() {
  const router  = useRouter();
  const [user,    setUser]    = useState<any>(null);
  const [orders,  setOrders]  = useState<any[]>([]);
  const [mounted, setMounted] = useState(false);

  const loadOrders = useCallback((u: any) => {
    const all = getOrders();
    setOrders(all.filter((o: any) => o.clientId === u.id));
  }, []);

  useEffect(() => {
    setMounted(true);
    const u = getCurrentUser();
    if (!u || u.role !== 'CLIENT') { router.push('/'); return; }
    setUser(u);
    loadOrders(u);
    const iv = setInterval(() => loadOrders(u), 4000);
    return () => clearInterval(iv);
  }, [router, loadOrders]);

  if (!mounted || !user) return null;

  const activeOrders    = orders.filter(o => !['COMPLETED', 'CANCELLED'].includes(o.status));
  const inTransitOrders = orders.filter(o => ['EN_ROUTE', 'ARRIVED'].includes(o.status));
  const completedOrders = orders.filter(o => o.status === 'COMPLETED');

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar userRole={user.role} />

      <div className="flex-1 min-w-0">
        <Header user={user} />

        <main className="p-6 space-y-6">

          {/* Hero */}
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-800 rounded-2xl p-6 text-white flex items-center justify-between">
            <div>
              <p className="text-emerald-200 text-sm font-medium mb-1">{user.companyName || 'Client'}</p>
              <h1 className="text-2xl font-black">Fuel Order Dashboard</h1>
              <p className="text-emerald-200 text-sm mt-1">{user.firstName} {user.lastName} · Place orders & track deliveries</p>
            </div>
            <button
              onClick={() => router.push('/client/orders/new')}
              className="hidden md:flex items-center gap-2 bg-white/20 hover:bg-white/30 border border-white/30 text-white font-semibold px-5 py-2.5 rounded-xl transition text-sm"
            >
              ➕ New Order
            </button>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Total Orders"  value={orders.length}         icon="📦" color="slate"  />
            <KpiCard label="Active"        value={activeOrders.length}   icon="🔄" color="blue"   />
            <KpiCard label="In Transit"    value={inTransitOrders.length} icon="🚛" color="orange" />
            <KpiCard label="Completed"     value={completedOrders.length} icon="✅" color="green"  />
          </div>

          {/* In-transit truck alert */}
          {inTransitOrders.length > 0 && (
            <div className="bg-blue-50 border border-blue-300 rounded-2xl p-5 flex items-start gap-4">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-xl flex-shrink-0">🚛</div>
              <div className="flex-1">
                <h3 className="font-bold text-blue-800">Truck En Route!</h3>
                <p className="text-blue-700 text-sm mt-0.5 mb-3">
                  {inTransitOrders.length} delivery truck{inTransitOrders.length > 1 ? 's are' : ' is'} heading to your location.
                  Prepare for QR scan acceptance.
                </p>
                <button
                  onClick={() => router.push('/client/orders')}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
                >
                  Track Delivery →
                </button>
              </div>
            </div>
          )}

          {/* Active Orders */}
          {activeOrders.length > 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-900">Active Orders</h2>
                <button onClick={() => router.push('/client/orders')} className="text-blue-600 text-sm font-medium hover:text-blue-700">
                  All Orders →
                </button>
              </div>
              <div className="divide-y divide-gray-50">
                {activeOrders.map(order => (
                  <div key={order.id} className="px-6 py-4 hover:bg-slate-50 transition">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1.5">
                          <p className="font-bold text-gray-900 text-sm">Order #{order.id.slice(0, 8)}</p>
                          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${orderStatusColor(order.status)}`}>
                            {order.status?.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>⛽ {order.volume?.toLocaleString()}L {order.fuelType}</span>
                          <span>📍 {order.destinationName || 'Delivery location'}</span>
                        </div>
                        {order.assignedDriverName && (
                          <div className="mt-2 bg-blue-50 rounded-lg px-3 py-2 border border-blue-100 inline-flex items-center gap-2">
                            <span className="text-blue-600 text-xs font-medium">Driver: {order.assignedDriverName}</span>
                            {order.assignedTruckRegistration && (
                              <span className="text-blue-400 text-xs">· {order.assignedTruckRegistration}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 flex flex-col gap-2 items-end">
                        {order.status === 'ARRIVED' && (
                          <button
                            onClick={() => router.push('/client/delivery/scan-qr')}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
                          >
                            📱 Scan QR
                          </button>
                        )}
                        <button
                          onClick={() => router.push('/client/orders')}
                          className="text-blue-600 hover:text-blue-700 text-xs font-medium"
                        >
                          View →
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center">
              <p className="text-5xl mb-3">⛽</p>
              <h3 className="text-xl font-bold text-gray-900 mb-2">No Active Orders</h3>
              <p className="text-gray-500 text-sm mb-6 max-w-sm mx-auto">
                Place a fuel order and track it in real-time from depot to delivery.
              </p>
              <button
                onClick={() => router.push('/client/orders/new')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-3 rounded-xl transition shadow-lg"
              >
                ➕ Place New Order
              </button>
            </div>
          )}

          {/* Quick Actions */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: '➕', label: 'Place Order',       desc: 'Request fuel delivery',             path: '/client/orders/new',       color: 'emerald' },
              { icon: '📦', label: 'My Orders',         desc: `${orders.length} total orders`,     path: '/client/orders',           color: 'blue' },
              { icon: '🛢️', label: 'Fuel Tanks',        desc: 'Monitor tank levels',               path: '/client/tanks',            color: 'orange' },
              { icon: '📊', label: 'Reports',           desc: 'Delivery analytics',                path: '/client/reports',          color: 'purple' },
            ].map(item => (
              <button
                key={item.path}
                onClick={() => router.push(item.path)}
                className="bg-white border border-gray-200 hover:border-gray-300 rounded-2xl p-5 text-left transition hover:shadow-md group"
              >
                <span className="text-3xl block mb-3">{item.icon}</span>
                <p className="font-bold text-gray-900 text-sm mb-0.5 group-hover:text-blue-700 transition">{item.label}</p>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </button>
            ))}
          </div>

          {/* Order history */}
          {completedOrders.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-900">Completed Orders</h2>
                <button onClick={() => router.push('/client/orders')} className="text-blue-600 text-sm font-medium">
                  All →
                </button>
              </div>
              <div className="divide-y divide-gray-50">
                {completedOrders.slice(0, 5).map(order => (
                  <div key={order.id} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition">
                    <div>
                      <p className="font-semibold text-sm text-gray-900">Order #{order.id.slice(0, 8)}</p>
                      <p className="text-xs text-gray-500">{order.volume?.toLocaleString()}L {order.fuelType} · {order.destinationName}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">COMPLETED</span>
                      <p className="text-xs text-gray-400 mt-0.5">{new Date(order.createdAt).toLocaleDateString()}</p>
                    </div>
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

function KpiCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  const colors: Record<string, string> = {
    slate:  'bg-slate-50  border-slate-200',
    blue:   'bg-blue-50   border-blue-200',
    orange: 'bg-orange-50 border-orange-200',
    green:  'bg-emerald-50 border-emerald-200',
  };
  return (
    <div className={`flex flex-col items-center justify-center p-5 rounded-2xl border-2 ${colors[color] || 'bg-gray-50 border-gray-200'}`}>
      <span className="text-2xl mb-1">{icon}</span>
      <p className="text-3xl font-black text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 text-center mt-0.5">{label}</p>
    </div>
  );
}

function orderStatusColor(s: string) {
  const m: Record<string, string> = {
    PLACED:           'bg-yellow-100 text-yellow-700',
    ACCEPTED:         'bg-blue-100 text-blue-700',
    TRUCKS_ASSIGNED:  'bg-indigo-100 text-indigo-700',
    EN_ROUTE:         'bg-cyan-100 text-cyan-700',
    ARRIVED:          'bg-teal-100 text-teal-700',
    COMPLETED:        'bg-emerald-100 text-emerald-700',
    CANCELLED:        'bg-red-100 text-red-700',
  };
  return m[s] || 'bg-gray-100 text-gray-600';
}
