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
} from '@/src/lib/demo-data';

export default function ClientDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    setMounted(true);

    const currentUser = getCurrentUser();

    if (!currentUser) {
      router.push('/');
      return;
    }

    if (currentUser.role !== 'CLIENT') {
      router.push('/');
      return;
    }

    setUser(currentUser);
    loadOrders(currentUser);
  }, [router]);

  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      loadOrders(user);
    }, 3000);

    return () => clearInterval(interval);
  }, [user]);

  const loadOrders = (currentUser: any) => {
    const allOrders = getOrders();
    console.log('=== CLIENT DASHBOARD DEBUG ===');
    console.log('Current user:', currentUser);
    console.log('Current user ID:', currentUser.id);
    console.log('All orders in system:', allOrders);

    const myOrders = allOrders.filter((o: any) => o.clientId === currentUser.id);
    console.log('My orders:', myOrders);
    console.log('My orders count:', myOrders.length);

    setOrders(myOrders);
  };

  const handleRoleChange = (userId: string) => {
    const users = getUsers();
    const newUser = users.find((u: any) => u.id === userId);

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

  const handleDebug = () => {
    const myOrders = orders;

    console.log('=== DETAILED DEBUG ===');
    console.log('My Orders Details:');
    myOrders.forEach(order => {
      console.log({
        orderId: order.id,
        status: order.status,
        volume: order.volume,
        fuelType: order.fuelType,
        destination: order.destinationName,
        assignedDriverId: order.assignedDriverId,
        assignedDriverName: order.assignedDriverName,
        assignedDriverPhone: order.assignedDriverPhone,
        assignedTruckId: order.assignedTruckId,
        assignedTruckRegistration: order.assignedTruckRegistration,
        createdAt: order.createdAt,
      });
    });

    const debugText = myOrders
      .map(
        order =>
          `Order #${order.id.slice(0, 8)}\n` +
          `Status: ${order.status}\n` +
          `Driver: ${order.assignedDriverName || 'Not assigned'}\n` +
          `Phone: ${order.assignedDriverPhone || 'N/A'}\n` +
          `Truck: ${order.assignedTruckRegistration || 'N/A'}\n` +
          `Volume: ${order.volume}L ${order.fuelType}\n` +
          `Destination: ${order.destinationName}\n`
      )
      .join('\n---\n');

    alert(`Found ${myOrders.length} orders:\n\n${debugText}`);
  };

  if (!mounted || !user) {
    return null;
  }

  const activeOrders = orders.filter(
    o => !['COMPLETED', 'CANCELLED'].includes(o.status)
  );
  const completedOrders = orders.filter(o => o.status === 'COMPLETED');
  const inTransitOrders = orders.filter(o =>
    ['EN_ROUTE', 'ARRIVED'].includes(o.status)
  );

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />

      <div className="flex-1">
        <Header user={user} />

        <main className="p-8">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Welcome, {user.firstName || user.companyName}! 👋
              </h1>
              <p className="text-gray-600">Client Dashboard</p>
            </div>

            {/* 
            <button
              onClick={handleDebug}
              className="bg-red-100 hover:bg-red-200 text-red-700 font-medium px-4 py-2 rounded-lg"
            >
              🔍 Debug Orders
            </button> 
            */}
          </div>

          <div className="grid grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Total Orders</p>
              <p className="text-3xl font-bold text-gray-900">{orders.length}</p>
            </div>

            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Active</p>
              <p className="text-3xl font-bold text-blue-600">
                {activeOrders.length}
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">In Transit</p>
              <p className="text-3xl font-bold text-orange-600">
                {inTransitOrders.length}
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Completed</p>
              <p className="text-3xl font-bold text-green-600">
                {completedOrders.length}
              </p>
            </div>
          </div>

          {activeOrders.length > 0 ? (
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Active Orders ({activeOrders.length})
              </h2>

              <div className="grid md:grid-cols-2 gap-6">
                {activeOrders.map(order => (
                  <div
                    key={order.id}
                    className={`bg-white rounded-xl p-6 border-2 transition-all ${
                      ['EN_ROUTE', 'ARRIVED'].includes(order.status)
                        ? 'border-blue-300 shadow-lg'
                        : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">
                          Order #{order.id.slice(0, 8)}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <StatusBadge status={order.status} />
                    </div>

                    <div className="space-y-3">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-sm font-semibold text-gray-900">
                          {order.volume?.toLocaleString()}L {order.fuelType}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          → {order.destinationName}
                        </p>
                      </div>

                      {order.assignedDriverName && (
                        <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                          <p className="text-xs text-blue-700 font-medium mb-1">
                            🚛 Driver: {order.assignedDriverName}
                          </p>
                          <p className="text-xs text-blue-600">
                            📞 {order.assignedDriverPhone}
                          </p>
                          {order.assignedTruckRegistration && (
                            <p className="text-xs text-blue-600">
                              Truck: {order.assignedTruckRegistration}
                            </p>
                          )}
                        </div>
                      )}

                      {order.status === 'EN_ROUTE' && (
                        <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 animate-pulse">
                          <p className="text-sm text-blue-900 font-medium">
                            🚛 Driver is on the way!
                          </p>
                        </div>
                      )}

                      {order.status === 'ARRIVED' && (
                        <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                          <p className="text-sm text-green-900 font-medium">
                            📍 Driver has arrived at your location!
                          </p>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => router.push('/client/orders')}
                      className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors"
                    >
                      View Details →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
              <span className="text-6xl mb-4 block">📦</span>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                No Active Orders
              </h3>
              <p className="text-gray-600 mb-6">
                Place a new order to get started
              </p>
              <button
                onClick={() => router.push('/client/orders/new')}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                + New Order
              </button>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            <button
              onClick={() => router.push('/client/orders/new')}
              className="bg-white rounded-xl p-6 border-2 border-gray-200 hover:border-blue-300 transition-all text-left"
            >
              <span className="text-3xl mb-3 block">➕</span>
              <h3 className="text-lg font-bold text-gray-900 mb-1">
                Place New Order
              </h3>
              <p className="text-sm text-gray-600">Request fuel delivery</p>
            </button>

            <button
              onClick={() => router.push('/client/orders')}
              className="bg-white rounded-xl p-6 border-2 border-gray-200 hover:border-blue-300 transition-all text-left"
            >
              <span className="text-3xl mb-3 block">📦</span>
              <h3 className="text-lg font-bold text-gray-900 mb-1">
                View All Orders
              </h3>
              <p className="text-sm text-gray-600">
                Track your {orders.length} order(s)
              </p>
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}