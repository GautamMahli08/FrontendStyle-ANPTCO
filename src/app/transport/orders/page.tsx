// src/app/transport/orders/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import StatusBadge from '@/src/components/workflow/StatusBadge';
import {
  getCurrentUser,
  setCurrentUser,
  getUsers,
  getOrders,
  getTrucks,
  getDrivers,
  updateOrder,
  updateTruck,
  updateDriver,
  addNotification,
} from '@/src/lib/demo-data';

export default function TransportOrdersPage() {
  const router = useRouter();
  const [user, setUser]               = useState<any>(null);
  const [mounted, setMounted]         = useState(false);
  const [orders, setOrders]           = useState<any[]>([]);
  const [drivers, setDrivers]         = useState<any[]>([]);
  const [trucks, setTrucks]           = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder]     = useState<any>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState('');

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();

    if (!currentUser) { router.push('/'); return; }
    if (currentUser.role !== 'TRANSPORT_ADMIN') { router.push('/'); return; }

    setUser(currentUser);
    loadData(currentUser);
  }, []);

  // ── Data loader ───────────────────────────────────────────────
  const loadData = (currentUser: any) => {
    const allOrders  = getOrders();
    const allDrivers = getDrivers();
    const allTrucks  = getTrucks();

    // Orders assigned to this TSP — rehydrate dates
    const tspOrders = allOrders
      .filter((o) => o.assignedTSPId === currentUser.id)
      .map((o) => ({ ...o, createdAt: new Date(o.createdAt) }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    setOrders(tspOrders);
    setDrivers(allDrivers.filter((d) => d.tspId === currentUser.id));
    setTrucks(allTrucks.filter((t) => t.tspId === currentUser.id));
  };

  // ── Destination helper (handles both field names) ─────────────
  const getDestination = (order: any) =>
    order.destinationName ?? order.destination ?? '—';

  // ── Role switcher ─────────────────────────────────────────────
  const handleRoleChange = (userId: string) => {
    const users   = getUsers();
    const newUser = users.find((u) => u.id === userId);
    if (newUser) {
      setUser(newUser);
      setCurrentUser(newUser);
      const routes: Record<string, string> = {
        PLATFORM_ADMIN:  '/platform-admin/dashboard',
        SELLER_MANAGER:  '/seller/dashboard',
        TRANSPORT_ADMIN: '/transport/dashboard',
        CLIENT:          '/client/dashboard',
        DRIVER:          '/driver/dashboard',
      };
      router.push(routes[newUser.role]);
    }
  };

  // ── Assign driver ─────────────────────────────────────────────
  const handleAssignDriver = () => {
    if (!selectedDriverId || !selectedOrder) {
      alert('❌ Please select a driver');
      return;
    }

    const driver = drivers.find((d) => d.id === selectedDriverId);
    if (!driver) { alert('❌ Driver not found'); return; }

    if (!driver.assignedTruckId) {
      alert('❌ Selected driver has no assigned truck. Go to Drivers page and assign a truck first.');
      return;
    }

    const truck =
trucks.find(
(t) =>
t.id ===
driver.assignedTruckId
);

if (!truck) {

alert(
'❌ Truck not found'
);

return;

}

if (
!truck.sensorConfigured
) {

alert(

'❌ Truck sensor integration is not active.\n\nComplete:\nSeller Approval → Admin Activation'

);

return;

}

    const destination = getDestination(selectedOrder);

    // Update order
    updateOrder(selectedOrder.id, {
      status:                    'ASSIGNED',
      assignedDriverId:          driver.id,
      assignedDriverName:        `${driver.firstName} ${driver.lastName}`,
      assignedDriverPhone:       driver.phone,
      assignedTruckId:           truck.id,
      assignedTruckRegistration: truck.registrationNumber,
      assignedAt:                new Date(),
    });

    // Update truck + driver status
    updateTruck(truck.id, { status: 'ASSIGNED' });
    updateDriver?.(driver.id, { currentStatus: 'ON_TRIP' });

    // Notify driver
    addNotification({
      id:        `notif-${Date.now()}`,
      userId:    driver.id,
      type:      'TRIP_ASSIGNED',
      title:     '🚛 New Trip Assigned',
      message:   `Deliver ${selectedOrder.volume}L ${selectedOrder.fuelType} to ${destination}`,
      read:      false,
      createdAt: new Date(),
    });

    // Notify seller
    const seller = getUsers().find(
      (u) => u.role === 'SELLER_MANAGER' && u.workspaceId === user.workspaceId
    );
    if (seller) {
      addNotification({
        id:        `notif-${Date.now()}-seller`,
        userId:    seller.id,
        type:      'DRIVER_ASSIGNED',
        title:     '✓ Driver Assigned',
        message:   `Driver ${driver.firstName} ${driver.lastName} assigned to order #${selectedOrder.id.slice(0, 8)}`,
        read:      false,
        createdAt: new Date(),
      });
    }

    // Notify client
    if (selectedOrder.clientId) {
      addNotification({
        id:        `notif-${Date.now()}-client`,
        userId:    selectedOrder.clientId,
        type:      'DRIVER_ASSIGNED',
        title:     '🚛 Driver Assigned',
        message:   `Driver ${driver.firstName} ${driver.lastName} (${truck.registrationNumber}) will deliver your order`,
        read:      false,
        createdAt: new Date(),
      });
    }

    alert(`✅ Driver ${driver.firstName} ${driver.lastName} assigned!`);
    loadData(user);
    setShowAssignModal(false);
    setSelectedOrder(null);
    setSelectedDriverId('');
  };

  if (!mounted || !user) return null;

  // ── Pipeline buckets ──────────────────────────────────────────
  const pendingAssignment = orders.filter((o) => o.status === 'ASSIGNED_TO_TSP');
  const activeOrders      = orders.filter((o) => ['ASSIGNED', 'EN_ROUTE', 'ARRIVED'].includes(o.status));
  const completedOrders   = orders.filter((o) => o.status === 'COMPLETED');

  // ── FIX: relaxed driver availability ─────────────────────────
  // Only require AVAILABLE status + assigned truck.
  // Removed strict `verified` check so demo drivers always show.
  const availableDrivers =
drivers.filter(
(driver) => {

const truck =
trucks.find(
t =>
t.id ===
driver.assignedTruckId
);

return (

driver.currentStatus
===
'AVAILABLE'

&&

driver.assignedTruckId

&&

truck?.sensorConfigured
===

true

);

}
);

  // ── Debug counts (used in modal) ──────────────────────────────
  const debugCounts = {
    total:        drivers.length,
    available:    drivers.filter((d) => d.currentStatus === 'AVAILABLE').length,
    withTruck:    drivers.filter((d) => d.assignedTruckId).length,
    verified:     drivers.filter((d) => d.verified).length,
    notAvailable: drivers.filter((d) => d.currentStatus !== 'AVAILABLE'),
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />

      <div className="flex-1">
        <Header user={user} />

        <main className="p-8">
          {/* Page title */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-1">Orders 📦</h1>
              <p className="text-gray-500">Assign drivers to deliveries</p>
            </div>
            <button
              onClick={() => loadData(user)}
              className="text-sm bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 px-4 py-2 rounded-lg transition-colors"
            >
              🔄 Refresh
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            {[
              { label: 'Total Orders', value: orders.length,          color: 'text-gray-900'   },
              { label: 'Need Driver',  value: pendingAssignment.length, color: 'text-orange-600' },
              { label: 'Active',       value: activeOrders.length,     color: 'text-blue-600'   },
              { label: 'Completed',    value: completedOrders.length,  color: 'text-green-600'  },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl p-6 border border-gray-200 text-center">
                <p className="text-sm text-gray-500 mb-1">{s.label}</p>
                <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* ── Needs Driver Assignment ── */}
          {pendingAssignment.length > 0 && (
            <section className="mb-10">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                🟠 Assign Drivers ({pendingAssignment.length})
              </h2>
              <div className="grid md:grid-cols-2 gap-6">
                {pendingAssignment.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white rounded-xl p-6 border-2 border-orange-200 shadow-sm"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          Order #{order.id.slice(0, 8)}
                        </h3>
                        <p className="text-sm text-gray-500">{order.clientName}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {order.urgency === 'URGENT' && (
                          <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
                            🚨 URGENT
                          </span>
                        )}
                        <StatusBadge status={order.status} />
                      </div>
                    </div>

                    <div className="space-y-1 text-sm mb-4">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Fuel</span>
                        <span className="font-medium">
                          {order.volume?.toLocaleString()}L {order.fuelType}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Destination</span>
                        <span className="font-medium text-right max-w-[200px] truncate">
                          {getDestination(order)}
                        </span>
                      </div>
                      {order.tankName && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Tank</span>
                          <span className="font-medium text-blue-600">🛢️ {order.tankName}</span>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        setSelectedOrder(order);
                        setSelectedDriverId('');
                        setShowAssignModal(true);
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition-colors"
                    >
                      👤 Assign Driver
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Active Deliveries ── */}
          {activeOrders.length > 0 && (
            <section className="mb-10">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                🔵 Active Deliveries ({activeOrders.length})
              </h2>
              <div className="grid md:grid-cols-2 gap-6">
                {activeOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Order #{order.id.slice(0, 8)}
                      </h3>
                      <StatusBadge status={order.status} />
                    </div>

                    <div className="space-y-2 text-sm mb-3">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Fuel</span>
                        <span className="font-medium">
                          {order.volume?.toLocaleString()}L {order.fuelType}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">To</span>
                        <span className="font-medium">{getDestination(order)}</span>
                      </div>
                      {order.tankName && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Tank</span>
                          <span className="font-medium text-blue-600">🛢️ {order.tankName}</span>
                        </div>
                      )}
                    </div>

                    {order.assignedDriverName && (
                      <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                        <p className="text-xs text-blue-700 font-semibold mb-0.5">
                          👤 {order.assignedDriverName}
                        </p>
                        <p className="text-xs text-blue-600">
                          🚛 {order.assignedTruckRegistration} &nbsp;•&nbsp; 📞 {order.assignedDriverPhone}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Completed ── */}
          {completedOrders.length > 0 && (
            <section className="mb-10">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                ✅ Completed ({completedOrders.length})
              </h2>
              <div className="grid md:grid-cols-3 gap-4">
                {completedOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white rounded-xl p-4 border border-green-200 shadow-sm"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-gray-900">#{order.id.slice(0, 8)}</p>
                      <StatusBadge status={order.status} />
                    </div>
                    <p className="text-sm text-gray-600">
                      {order.volume?.toLocaleString()}L {order.fuelType}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{order.clientName}</p>
                    {order.assignedDriverName && (
                      <p className="text-xs text-green-600 mt-1">
                        👤 {order.assignedDriverName}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Empty State ── */}
          {orders.length === 0 && (
            <div className="bg-white rounded-xl p-16 text-center border border-gray-200">
              <span className="text-6xl mb-4 block">📦</span>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Orders Yet</h3>
              <p className="text-gray-500">
                Orders assigned to your company by the seller will appear here.
              </p>
            </div>
          )}
        </main>
      </div>

      {/* ── Assign Driver Modal ── */}
      {showAssignModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold">Assign Driver</h3>
              <button
                onClick={() => { setShowAssignModal(false); setSelectedDriverId(''); }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Order summary */}
            <div className="bg-gray-50 rounded-xl p-4 mb-5">
              <p className="text-xs text-gray-500 mb-1">Order</p>
              <p className="font-bold text-lg">#{selectedOrder.id.slice(0, 8)}</p>
              <p className="text-sm text-gray-700">
                {selectedOrder.volume?.toLocaleString()}L {selectedOrder.fuelType} →{' '}
                {getDestination(selectedOrder)}
              </p>
              {selectedOrder.tankName && (
                <p className="text-sm text-blue-600 mt-1">
                  🛢️ For tank: {selectedOrder.tankName}
                </p>
              )}
            </div>

            {/* Debug panel — remove when going to production */}
            <details className="mb-4">
              <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                {/* 🔍 Debug info */}
              </summary>
              <div className="mt-2 bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                <p>Total drivers in TSP: {debugCounts.total}</p>
                <p>Status = AVAILABLE: {debugCounts.available}</p>
                <p>Has assigned truck: {debugCounts.withTruck}</p>
                <p>Verified: {debugCounts.verified}</p>
                <p>Showing (AVAILABLE + truck): {availableDrivers.length}</p>
                {drivers.map((d) => (
                  <div key={d.id} className="pl-2 border-l-2 border-gray-200 mt-1">
                    {d.firstName} {d.lastName} — status: <b>{d.currentStatus}</b>, truck:{' '}
                    {d.assignedTruckId ? '✅' : '❌'}, verified: {d.verified ? '✅' : '❌'}
                  </div>
                ))}
              </div>
            </details>

            {availableDrivers.length > 0 ? (
              <>
                <p className="text-sm font-medium text-gray-700 mb-3">
                  Select Driver ({availableDrivers.length} available):
                </p>
                <div className="space-y-3 mb-6">
                  {availableDrivers.map((driver) => {
                    const truck = trucks.find((t) => t.id === driver.assignedTruckId);
                    return (
                      <button
                        key={driver.id}
                        onClick={() => setSelectedDriverId(driver.id)}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                          selectedDriverId === driver.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-blue-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-gray-900">
                              {driver.firstName} {driver.lastName}
                            </p>
                            <p className="text-sm text-gray-500">📞 {driver.phone}</p>
                            {truck && (
                              <p className="text-sm text-gray-500">
                                🚛
{truck.registrationNumber}

{
!truck.sensorConfigured
&&

<span
className="
ml-2
text-red-600
text-xs
font-bold
"
>

SENSOR INACTIVE

</span>

}
                                {truck.fuelType && (
                                  <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                                    {truck.fuelType}
                                  </span>
                                )}
                              </p>
                            )}
                            <p className="text-xs text-gray-400 mt-0.5">
                              License: {driver.licenseNumber}
                            </p>
                          </div>
                          {selectedDriverId === driver.id && (
                            <span className="text-blue-600 text-2xl font-bold">✓</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={handleAssignDriver}
                  disabled={!selectedDriverId}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl transition-colors"
                >
                  ✓ Assign Driver
                </button>
              </>
            ) : (
              <div className="text-center py-8">
                <span className="text-5xl mb-4 block">👤</span>
                <h4 className="text-lg font-semibold text-gray-900 mb-2">No Available Drivers</h4>
                <p className="text-sm text-red-600 mt-2">
Drivers using trucks without active sensors are blocked.
</p>
                <p className="text-gray-500 mb-4">
                  {drivers.length === 0
                    ? 'No drivers registered yet.'
                    : 'All drivers are busy or have incomplete setup.'}
                </p>

                {drivers.length > 0 && (
                  <div className="text-left bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4">
                    <p className="text-sm text-orange-800 font-semibold mb-2">Issues to fix:</p>
                    <ul className="text-xs text-orange-700 space-y-1">
                      {drivers.filter((d) => !d.assignedTruckId).length > 0 && (
                        <li>
                          ⚠️ {drivers.filter((d) => !d.assignedTruckId).length} driver(s) have no
                          truck assigned
                        </li>
                      )}
                      {debugCounts.notAvailable.length > 0 && (
                        <li>
                          ⚠️ {debugCounts.notAvailable.length} driver(s) status:{' '}
                          {[...new Set(debugCounts.notAvailable.map((d: any) => d.currentStatus))].join(', ')}
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => router.push('/transport/drivers')}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2 rounded-lg transition-colors text-sm"
                  >
                    → Manage Drivers
                  </button>
                  <button
                    onClick={() => {
                      // Force-reset all TSP drivers to AVAILABLE for demo
                      drivers.forEach((d) =>
                        updateDriver?.(d.id, { currentStatus: 'AVAILABLE' })
                      );
                      loadData(user);
                    }}
                    className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-5 py-2 rounded-lg transition-colors text-sm"
                  >
                    🔄 Reset All to Available
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={() => { setShowAssignModal(false); setSelectedDriverId(''); }}
              className="w-full mt-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-xl transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
