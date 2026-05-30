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
  getDrivers,
  getTrucks,
  shortOrderId,
} from '@/src/lib/demo-data';


export default function DriverDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [activeDelivery, setActiveDelivery] = useState<any>(null);
  const [deliveryHistory, setDeliveryHistory] = useState<any[]>([]);
  const [assignedTruck, setAssignedTruck] = useState<any>(null);

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();
    setUser(currentUser);
    
    if (!currentUser || currentUser.role !== 'DRIVER') {
      router.push('/');
      return;
    }
    
    loadDeliveries(currentUser);
  }, []);

  const loadDeliveries = (
  currentUser: any
) => {
  const allOrders = getOrders();

  const myOrders =
    allOrders.filter(
      order =>
      order.assignedDriverId ===
      currentUser.id
    );

  const active =
    myOrders.find(
      o =>
      [
        'EN_ROUTE',
        'ARRIVED',
        'DELIVERING',
      ].includes(
        o.status
      )
    );

  const completed =
    myOrders.filter(
      o =>
      o.status ===
      'COMPLETED'
    );

  setActiveDelivery(active);

  setDeliveryHistory(completed);

  const driver =
    getDrivers()
    .find(
      d =>
      d.id ===
      currentUser.id
    );

  if (
    driver?.assignedTruckId
  ) {
    const truck =
      getTrucks()
      .find(
        t =>
        t.id ===
        driver.assignedTruckId
      );

    setAssignedTruck(
      truck
    );
  }
};

  const handleRoleChange = (userId: string) => {
    const users = getUsers();
    const newUser = users.find(u => u.id === userId);
    if (newUser) {
      setUser(newUser);
      setCurrentUser(newUser);
      
      const routes: Record<string, string> = {
        PLATFORM_ADMIN: '/platform-admin/dashboard',
        SELLER_MANAGER: '/seller/dashboard',
        TRANSPORT_ADMIN: '/transport/dashboard',
        CLIENT: '/client/dashboard',
        DRIVER: '/driver/dashboard',
      };
      router.push(routes[newUser.role]);
    }
  };

  const handleStartDelivery = () => {
    if (activeDelivery) {
      router.push(`/driver/delivery/${activeDelivery.id}`);
    }
  };

  if (!mounted || !user) return null;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />
      
      <div className="flex-1">
        <Header user={user} />
        
        <main className="p-8">
          {/* Welcome Banner */}
          <div className="bg-gradient-to-r from-green-600 to-teal-700 rounded-xl p-8 mb-8 text-white">
            <h1 className="text-3xl font-bold mb-2">Welcome, {user.firstName}! 🚛</h1>
            <p className="text-green-100">Your delivery dashboard</p>
          </div>

          {/* Driver Info Card */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Driver Information</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-gray-600">Full Name</p>
                <p className="font-semibold text-lg">{user.firstName} {user.lastName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">License Number</p>
                <p className="font-semibold text-lg">{user.licenseNumber}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Phone</p>
                <p className="font-semibold text-lg">{user.phone}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Username</p>
                <p className="font-semibold text-lg">{user.username}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Email</p>
                <p className="font-semibold text-lg">{user.email}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Status</p>
                <span className="inline-block bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
                  ✓ Active
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 border border-gray-200 mb-8">

<h2 className="text-xl font-bold mb-4">
Assigned Truck
</h2>

{assignedTruck ? (

<div className="grid md:grid-cols-4 gap-4">

<div>
<p className="text-gray-500">
Registration
</p>

<p className="font-bold">
{assignedTruck.registrationNumber}
</p>
</div>

<div>
<p className="text-gray-500">
Capacity
</p>

<p className="font-bold">
{assignedTruck.capacity}L
</p>
</div>

<div>
<p className="text-gray-500">
Status
</p>

<p className="font-bold">
{assignedTruck.status}
</p>
</div>

<div>
<p className="text-gray-500">
QR
</p>

<p className="font-bold">
{
assignedTruck.qrCode
? 'READY'
: 'PENDING'
}
</p>
</div>

</div>

):(

<p>
No truck assigned
</p>

)}

</div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Total Deliveries</p>
              <p className="text-3xl font-bold text-gray-900">{deliveryHistory.length}</p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Active Delivery</p>
              <p className="text-3xl font-bold text-orange-600">{activeDelivery ? '1' : '0'}</p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">This Week</p>
              <p className="text-3xl font-bold text-blue-600">
                {deliveryHistory.filter(d => {
                  const weekAgo = new Date();
                  weekAgo.setDate(weekAgo.getDate() - 7);
                  return d.completedAt && new Date(d.completedAt) > weekAgo;
                }).length}
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Fuel Delivered</p>
              <p className="text-3xl font-bold text-green-600">
                {deliveryHistory.reduce((sum, d) => sum + (d.volume || 0), 0).toLocaleString()}L
              </p>
            </div>
          </div>

          {/* Active Delivery */}
          {activeDelivery ? (
            <div className="bg-white rounded-xl p-6 border-2 border-orange-200 mb-8">
              <div className="flex items-start justify-between mb-4">
               <div className="grid grid-cols-3 gap-3 mb-4">

<button
className="bg-blue-100 p-3 rounded"
>
📍 Open Map
</button>

<button
className="bg-green-100 p-3 rounded"
>
📷 Show QR
</button>

<button
className="bg-orange-100 p-3 rounded"
>
⛽ Start Unloading
</button>

</div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">🚨 Active Delivery</h2>
                  <p className="text-gray-600">Order #{shortOrderId(activeDelivery.id)}</p>
                </div>
                <StatusBadge status={activeDelivery.status} />
              </div>

              <div className="grid md:grid-cols-3 gap-6 mb-6">
                <div>
                  <p className="text-sm text-gray-600">Fuel Type</p>
                  <p className="font-semibold text-lg">{activeDelivery.fuelType}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Volume</p>
                  <p className="font-semibold text-lg">{activeDelivery.volume}L</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Destination</p>
                  <p className="font-semibold text-lg">{activeDelivery.destinationName}</p>
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-800">
                  📍 <strong>Delivery Address:</strong> {activeDelivery.destinationAddress}
                </p>
              </div>

              <button
                onClick={handleStartDelivery}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 rounded-lg transition-colors text-lg animate-pulse"
              >
                🚛 Continue Delivery →
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl p-12 text-center border border-gray-200 mb-8">
              <span className="text-6xl mb-4 block">✅</span>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Active Deliveries</h3>
              <p className="text-gray-600">You'll receive trips after truck assignment</p>
            </div>
          )}

          {/* Delivery History */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Delivery History ({deliveryHistory.length})</h2>
            </div>

            {deliveryHistory.length > 0 ? (
              <div className="divide-y divide-gray-200">
                {deliveryHistory.map((delivery) => (
                  <div key={delivery.id} className="p-6 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-1">
                          Order #{shortOrderId(delivery.id)}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {delivery.volume}L {delivery.fuelType} → {delivery.destinationName}
                        </p>
                      </div>
                      <StatusBadge status={delivery.status} />
                    </div>

                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span>📅 Completed: {delivery.completedAt?.toLocaleDateString()}</span>
                      <span>⏱️ {delivery.completedAt?.toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center">
                <span className="text-6xl mb-4 block">📦</span>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No Delivery History</h3>
                <p className="text-gray-600">Completed deliveries will appear here</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
