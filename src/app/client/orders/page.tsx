'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import { getCurrentUser, getOrders, shortOrderId } from '@/src/lib/demo-data';

const STEPS = [
  { key: 'PLACED',             label: 'Placed'         },
  { key: 'ACCEPTED_BY_SELLER', label: 'Accepted'       },
  { key: 'ASSIGNED_TO_TSP',    label: 'TSP Assigned'   },
  { key: 'ASSIGNED',           label: 'Truck Ready'    },
  { key: 'EN_ROUTE',           label: 'En Route'       },
  { key: 'ARRIVED',            label: 'Arrived'        },
  { key: 'COMPLETED',          label: 'Delivered'      },
];

const STATUS_COLOR: Record<string, string> = {
  PLACED:             'bg-yellow-100 text-yellow-700',
  ACCEPTED_BY_SELLER: 'bg-purple-100 text-purple-700',
  ASSIGNED_TO_TSP:    'bg-yellow-100 text-yellow-700',
  ASSIGNED:           'bg-indigo-100 text-indigo-700',
  EN_ROUTE:           'bg-blue-100 text-blue-700',
  ARRIVED:            'bg-teal-100 text-teal-700',
  COMPLETED:          'bg-emerald-100 text-emerald-700',
  CANCELLED:          'bg-red-100 text-red-700',
};

const STATUS_DESC: Record<string, string> = {
  PLACED:             'Waiting for seller to review your order.',
  ACCEPTED_BY_SELLER: 'Seller accepted — assigning a transport provider.',
  ASSIGNED_TO_TSP:    'Transport provider assigned — selecting a truck.',
  ASSIGNED:           'Truck assigned and ready to depart from depot.',
  EN_ROUTE:           'Your fuel truck is on the way to your location!',
  ARRIVED:            'Truck has arrived. Scan the QR code to accept delivery.',
  COMPLETED:          'Delivery complete. Fuel received successfully.',
  CANCELLED:          'Order was cancelled.',
};

