// src/app/driver/trip/[orderId]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import StatusBadge from '@/src/components/workflow/StatusBadge';
import {
  getCurrentUser,
  setCurrentUser,
  getUsers,
  getOrders,
  getTrucks,
  getDriverById,
  updateOrder,
  updateTruck,
  updateDriver,
  updateTankLevel,
  addNotification,
  shortOrderId,
} from '@/src/lib/demo-data';

// ── Helpers ───────────────────────────────────────────────────
const getDestination = (order: any) =>
  order.destinationName ?? order.destination ?? '—';

const getAddress = (order: any) =>
  order.destinationAddress ?? order.address ?? null;

const STEPS = [
  { key: 'ASSIGNED',  icon: '✓',  label: 'Assigned'  },
  { key: 'EN_ROUTE',  icon: '🚛', label: 'En Route'  },
  { key: 'ARRIVED',   icon: '📍', label: 'Arrived'   },
  { key: 'COMPLETED', icon: '✅', label: 'Completed' },
];

const STEP_ORDER = ['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED'];

export default function DriverTripPage() {
  const router   = useRouter();
  const params   = useParams();
  const orderId  = params.orderId as string;

  const [user,    setUser]    = useState<any>(null);
  const [driver,  setDriver]  = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [order,   setOrder]   = useState<any>(null);
  const [truck,   setTruck]   = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const [qrGenerated, setQrGenerated] =
useState(false);

const [clientApproved, setClientApproved] =
useState(false);

const [unloading, setUnloading] =
useState(false);

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();

    if (!currentUser) { router.push('/'); return; }
    if (currentUser.role !== 'DRIVER') { router.push('/'); return; }

    setUser(currentUser);
    loadTripData(currentUser);
  }, [orderId]);

  // ── Load data ─────────────────────────────────────────────────
  const loadTripData = (currentUser: any) => {
    const allOrders  = getOrders();
    const foundOrder = allOrders.find((o) => o.id === orderId);

    if (foundOrder) {
      // Rehydrate all Date fields from localStorage strings
      setOrder({
        ...foundOrder,
        createdAt:     new Date(foundOrder.createdAt),
        tripStartedAt: foundOrder.tripStartedAt ? new Date(foundOrder.tripStartedAt) : null,
        arrivedAt:     foundOrder.arrivedAt     ? new Date(foundOrder.arrivedAt)     : null,
        completedAt:   foundOrder.completedAt   ? new Date(foundOrder.completedAt)   : null,
      });

      if (foundOrder.assignedTruckId) {
        const allTrucks  = getTrucks();
        const foundTruck = allTrucks.find((t) => t.id === foundOrder.assignedTruckId);
        setTruck(foundTruck ?? null);
      }
    }

    const driverData = getDriverById?.(currentUser.id);
    setDriver(driverData ?? null);
  };

  // ── Role switcher ─────────────────────────────────────────────
  const handleRoleChange = (userId: string) => {
    const users   = getUsers();
    const newUser = users.find((u) => u.id === userId);
    if (!newUser) return;
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
  };

  // ── Shared notify helper ──────────────────────────────────────
  const notifyParties = (
    type: string,
    title: string,
    sellerMsg: string,
    clientMsg: string,
    tspMsg: string
  ) => {
    const allUsers = getUsers();

    // Seller
    const seller = allUsers.find(
      (u) => u.role === 'SELLER_MANAGER' && u.workspaceId === order.workspaceId
    );
    if (seller) {
      addNotification({
        id: `notif-${Date.now()}-seller`,
        userId: seller.id,
        type,
        title,
        message: sellerMsg,
        read: false,
        createdAt: new Date(),
      });
    }

    // TSP
    if (order.assignedTSPId) {
      addNotification({
        id: `notif-${Date.now()}-tsp`,
        userId: order.assignedTSPId,
        type,
        title,
        message: tspMsg,
        read: false,
        createdAt: new Date(),
      });
    }

    // Client
    if (order.clientId) {
      addNotification({
        id: `notif-${Date.now()}-client`,
        userId: order.clientId,
        type,
        title,
        message: clientMsg,
        read: false,
        createdAt: new Date(),
      });
    }
  };

  // ── Start Trip ────────────────────────────────────────────────
  const handleStartTrip = async () => {
    if (!confirm('🚛 Start this delivery trip?')) return;
    setLoading(true);
    try {
      updateOrder(orderId, { status: 'EN_ROUTE', tripStartedAt: new Date() });
      if (truck) updateTruck(truck.id, { status: 'EN_ROUTE' });
      updateDriver(user.id, { currentStatus: 'ON_TRIP' });

      const dest = getDestination(order);
      notifyParties(
        'TRIP_STARTED',
        '🚛 Trip Started',
        `Driver ${user.firstName} ${user.lastName} started delivery for order #${shortOrderId(order.id)}`,
        `Your fuel delivery is on the way to ${dest}! Driver: ${user.firstName} ${user.lastName}`,
        `Driver ${user.firstName} ${user.lastName} started delivery for order #${shortOrderId(order.id)}`
      );

      loadTripData(user);
      alert('✅ Trip started! Drive safely! 🚛');
    } catch (err) {
      console.error(err);
      alert('❌ Error starting trip. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Arrived ───────────────────────────────────────────────────
  const handleArrived = async () => {
    if (!confirm('📍 Confirm arrival at destination?')) return;
    setLoading(true);
    try {
      updateOrder(orderId, { status: 'ARRIVED', arrivedAt: new Date() });
      if (truck) updateTruck(truck.id, { status: 'ARRIVED' });

      const dest = getDestination(order);
      notifyParties(
        'DRIVER_ARRIVED',
        '📍 Driver Arrived',
        `Driver arrived at ${dest} for order #${shortOrderId(order.id)}`,
        `The driver has arrived at ${dest}. Please prepare for fuel delivery.`,
        `Driver arrived at destination for order #${shortOrderId(order.id)}`
      );

      loadTripData(user);
      alert('✅ Arrival confirmed! All parties notified.');
    } catch (err) {
      console.error(err);
      alert('❌ Error confirming arrival. Please try again.');
    } finally {
      setLoading(false);
    }
  };


  const handleGenerateQR =
()=>{

if(
!truck
)
return;

updateTruck(
truck.id,
{
qrCode:
`DELIVERY-${order.id}`
}
);

setQrGenerated(
true
);

alert(
'✅ QR Generated'
);

};

const handleVerify=
()=>{

if(
!truck
)
return;

const available=
truck.capacity
||
0;

const required=
order.volume
||
0;

if(
available<
required
){

alert(
'❌ Insufficient fuel'
);

return;

}

setClientApproved(
true
);

alert(
'✅ Verified'
);

};

const handleUnload=
()=>{

setUnloading(
true
);

setTimeout(
()=>{

setUnloading(
false
);

handleCompleteDelivery();

},
3000
);

};
  // ── Complete Delivery ─────────────────────────────────────────
  const handleCompleteDelivery = async () => {
    if (!confirm('✅ Confirm delivery completion?')) return;
    setLoading(true);
    try {
      updateOrder(orderId, { status: 'DELIVERY_SUCCESSFUL', completedAt: new Date() });
        // ── FIX: update the client's tank level ──────────────────
    if (order.tankId && order.volume) {
      updateTankLevel(order.tankId, order.volume);
    }
    // ────────────────────────────────────────────────────────

    if (truck)  updateTruck(truck.id,  { status: 'IDLE' });
    updateDriver(user.id, { currentStatus: 'AVAILABLE' });
    
      notifyParties(
        'DELIVERY_COMPLETED',
        '✅ Delivery Completed',
        `Order #${shortOrderId(order.id)} delivered successfully!`,
        `Your fuel delivery of ${order.volume?.toLocaleString()}L ${order.fuelType} has been completed! 🎉`,
        `Order #${shortOrderId(order.id)} delivered by ${user.firstName} ${user.lastName}`
      );

      alert('✅ Delivery completed! Great job! 🎉');
      router.push('/driver/dashboard');
    } catch (err) {
      console.error(err);
      alert('❌ Error completing delivery. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Guards ────────────────────────────────────────────────────
  if (!mounted || !user) return null;

  if (!order) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar userRole={user?.role ?? 'DRIVER'} />
        <div className="flex-1">
          <Header user={user} />
          <main className="p-8 flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <div className="text-5xl mb-4">🔍</div>
              <p className="text-xl font-semibold text-gray-700 mb-2">Order Not Found</p>
              <p className="text-gray-500 mb-6">
                Order <code className="bg-gray-100 px-2 py-0.5 rounded text-sm">{orderId}</code> could
                not be found.
              </p>
              <button
                onClick={() => router.push('/driver/dashboard')}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
              >
                ← Back to Dashboard
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // ── Step index helper ─────────────────────────────────────────
  const currentStepIndex = STEP_ORDER.indexOf(order.status);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />

      <div className="flex-1">
        <Header user={user} />

        <main className="p-8 max-w-2xl">

          {/* Back + Title */}
          <div className="mb-8 flex items-center gap-4">
            <button
              onClick={() => router.push('/driver/dashboard')}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              ← Back
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Trip Details</h1>
              <p className="text-gray-500">Order #{shortOrderId(order.id)}</p>
            </div>
          </div>

          {/* ── Progress Tracker ── */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Trip Progress</h3>
              <StatusBadge status={order.status} />
            </div>

            <div className="flex items-center">
              {STEPS.map((step, idx) => {
                const stepIndex   = STEP_ORDER.indexOf(step.key);
                const isDone      = stepIndex < currentStepIndex;
                const isCurrent   = stepIndex === currentStepIndex;
                const isPending   = stepIndex > currentStepIndex;
                const isLast      = idx === STEPS.length - 1;

                return (
                  <div key={step.key} className="flex items-center flex-1">
                    <div className="flex flex-col items-center flex-1">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-lg mb-1 font-bold transition-all ${
                          isDone    ? 'bg-green-500 text-white' :
                          isCurrent ? 'bg-blue-600 text-white ring-4 ring-blue-100' :
                                      'bg-gray-200 text-gray-400'
                        }`}
                      >
                        {step.icon}
                      </div>
                      <p
                        className={`text-xs font-medium text-center ${
                          isCurrent ? 'text-blue-700' :
                          isDone    ? 'text-green-600' :
                                      'text-gray-400'
                        }`}
                      >
                        {step.label}
                      </p>
                    </div>
                    {!isLast && (
                      <div
                        className={`h-1 flex-1 rounded-full mx-1 mb-5 transition-all ${
                          stepIndex < currentStepIndex ? 'bg-green-400' : 'bg-gray-200'
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Timestamps */}
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-500">
              {order.createdAt && (
                <p>📅 Ordered: {new Date(order.createdAt).toLocaleString()}</p>
              )}
              {order.tripStartedAt && (
                <p>🚛 Started: {new Date(order.tripStartedAt).toLocaleString()}</p>
              )}
              {order.arrivedAt && (
                <p>📍 Arrived: {new Date(order.arrivedAt).toLocaleString()}</p>
              )}
              {order.completedAt && (
                <p>✅ Done: {new Date(order.completedAt).toLocaleString()}</p>
              )}
            </div>
          </div>

          {/* ── Delivery Information ── */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 mb-6 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Delivery Information</h3>

            <div className="space-y-3">
              {/* Fuel */}
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                <p className="text-xs text-blue-600 font-medium mb-1">⛽ Fuel Details</p>
                <p className="text-2xl font-bold text-blue-900">
                  {order.volume?.toLocaleString()}L {order.fuelType}
                </p>
                {order.isMixedLoad && order.fuelBreakdown?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {order.fuelBreakdown.map((fuel: any, idx: number) => (
                      <p key={idx} className="text-sm text-blue-700">
                        • {fuel.volume.toLocaleString()}L {fuel.fuelType}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* Destination — FIX: uses getDestination helper */}
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-500 font-medium mb-1">📍 Destination</p>
                <p className="text-lg font-semibold text-gray-900">{getDestination(order)}</p>
                {getAddress(order) && (
                  <p className="text-sm text-gray-500 mt-0.5">{getAddress(order)}</p>
                )}
                {order.destinationLat && order.destinationLng && (
                  <p className="text-xs text-gray-400 mt-1">
                    {order.destinationLat.toFixed(4)}, {order.destinationLng.toFixed(4)}
                  </p>
                )}
              </div>

              {/* Tank (if order linked to a tank) */}
              {order.tankName && (
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                  <p className="text-xs text-blue-600 font-medium mb-1">🛢️ Filling Tank</p>
                  <p className="text-lg font-semibold text-blue-900">{order.tankName}</p>
                </div>
              )}

              {/* Client */}
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-500 font-medium mb-1">👤 Client</p>
                <p className="text-lg font-semibold text-gray-900">{order.clientName}</p>
              </div>

              {/* Notes / Special Instructions */}
              {(order.notes || order.specialInstructions) && (
                <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
                  <p className="text-xs text-yellow-700 font-semibold mb-1">📝 Notes</p>
                  <p className="text-sm text-yellow-900">
                    {order.notes ?? order.specialInstructions}
                  </p>
                </div>
              )}

              {/* Urgency */}
              {order.urgency === 'URGENT' && (
                <div className="bg-red-50 rounded-xl p-3 border border-red-200 flex items-center gap-2">
                  <span className="text-red-600 text-lg">🚨</span>
                  <p className="text-sm text-red-700 font-semibold">URGENT delivery — prioritize this trip</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Truck Information ── */}
          {truck && (
            <div className="bg-white rounded-2xl p-6 border border-gray-200 mb-6 shadow-sm">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Your Truck 🚛</h3>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-2xl font-bold text-gray-900 mb-3">
                  {truck.registrationNumber}
                </p>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500 text-xs">Capacity</p>
                    <p className="font-semibold">{truck.capacity?.toLocaleString()}L</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">Compartments</p>
                    <p className="font-semibold">{truck.compartments?.length ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">Fuel Type</p>
                    <p className="font-semibold">{truck.fuelType ?? '—'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Action Buttons ── */}
          <div className="space-y-4">
            {order.status === 'ASSIGNED' && (
              <button
                onClick={handleStartTrip}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-4 rounded-2xl transition-colors text-lg shadow-lg"
              >
                {loading ? '⏳ Starting...' : '🚀 Start Trip'}
              </button>
            )}

            {order.status === 'EN_ROUTE' && (
              <button
                onClick={handleArrived}
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bold py-4 rounded-2xl transition-colors text-lg shadow-lg"
              >
                {loading ? '⏳ Confirming...' : '📍 I Have Arrived'}
              </button>
            )}

          {order.status==='ARRIVED'&&(

<div className="space-y-4">

<div className="bg-blue-50 p-4 rounded">

<div>
QR:
{
truck?.qrCode
? 'READY'
: 'NOT GENERATED'
}
</div>

<div>
Fuel:
{
order.volume
}
L
</div>

</div>

{
!qrGenerated
&&

<button
onClick={
handleGenerateQR
}
className="
w-full
bg-indigo-600
text-white
py-4
rounded-xl
"
>

📷 Generate QR

</button>

}

{
qrGenerated
&&
!clientApproved
&&

<button
onClick={
handleVerify
}
className="
w-full
bg-orange-600
text-white
py-4
rounded-xl
"
>

✔ Verify Delivery

</button>

}

{
clientApproved
&&

<button
onClick={
handleUnload
}
className="
w-full
bg-green-600
text-white
py-4
rounded-xl
"
>

{
unloading
? '⛽ Unloading...'
: '⛽ Start Unloading'
}

</button>

}

</div>

)}

            {order.status === 'COMPLETED' && (
              <div className="bg-green-50 rounded-2xl p-8 border border-green-200 text-center">
                <span className="text-6xl mb-4 block">🎉</span>
                <h3 className="text-2xl font-bold text-green-900 mb-2">Delivery Completed!</h3>
                <p className="text-green-700 mb-6">Great job on a successful delivery!</p>
                <button
                  onClick={() => router.push('/driver/dashboard')}
                  className="bg-green-600 hover:bg-green-700 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
                >
                  Back to Dashboard
                </button>
              </div>
            )}
          </div>

        </main>
      </div>
    </div>
  );
}
