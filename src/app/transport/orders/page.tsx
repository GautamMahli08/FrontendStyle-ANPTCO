'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import {
  getCurrentUser, getOrders, getTrucks, getDrivers,
  updateOrder, updateTruck, addNotification,
  addFuelAnomaly, orderFuelBreakdown, shortOrderId,
  advanceJourneys, advanceLoading,
} from '@/src/lib/demo-data';
import { logDemoEvent } from '@/src/app/client/dashboard/page';
import OrderTimeline from '@/src/components/orders/OrderTimeline';
import CompartmentFuel from '@/src/components/fleet/CompartmentFuel';
import CopyId from '@/src/components/ui/CopyId';

const STATUS_LABEL: Record<string, string> = {
  ASSIGNED_TO_TSP: 'Needs Truck',
  ASSIGNED:        'Truck Assigned',
  LOADING:         'Loading Fuel',
  LOADED:          'Loaded',
  EN_ROUTE:        'En Route',
  ARRIVED:         'Arrived',
  COMPLETED:       'Delivered',
  CANCELLED:       'Cancelled',
};
const STATUS_COLOR: Record<string, string> = {
  ASSIGNED_TO_TSP: 'bg-yellow-100 text-yellow-700',
  ASSIGNED:        'bg-indigo-100 text-indigo-700',
  LOADING:         'bg-cyan-100   text-cyan-700',
  LOADED:          'bg-sky-100    text-sky-700',
  EN_ROUTE:        'bg-blue-100   text-blue-700',
  ARRIVED:         'bg-teal-100   text-teal-700',
  COMPLETED:       'bg-emerald-100 text-emerald-700',
  CANCELLED:       'bg-red-100    text-red-700',
};

function fuelSummary(order: any): string {
  if (order.fuelItems?.length > 1) {
    return order.fuelItems.map((f: any) => `${f.volume.toLocaleString()}L ${f.fuelType}`).join(' + ');
  }
  return `${order.volume?.toLocaleString()}L ${order.fuelType}`;
}

