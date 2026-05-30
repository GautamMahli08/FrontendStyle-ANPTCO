'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import {
  getCurrentUser, getOrders, getTrucks, getDrivers,
  updateOrder, updateTruck, updateDriver, addNotification,
  addFuelAnomaly,
} from '@/src/lib/demo-data';
import { logDemoEvent } from '@/src/app/client/dashboard/page';

// Status helpers
const STATUS_LABEL: Record<string, string> = {
  ASSIGNED_TO_TSP: 'Needs Truck',
  ASSIGNED:        'Truck Assigned',
  EN_ROUTE:        'En Route',
  ARRIVED:         'Arrived',
  COMPLETED:       'Delivered',
  CANCELLED:       'Cancelled',
};
const STATUS_COLOR: Record<string, string> = {
  ASSIGNED_TO_TSP: 'bg-yellow-100 text-yellow-700',
  ASSIGNED:        'bg-indigo-100 text-indigo-700',
  EN_ROUTE:        'bg-blue-100 text-blue-700',
  ARRIVED:         'bg-teal-100 text-teal-700',
  COMPLETED:       'bg-emerald-100 text-emerald-700',
  CANCELLED:       'bg-red-100 text-red-700',
};

export default function TransportOrdersPage() {
  const router = useRouter();
  const [user,           setUser]           = useState<any>(null);
  const [orders,         setOrders]         = useState<any[]>([]);
  const [trucks,         setTrucks]         = useState<any[]>([]);
  const [drivers,        setDrivers]        = useState<any[]>([]);
  const [mounted,        setMounted]        = useState(false);
  const [assigning,      setAssigning]      = useState<any>(null);   // order being assigned
  const [selectedTruck,  setSelectedTruck]  = useState('');
  const [journeyLoading, setJourneyLoading] = useState<string | null>(null);

  const loadData = useCallback((u: any) => {
    const allOrders  = getOrders();
    const allTrucks  = getTrucks();
    const allDrivers = getDrivers();
    setOrders(
      allOrders
        .filter((o: any) => o.assignedTSPId === u.id)
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    );
    setTrucks(allTrucks.filter((t: any) => t.tspId === u.id));
    setDrivers(allDrivers.filter((d: any) => d.tspId === u.id));
  }, []);

  useEffect(() => {
    setMounted(true);
    const u = getCurrentUser();
    if (!u || u.role !== 'TRANSPORT_ADMIN') { router.push('/'); return; }
    setUser(u);
    loadData(u);
  }, [router, loadData]);

  if (!mounted || !user) return null;

  // ── Assign truck to order ─────────────────────────────────
  const handleAssignTruck = () => {
    if (!selectedTruck || !assigning) return;
    const truck  = trucks.find((t: any) => t.id === selectedTruck);
    if (!truck) return;
    const driver = drivers.find((d: any) => d.id === truck.assignedDriverId);

    updateOrder(assigning.id, {
      status:                  'ASSIGNED',
      assignedTruckId:         truck.id,
      assignedTruckRegistration: truck.registrationNumber,
      assignedDriverId:        driver?.id   ?? '',
      assignedDriverName:      driver ? `${driver.firstName} ${driver.lastName}` : 'Driver TBD',
      assignedDriverPhone:     driver?.phone ?? '',
    });
    updateTruck(truck.id, { status: 'ASSIGNED' });
    logDemoEvent(user.id, 'TRUCK_ASSIGNED', `orderId=${assigning.id} | truck=${truck.registrationNumber} | driver=${driver?.firstName ?? 'TBD'} | clientId=${assigning.clientId}`);

    addNotification({
      id: `notif-${Date.now()}`, userId: assigning.clientId ?? '',
      type: 'TRUCK_ASSIGNED', title: '🚛 Truck Assigned',
      message: `Truck ${truck.registrationNumber} assigned to your order. Journey starts soon.`,
      read: false, createdAt: new Date(),
    });

    setAssigning(null);
    setSelectedTruck('');
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
        // Notify seller
        addNotification({
          id: `notif-theft-${Date.now()}`, userId: 'seller-001',
          type: 'FUEL_ANOMALY', title: '🚨 Fuel Anomaly Detected',
          message: `Unexpected fuel drop of 320L on truck ${order.assignedTruckRegistration} (C1 Petrol) during Order #${order.id.slice(0, 8)}. Location: Al Khuwair.`,
          read: false, createdAt: new Date(),
        });
      }, 3000);
    }

    setTimeout(() => { setJourneyLoading(null); loadData(user); }, 500);
  };

  // ── Mark truck arrived ────────────────────────────────────
  const handleMarkArrived = (order: any) => {
    updateOrder(order.id, { status: 'ARRIVED', arrivedAt: new Date() });
    updateTruck(order.assignedTruckId, { status: 'ARRIVED' });
    logDemoEvent(user.id, 'TRUCK_ARRIVED', `orderId=${order.id} | clientId=${order.clientId} | truck=${order.assignedTruckRegistration}`);

    addNotification({
      id: `notif-${Date.now()}`, userId: order.clientId ?? '',
      type: 'TRUCK_ARRIVED', title: '📍 Truck Has Arrived!',
      message: `Your fuel truck (${order.assignedTruckRegistration}) has arrived at ${order.destinationName ?? 'your location'}. Please scan the QR code to accept delivery.`,
      read: false, createdAt: new Date(),
    });
    loadData(user);
  };

  // ── Pipeline buckets ──────────────────────────────────────
  const needsTruck  = orders.filter((o: any) => o.status === 'ASSIGNED_TO_TSP');
  const inProgress  = orders.filter((o: any) => ['ASSIGNED', 'EN_ROUTE', 'ARRIVED'].includes(o.status));
  const completed   = orders.filter((o: any) => ['COMPLETED', 'CANCELLED'].includes(o.status));

  const idleTrucks  = trucks.filter((t: any) => ['IDLE', 'ACTIVE'].includes(t.status));

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
              <p className="text-sm text-gray-500 mt-0.5">{user.companyName} · {orders.length} total assigned</p>
            </div>
            <button onClick={() => loadData(user)} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
              Refresh
            </button>
          </div>

          {/* ── NEEDS TRUCK ASSIGNMENT ── */}
          {needsTruck.length > 0 && (
            <section>
              <SectionTitle icon="🟡" label="Needs Truck Assignment" count={needsTruck.length} />
              <div className="grid md:grid-cols-2 gap-4 mt-3">
                {needsTruck.map((order: any) => (
                  <OrderCard key={order.id} order={order}>
                    <button
                      onClick={() => { setAssigning(order); setSelectedTruck(''); }}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl transition text-sm"
                    >
                      🚛 Assign Truck
                    </button>
                  </OrderCard>
                ))}
              </div>
            </section>
          )}

          {/* ── IN PROGRESS ── */}
          {inProgress.length > 0 && (
            <section>
              <SectionTitle icon="🔵" label="Active Deliveries" count={inProgress.length} />
              <div className="space-y-4 mt-3">
                {inProgress.map((order: any) => (
                  <div key={order.id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-bold text-gray-900">Order #{order.id.slice(0, 8)}</p>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {STATUS_LABEL[order.status] ?? order.status}
                          </span>
                          {order.clientId === 'client-002' && order.status === 'EN_ROUTE' && (
                            <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full animate-pulse">
                              🚨 Theft Alert Active
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">{order.volume?.toLocaleString()}L {order.fuelType} → {order.destinationName}</p>
                      </div>
                    </div>

                    {/* Truck + driver */}
                    {order.assignedTruckRegistration && (
                      <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 mb-4 flex items-center gap-3">
                        <span className="text-2xl">🚛</span>
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{order.assignedTruckRegistration}</p>
                          <p className="text-xs text-gray-500">{order.assignedDriverName} · QR: <span className="font-mono text-blue-600">{trucks.find(t => t.id === order.assignedTruckId)?.qrCode ?? '—'}</span></p>
                        </div>
                      </div>
                    )}

                    {/* Journey progress bar */}
                    <JourneyProgress status={order.status} />

                    {/* Action buttons */}
                    <div className="flex gap-3 mt-4">
                      {order.status === 'ASSIGNED' && (
                        <button
                          onClick={() => handleStartJourney(order)}
                          disabled={journeyLoading === order.id}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition text-sm"
                        >
                          {journeyLoading === order.id ? 'Starting…' : '🚦 Start Journey'}
                        </button>
                      )}
                      {order.status === 'EN_ROUTE' && (
                        <button
                          onClick={() => handleMarkArrived(order)}
                          className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2.5 rounded-xl transition text-sm"
                        >
                          📍 Mark as Arrived
                        </button>
                      )}
                      {order.status === 'ARRIVED' && (
                        <div className="flex-1 bg-teal-50 border border-teal-200 rounded-xl py-2.5 text-center text-sm font-semibold text-teal-700">
                          ✅ Truck at destination — awaiting client QR scan
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── COMPLETED ── */}
          {completed.length > 0 && (
            <section>
              <SectionTitle icon="✅" label="Completed" count={completed.length} />
              <div className="grid md:grid-cols-3 gap-4 mt-3">
                {completed.map((order: any) => (
                  <div key={order.id} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-bold text-gray-900 text-sm">#{order.id.slice(0, 8)}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABEL[order.status] ?? order.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{order.volume?.toLocaleString()}L {order.fuelType}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{order.destinationName}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Empty */}
          {orders.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl p-14 text-center">
              <p className="text-4xl mb-3">📭</p>
              <p className="font-semibold text-gray-900 mb-1">No orders assigned yet</p>
              <p className="text-sm text-gray-500">Seller Manager will assign orders to {user.companyName} once accepted.</p>
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

            {/* Order summary */}
            <div className="bg-slate-50 rounded-xl p-4 mb-5 border border-slate-200">
              <p className="text-xs text-gray-500 mb-1">Order #{assigning.id.slice(0, 8)}</p>
              <p className="font-bold text-gray-900">{assigning.volume?.toLocaleString()}L {assigning.fuelType}</p>
              <p className="text-sm text-gray-600 mt-0.5">→ {assigning.destinationName}</p>
              <p className="text-xs text-gray-400 mt-1">{assigning.clientName}</p>
            </div>

            {/* Truck picker */}
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
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
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
                          {driver && <p className="text-xs text-blue-600 mt-0.5">👤 {driver.firstName} {driver.lastName}</p>}
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

function SectionTitle({ icon, label, count }: { icon: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <span>{icon}</span>
      <h2 className="font-bold text-gray-900">{label}</h2>
      <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{count}</span>
    </div>
  );
}

function OrderCard({ order, children }: { order: any; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-bold text-gray-900">Order #{order.id.slice(0, 8)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{order.clientName}</p>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {STATUS_LABEL[order.status] ?? order.status}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
        <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
          <p className="text-xs text-gray-400">Fuel</p>
          <p className="font-semibold text-gray-900">{order.volume?.toLocaleString()}L {order.fuelType}</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
          <p className="text-xs text-gray-400">Destination</p>
          <p className="font-semibold text-gray-900 text-xs truncate">{order.destinationName}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function JourneyProgress({ status }: { status: string }) {
  const steps = [
    { key: 'ASSIGNED',  label: 'Assigned' },
    { key: 'EN_ROUTE',  label: 'En Route' },
    { key: 'ARRIVED',   label: 'Arrived'  },
    { key: 'COMPLETED', label: 'Delivered'},
  ];
  const idx = steps.findIndex(s => s.key === status);
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