export default function ClientOrdersPage() {
  const router  = useRouter();
  const [user,    setUser]    = useState<any>(null);
  const [orders,  setOrders]  = useState<any[]>([]);
  const [mounted, setMounted] = useState(false);

  const loadOrders = useCallback((u: any) => {
    setOrders(getOrders().filter((o: any) => o.clientId === u.id));
  }, []);

  useEffect(() => {
    setMounted(true);
    const u = getCurrentUser();
    if (!u || u.role !== 'CLIENT') { router.push('/'); return; }
    setUser(u);
    loadOrders(u);
    const iv = setInterval(() => loadOrders(u), 3000);
    return () => clearInterval(iv);
  }, [router, loadOrders]);

  if (!mounted || !user) return null;

  const active = orders.filter(o => !['COMPLETED', 'CANCELLED'].includes(o.status));
  const done   = orders.filter(o => ['COMPLETED', 'CANCELLED'].includes(o.status));

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar userRole={user.role} />

      <div className="flex-1 min-w-0">
        <Header user={user} />

        <main className="p-6 space-y-6">

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-gray-900">My Orders</h1>
              <p className="text-sm text-gray-500 mt-0.5">{user.companyName}</p>
            </div>
            <button
              onClick={() => router.push('/client/orders/new')}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition shadow-sm"
            >
              ➕ New Order
            </button>
          </div>

          {active.length > 0 && (
            <section className="space-y-5">
              {active.map(order => (
                <ActiveOrderCard
                  key={order.id}
                  order={order}
                  onScanQR={() => router.push('/client/delivery/scan-qr')}
                />
              ))}
            </section>
          )}

          {active.length === 0 && (
            <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center">
              <p className="text-4xl mb-3">⛽</p>
              <p className="font-bold text-gray-900 mb-1">No active orders</p>
              <p className="text-sm text-gray-500 mb-5">Place a fuel order and track it here in real-time.</p>
              <button
                onClick={() => router.push('/client/orders/new')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-3 rounded-xl text-sm transition"
              >
                ➕ Place Order
              </button>
            </div>
          )}

          {done.length > 0 && (
            <section>
              <h2 className="font-bold text-gray-500 mb-3 text-xs uppercase tracking-widest">Completed / Cancelled</h2>
              <div className="grid md:grid-cols-2 gap-4">
                {done.map(order => (
                  <div key={order.id} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-bold text-gray-900 text-sm">Order #{shortOrderId(order.id)}</p>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {order.status?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">{order.volume?.toLocaleString()}L {order.fuelType}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{order.destinationName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{new Date(order.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function ActiveOrderCard({ order, onScanQR }: { order: any; onScanQR: () => void }) {
  const stepIdx   = STEPS.findIndex(s => s.key === order.status);
  const isArrived = order.status === 'ARRIVED';
  const isEnRoute = order.status === 'EN_ROUTE';

  return (
    <div className={`bg-white border-2 rounded-2xl p-6 shadow-sm transition-all ${
      isArrived ? 'border-teal-400 shadow-teal-100' :
      isEnRoute ? 'border-blue-300 shadow-blue-100' :
                  'border-gray-200'
    }`}>

      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <p className="font-black text-gray-900">Order #{shortOrderId(order.id)}</p>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {order.status?.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-sm text-gray-500">{order.volume?.toLocaleString()}L {order.fuelType} · {order.destinationName}</p>
        </div>
        <p className="text-xs text-gray-400 flex-shrink-0 ml-4">{new Date(order.createdAt).toLocaleDateString()}</p>
      </div>

      {/* Status message */}
      <div className={`rounded-xl px-4 py-3 mb-5 text-sm font-medium flex items-center gap-2 ${
        isArrived ? 'bg-teal-50 text-teal-800 border border-teal-200' :
        isEnRoute ? 'bg-blue-50 text-blue-800 border border-blue-200 animate-pulse' :
                    'bg-slate-50 text-slate-700 border border-slate-200'
      }`}>
        {isEnRoute && '🚛'}{isArrived && '📍'}
        {STATUS_DESC[order.status] ?? order.status}
      </div>

      {/* Truck & driver info */}
      {order.assignedTruckRegistration && (
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <p className="text-xs text-gray-400 mb-0.5">Truck</p>
            <p className="font-bold text-gray-900 text-sm">{order.assignedTruckRegistration}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <p className="text-xs text-gray-400 mb-0.5">Driver</p>
            <p className="font-bold text-gray-900 text-sm">{order.assignedDriverName ?? '—'}</p>
          </div>
        </div>
      )}

      {/* Progress stepper */}
      <div className="flex items-center overflow-x-auto pb-1 mb-5 gap-0">
        {STEPS.filter(s => s.key !== 'CANCELLED').map((step, i, arr) => {
          const sIdx    = STEPS.findIndex(s2 => s2.key === step.key);
          const done    = sIdx < stepIdx;
          const current = sIdx === stepIdx;
          return (
            <div key={step.key} className="flex items-center flex-shrink-0">
              <div className="flex flex-col items-center" style={{ minWidth: 52 }}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                  done    ? 'bg-emerald-500 text-white' :
                  current ? 'bg-blue-600 text-white ring-4 ring-blue-100' :
                            'bg-gray-100 text-gray-400'
                }`}>
                  {done ? '✓' : i + 1}
                </div>
                <p className={`text-[9px] mt-1 font-medium text-center leading-tight ${
                  current ? 'text-blue-600' : done ? 'text-emerald-600' : 'text-gray-400'
                }`} style={{ maxWidth: 52 }}>
                  {step.label}
                </p>
              </div>
              {i < arr.length - 1 && (
                <div className={`w-5 h-0.5 flex-shrink-0 -mt-4 ${sIdx < stepIdx ? 'bg-emerald-400' : 'bg-gray-200'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* QR CTA */}
      {isArrived && (
        <button
          onClick={onScanQR}
          className="w-full bg-teal-600 hover:bg-teal-700 text-white font-black py-3.5 rounded-xl transition text-sm flex items-center justify-center gap-2 shadow-lg shadow-teal-100"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 3h6v6H3zm2 2v2h2V5zm8-2h6v6h-6zm2 2v2h2V5zM3 13h6v6H3zm2 2v2h2v-2zm11-2h1v1h-1zm-3 0h1v1h-1zm1 1h1v1h-1zm1 1h1v1h-1zm-2 0h1v1h-1zm1 1h1v1h-1zm1 1h1v1h-1zm-3-1h1v1h-1z"/>
          </svg>
          Scan QR Code — Accept Delivery
        </button>
      )}
    </div>
  );
}