export default function TransportOrdersPage() {
  const router = useRouter();
  const [user,           setUser]           = useState<any>(null);
  const [orders,         setOrders]         = useState<any[]>([]);
  const [trucks,         setTrucks]         = useState<any[]>([]);
  const [drivers,        setDrivers]        = useState<any[]>([]);
  const [mounted,        setMounted]        = useState(false);
  const [detailId,       setDetailId]       = useState<string | null>(null);
  const [assigning,      setAssigning]      = useState<any>(null);   // order being assigned a truck (modal)
  const [selectedTruck,  setSelectedTruck]  = useState('');
  const [journeyLoading, setJourneyLoading] = useState<string | null>(null);

  const loadData = useCallback((u: any) => {
    setOrders(
      getOrders()
        .filter((o: any) => o.assignedTSPId === u.id)
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    );
    setTrucks(getTrucks().filter((t: any) => t.tspId === u.id));
    setDrivers(getDrivers().filter((d: any) => d.tspId === u.id));
  }, []);

  useEffect(() => {
    setMounted(true);
    const u = getCurrentUser();
    if (!u || u.role !== 'TRANSPORT_ADMIN') { router.push('/'); return; }
    setUser(u);
    loadData(u);
    // Keep statuses fresh: finish loading (LOADING→LOADED) and arrive (EN_ROUTE→ARRIVED).
    const iv = setInterval(() => { advanceLoading(); advanceJourneys(); loadData(u); }, 3000);
    return () => clearInterval(iv);
  }, [router, loadData]);

  if (!mounted || !user) return null;

  // ── Assign truck to order ─────────────────────────────────
  const handleAssignTruck = () => {
    if (!selectedTruck || !assigning) return;
    const truck = trucks.find((t: any) => t.id === selectedTruck);
    if (!truck) return;

    // No capacity check needed — every truck is a fixed 4 × 9,100 L layout and
    // orders are capped at 4 compartments, so any truck can carry any order.
    const driver = drivers.find((d: any) => d.id === truck.assignedDriverId);

    updateOrder(assigning.id, {
      status:                    'ASSIGNED',
      assignedTruckId:           truck.id,
      assignedTruckRegistration: truck.registrationNumber,
      assignedDriverId:          driver?.id   ?? '',
      assignedDriverName:        driver ? `${driver.firstName} ${driver.lastName}` : 'Driver TBD',
      assignedDriverPhone:       driver?.phone ?? '',
      truckAssignedAt:           new Date(),
    });
    updateTruck(truck.id, { status: 'ASSIGNED' });
    logDemoEvent(user.id, 'TRUCK_ASSIGNED', `orderId=${assigning.id} | truck=${truck.registrationNumber} | driver=${driver?.firstName ?? 'TBD'} | clientId=${assigning.clientId}`);

    addNotification({
      id: `notif-${Date.now()}`, userId: assigning.clientId ?? '',
      type: 'TRUCK_ASSIGNED', title: '🚛 Truck Assigned',
      message: `Truck ${truck.registrationNumber} assigned to your order. Loading will begin shortly.`,
      read: false, createdAt: new Date(),
    });

    setAssigning(null);
    setSelectedTruck('');
    loadData(user);
  };

  // ── Load fuel (compartments fill at the depot) ───────────
  const handleLoadFuel = (order: any) => {
    updateOrder(order.id, { status: 'LOADING', loadStartedAt: new Date() });
    if (order.assignedTruckId) updateTruck(order.assignedTruckId, { status: 'LOADING' });
    logDemoEvent(user.id, 'FUEL_LOADING', `orderId=${order.id} | truck=${order.assignedTruckRegistration} | ${order.volume?.toLocaleString()}L`);
    addNotification({
      id: `notif-${Date.now()}`, userId: order.clientId ?? '',
      type: 'FUEL_LOADING', title: '🛢️ Loading Fuel',
      message: `Your truck (${order.assignedTruckRegistration}) is being loaded at the ANPTCO depot.`,
      read: false, createdAt: new Date(),
    });
    // Open this order's detail so the TSP can watch the compartments fill live,
    // right here on the orders page (Start journey appears when loading finishes).
    setDetailId(order.id);
    loadData(user);
  };

  // ── Start journey (truck leaves depot) ───────────────────
  const handleStartJourney = (order: any) => {
    setJourneyLoading(order.id);
    updateOrder(order.id, { status: 'EN_ROUTE', tripStartedAt: new Date() });
    updateTruck(order.assignedTruckId, { status: 'EN_ROUTE' });
    logDemoEvent(user.id, 'JOURNEY_STARTED', `orderId=${order.id} | truck=${order.assignedTruckRegistration} | clientId=${order.clientId} | dest=${order.destinationName}`);

    addNotification({
      id: `notif-${Date.now()}`, userId: order.clientId ?? '',
      type: 'TRUCK_EN_ROUTE', title: '🚛 Truck En Route',
      message: `Your fuel truck (${order.assignedTruckRegistration}) has left the depot and is heading to ${order.destinationName ?? 'your location'}.`,
      read: false, createdAt: new Date(),
    });

    // ── Theft simulation for Client 2 ──
    if (order.clientId === 'client-002') {
      setTimeout(() => {
        addFuelAnomaly({
          id:             `anomaly-${Date.now()}`,
          orderId:        order.id,
          truckReg:       order.assignedTruckRegistration ?? 'TRK',
          compartment:    'C1 (Petrol)',
          fuelDropLiters: 320,
          location:       'Al Khuwair — off-route stop, 18 min',
          detectedAt:     new Date(),
          severity:       'HIGH',
          status:         'OPEN',
        });
        addNotification({
          id: `notif-theft-${Date.now()}`, userId: 'seller-001',
          type: 'FUEL_ANOMALY', title: '🚨 Fuel Anomaly Detected',
          message: `Unexpected fuel drop of 320L on truck ${order.assignedTruckRegistration} (C1 Petrol) during Order #${shortOrderId(order.id)}. Location: Al Khuwair.`,
          read: false, createdAt: new Date(),
        });
      }, 3000);
    }

    // Hand off to the Fleet Monitor focused on this order so the TSP can watch
    // the truck drive to the station live.
    setTimeout(() => {
      setJourneyLoading(null);
      router.push(`/transport/fleet-monitor?order=${order.id}`);
    }, 500);
  };

  const idleTrucks = trucks.filter((t: any) => ['IDLE', 'ACTIVE'].includes(t.status));

  const needsTruck = orders.filter((o: any) => o.status === 'ASSIGNED_TO_TSP').length;
  const active     = orders.filter((o: any) => ['ASSIGNED', 'LOADING', 'LOADED', 'EN_ROUTE', 'ARRIVED'].includes(o.status)).length;
  const completed  = orders.filter((o: any) => o.status === 'COMPLETED').length;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar userRole={user.role} />

      <div className="flex-1 min-w-0">
        <Header user={user} />

        <main className="p-6 space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-gray-900">Orders</h1>
              <p className="text-sm text-gray-500 mt-0.5">{user.companyName} · open an order to act on it or track its truck</p>
            </div>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Total',      value: orders.length, color: 'text-slate-700',   bg: 'bg-slate-50',   border: 'border-slate-200' },
              { label: 'Needs Truck',value: needsTruck,    color: 'text-yellow-600',  bg: 'bg-yellow-50',  border: 'border-yellow-200' },
              { label: 'In Progress',value: active,        color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-200'   },
              { label: 'Completed',  value: completed,     color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200'},
            ].map(k => (
              <div key={k.label} className={`${k.bg} border ${k.border} rounded-2xl px-4 py-3 text-center`}>
                <p className={`text-2xl font-black ${k.color}`}>{k.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>

          {/* Orders list */}
          {orders.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-14 text-center">
              <p className="text-4xl mb-3">📭</p>
              <p className="font-semibold text-gray-900 mb-1">No orders assigned yet</p>
              <p className="text-sm text-gray-500">Seller Manager will assign orders to {user.companyName} once accepted.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="grid grid-cols-[0.9fr_1.4fr_1fr_0.8fr_minmax(180px,auto)] gap-4 px-5 py-3 border-b border-gray-100 bg-slate-50">
                {['Order', 'Fuel', 'Destination', 'Status', 'Action'].map((h, i) => (
                  <p key={i} className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{h}</p>
                ))}
              </div>

              <div className="divide-y divide-gray-50">
                {orders.map(order => {
                  const isOpen = detailId === order.id;
                  const truck  = trucks.find(t => t.id === order.assignedTruckId);
                  const theft  = order.clientId === 'client-002' && order.status === 'EN_ROUTE';
                  return (
                    <div key={order.id}>
                      {/* Summary row */}
                      <div
                        onClick={() => setDetailId(isOpen ? null : order.id)}
                        className={`grid grid-cols-[0.9fr_1.4fr_1fr_0.8fr_minmax(180px,auto)] gap-4 px-5 py-4 items-center cursor-pointer transition hover:bg-slate-50/60 ${
                          order.status === 'ASSIGNED_TO_TSP' ? 'bg-yellow-50/30' : ''
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <CopyId value={shortOrderId(order.id)} label={`#${shortOrderId(order.id)}`} className="font-bold text-gray-900 text-sm" />
                            {theft && <span className="text-[10px] font-black text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full animate-pulse">🚨</span>}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{order.clientName}</p>
                        </div>
                        <p className="text-sm font-semibold text-gray-800">{fuelSummary(order)}</p>
                        <p className="text-sm text-gray-600 truncate">{order.destinationName ?? '—'}</p>
                        <span className={`inline-block text-[11px] font-bold px-2.5 py-1 rounded-full w-fit ${STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {STATUS_LABEL[order.status] ?? order.status}
                        </span>

                        {/* Action — the next step for this order */}
                        <div className="flex items-center justify-between gap-2" onClick={e => e.stopPropagation()}>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {order.status === 'ASSIGNED_TO_TSP' && (
                              <button
                                onClick={() => { setAssigning(order); setSelectedTruck(''); }}
                                className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition"
                              >
                                Assign truck
                              </button>
                            )}
                            {order.status === 'ASSIGNED' && (
                              <button
                                onClick={() => handleLoadFuel(order)}
                                className="text-xs font-bold text-white bg-cyan-600 hover:bg-cyan-700 px-3 py-1.5 rounded-lg transition"
                              >
                                Load fuel
                              </button>
                            )}
                            {order.status === 'LOADING' && (
                              <span className="text-xs font-semibold text-cyan-700 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-pulse" /> Loading…
                              </span>
                            )}
                            {order.status === 'LOADED' && (
                              <button
                                onClick={() => handleStartJourney(order)}
                                disabled={journeyLoading === order.id}
                                className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-3 py-1.5 rounded-lg transition"
                              >
                                {journeyLoading === order.id ? 'Starting…' : 'Start journey'}
                              </button>
                            )}
                            {['EN_ROUTE', 'ARRIVED', 'COMPLETED'].includes(order.status) && (
                              <button
                                onClick={() => router.push(`/transport/fleet-monitor?order=${order.id}`)}
                                className="text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition"
                              >
                                {order.status === 'COMPLETED' ? 'View' : 'Track'}
                              </button>
                            )}
                            {order.status === 'CANCELLED' && <span className="text-xs text-gray-400">—</span>}
                          </div>
                          <svg
                            onClick={() => setDetailId(isOpen ? null : order.id)}
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
                              label="Truck"
                              value={order.assignedTruckRegistration ?? 'Not assigned'}
                              sub={order.assignedDriverName ? `${order.assignedDriverName}${truck?.qrCode ? ` · ${truck.qrCode}` : ''}` : undefined}
                            />
                          </div>

                          {/* Progress (once a truck is on the job) */}
                          {['ASSIGNED', 'LOADING', 'LOADED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED'].includes(order.status) && (
                            <JourneyProgress status={order.status} />
                          )}

                          {/* Live compartment fuel — fills as the truck loads at the depot */}
                          {['LOADING', 'LOADED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED'].includes(order.status) && (
                            <div className="bg-white border border-gray-200 rounded-xl p-4">
                              <CompartmentFuel order={order} />
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

      {/* ── ASSIGN TRUCK MODAL ── */}
      {assigning && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-black text-gray-900">Assign Truck</h3>
              <button onClick={() => setAssigning(null)} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">✕</button>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 mb-5 border border-slate-200">
              <p className="text-xs text-gray-500 mb-1">Order #{shortOrderId(assigning.id)}</p>
              <p className="font-bold text-gray-900">{fuelSummary(assigning)}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {orderFuelBreakdown(assigning).map(f => (
                  <span key={f.fuelType} className="text-[11px] font-semibold bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-full">
                    {Math.round(f.volume / 9100)} × {f.fuelType}
                  </span>
                ))}
              </div>
              <p className="text-sm text-gray-600 mt-2">→ {assigning.destinationName}</p>
              <p className="text-xs text-gray-400 mt-1">{assigning.clientName}</p>
            </div>

            {idleTrucks.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-3xl mb-2">🚛</p>
                <p className="text-sm font-semibold text-gray-700">No idle trucks available</p>
                <p className="text-xs text-gray-400 mt-1">All trucks are currently assigned or pending integration.</p>
              </div>
            ) : (
              <div className="space-y-2 mb-5">
                <p className="text-sm font-semibold text-gray-700 mb-2">Select truck ({idleTrucks.length} available):</p>
                {idleTrucks.map((truck: any) => {
                  const driver = drivers.find((d: any) => d.id === truck.assignedDriverId);
                  const isSelected = selectedTruck === truck.id;
                  return (
                    <button
                      key={truck.id}
                      onClick={() => setSelectedTruck(truck.id)}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                        isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-gray-900">{truck.registrationNumber}</p>
                            <span className="text-xs text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">IDLE</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {truck.compartments?.length} compartments · {truck.capacity?.toLocaleString()}L capacity
                          </p>
                          {driver && <p className="text-xs text-blue-600 mt-1">{driver.firstName} {driver.lastName}</p>}
                        </div>
                        {isSelected && <span className="text-blue-600 font-bold text-lg">✓</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setAssigning(null)} className="flex-1 border border-gray-200 text-gray-700 font-medium py-2.5 rounded-xl hover:bg-gray-50 transition text-sm">
                Cancel
              </button>
              <button
                onClick={handleAssignTruck}
                disabled={!selectedTruck}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-2.5 rounded-xl transition text-sm"
              >
                Confirm Assignment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm font-semibold text-gray-800 truncate">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 truncate">{sub}</p>}
    </div>
  );
}

function JourneyProgress({ status }: { status: string }) {
  const steps = [
    { key: 'ASSIGNED',  label: 'Assigned' },
    { key: 'LOADED',    label: 'Loaded'   },
    { key: 'EN_ROUTE',  label: 'En Route' },
    { key: 'ARRIVED',   label: 'Arrived'  },
    { key: 'COMPLETED', label: 'Delivered'},
  ];
  const effective = status === 'LOADING' ? 'ASSIGNED' : status;
  const idx = steps.findIndex(s => s.key === effective);
  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => {
        const done    = i < idx;
        const current = i === idx;
        return (
          <div key={step.key} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                done    ? 'bg-emerald-500 text-white' :
                current ? 'bg-blue-600 text-white ring-4 ring-blue-100' :
                          'bg-gray-200 text-gray-400'
              }`}>
                {done ? '✓' : i + 1}
              </div>
              <p className={`text-[10px] mt-1 font-medium ${current ? 'text-blue-600' : done ? 'text-emerald-600' : 'text-gray-400'}`}>
                {step.label}
              </p>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 mb-3.5 ${i < idx ? 'bg-emerald-400' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
