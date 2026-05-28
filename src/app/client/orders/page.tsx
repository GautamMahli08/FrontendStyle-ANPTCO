'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import StatusBadge from '@/src/components/workflow/StatusBadge';
import { getCurrentUser, setCurrentUser, getUsers, getOrders } from '@/src/lib/demo-data';

export default function ClientOrdersPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

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

  // Auto-refresh every 3 seconds to get real-time updates
  useEffect(() => {
    if (!user) return;
    
    const interval = setInterval(() => {
      loadOrders(user);
    }, 3000);

    return () => clearInterval(interval);
  }, [user]);

  const loadOrders = (currentUser: any) => {
    const allOrders = getOrders();
    const myOrders = allOrders.filter(o => o.clientId === currentUser.id);
    
    // Sort by creation date, newest first
    myOrders.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    setOrders(myOrders);
    console.log('Client orders refreshed:', myOrders.length);
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

  const handleRefresh = () => {
    if (user) {
      loadOrders(user);
      alert('✅ Orders refreshed!');
    }
  };

  const getStatusMessage = (order: any) => {
    switch (order.status) {
      case 'PLACED':
        return 'Order placed, awaiting seller review';
      case 'ASSIGNED_TO_TSP':
        return 'Assigned to transport provider, awaiting driver assignment';
      case 'ASSIGNED':
        return `Driver ${order.assignedDriverName} assigned to your order`;
      case 'EN_ROUTE':
        return `🚛 Driver is on the way! ETA: Soon`;
      case 'ARRIVED':
        return '📍 Driver has arrived at your location!';
      case 'COMPLETED':
        return '✅ Delivery completed successfully';
      case 'CANCELLED':
        return 'Order cancelled';
      default:
        return 'Processing...';
    }
  };

  if (!mounted || !user) {
    return null;
  }

  const activeOrders = orders.filter(o => !['COMPLETED', 'CANCELLED'].includes(o.status));
  const pastOrders = orders.filter(o => ['COMPLETED', 'CANCELLED'].includes(o.status));

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />
      
      <div className="flex-1">
        <Header user={user} />
        
        <main className="p-8">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">My Orders 📦</h1>
              <p className="text-gray-600">Track your fuel deliveries</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleRefresh}
                className="bg-blue-100 hover:bg-blue-200 text-blue-700 font-medium px-4 py-2 rounded-lg transition-colors"
              >
                🔄 Refresh
              </button>
              <button
                onClick={() => router.push('/client/orders/new')}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
              >
                + New Order
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Total Orders</p>
              <p className="text-3xl font-bold text-gray-900">{orders.length}</p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Active</p>
              <p className="text-3xl font-bold text-blue-600">{activeOrders.length}</p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Completed</p>
              <p className="text-3xl font-bold text-green-600">
                {orders.filter(o => o.status === 'COMPLETED').length}
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">In Transit</p>
              <p className="text-3xl font-bold text-orange-600">
                {orders.filter(o => ['EN_ROUTE', 'ARRIVED'].includes(o.status)).length}
              </p>
            </div>
          </div>

          {/* Active Orders */}
          {activeOrders.length > 0 && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Active Orders ({activeOrders.length})
              </h2>
              <div className="space-y-4">
                {activeOrders.map((order) => (
                  <div 
                    key={order.id} 
                    className={`bg-white rounded-xl p-6 border-2 transition-all cursor-pointer ${
                      ['EN_ROUTE', 'ARRIVED'].includes(order.status) 
                        ? 'border-blue-300 shadow-lg' 
                        : 'border-gray-200'
                    }`}
                    onClick={() => {
                      setSelectedOrder(order);
                      setShowDetailsModal(true);
                    }}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            Order #{order.id.slice(0, 8)}
                          </h3>
                          <StatusBadge status={order.status} />
                        </div>
                        <p className="text-sm text-gray-600 mb-2">
                          {new Date(order.createdAt).toLocaleString()}
                        </p>
                        
                        {/* Status Message */}
                        <div className={`rounded-lg p-3 mb-3 ${
                          ['EN_ROUTE', 'ARRIVED'].includes(order.status) 
                            ? 'bg-blue-50 border border-blue-200' 
                            : 'bg-gray-50 border border-gray-200'
                        }`}>
                          <p className={`text-sm font-medium ${
                            ['EN_ROUTE', 'ARRIVED'].includes(order.status) 
                              ? 'text-blue-900' 
                              : 'text-gray-700'
                          }`}>
                            {getStatusMessage(order)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4 mb-4">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-600 mb-1">Fuel Details</p>
                        <p className="font-semibold text-gray-900">
                          {order.volume?.toLocaleString()}L {order.fuelType}
                        </p>
                        {order.isMixedLoad && order.fuelBreakdown && (
                          <div className="mt-1 space-y-0.5">
                            {order.fuelBreakdown.map((fuel: any, idx: number) => (
                              <p key={idx} className="text-xs text-gray-600">
                                • {fuel.volume.toLocaleString()}L {fuel.fuelType}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-600 mb-1">Destination</p>
                        <p className="font-semibold text-gray-900 text-sm">
                          {order.destinationName}
                        </p>
                      </div>
                    </div>

                    {/* Driver Info */}
                    {order.assignedDriverName && (
                      <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                        <p className="text-xs text-blue-700 mb-1">Driver Assigned</p>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-blue-900">
                              {order.assignedDriverName}
                            </p>
                            <p className="text-sm text-blue-800">
                              📞 {order.assignedDriverPhone}
                            </p>
                            {order.assignedTruckRegistration && (
                              <p className="text-sm text-blue-800">
                                🚛 {order.assignedTruckRegistration}
                              </p>
                            )}
                          </div>
                          {['EN_ROUTE', 'ARRIVED'].includes(order.status) && (
                            <div className="animate-pulse">
                              <span className="text-3xl">
                                {order.status === 'EN_ROUTE' ? '🚛' : '📍'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Trip Timeline */}
                    {order.status !== 'PLACED' && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="flex items-center justify-between text-xs">
                          <div className={`flex flex-col items-center ${
                            ['PLACED', 'ASSIGNED_TO_TSP', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED'].includes(order.status) 
                              ? 'text-green-600' 
                              : 'text-gray-400'
                          }`}>
                            <div className="w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center mb-1">✓</div>
                            <span>Placed</span>
                          </div>
                          
                          <div className="flex-1 h-0.5 bg-gray-300 mx-2"></div>
                          
                          <div className={`flex flex-col items-center ${
                            ['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED'].includes(order.status) 
                              ? 'text-green-600' 
                              : 'text-gray-400'
                          }`}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center mb-1 ${
                              ['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED'].includes(order.status)
                                ? 'bg-green-600 text-white'
                                : 'bg-gray-300 text-gray-600'
                            }`}>
                              {['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED'].includes(order.status) ? '✓' : '2'}
                            </div>
                            <span>Assigned</span>
                          </div>
                          
                          <div className="flex-1 h-0.5 bg-gray-300 mx-2"></div>
                          
                          <div className={`flex flex-col items-center ${
                            ['EN_ROUTE', 'ARRIVED', 'COMPLETED'].includes(order.status) 
                              ? 'text-blue-600' 
                              : 'text-gray-400'
                          }`}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center mb-1 ${
                              ['EN_ROUTE', 'ARRIVED', 'COMPLETED'].includes(order.status)
                                ? order.status === 'EN_ROUTE' 
                                  ? 'bg-blue-600 text-white animate-pulse'
                                  : 'bg-green-600 text-white'
                                : 'bg-gray-300 text-gray-600'
                            }`}>
                              {['EN_ROUTE', 'ARRIVED', 'COMPLETED'].includes(order.status) ? '🚛' : '3'}
                            </div>
                            <span>En Route</span>
                          </div>
                          
                          <div className="flex-1 h-0.5 bg-gray-300 mx-2"></div>
                          
                          <div className={`flex flex-col items-center ${
                            ['ARRIVED', 'COMPLETED'].includes(order.status) 
                              ? 'text-blue-600' 
                              : 'text-gray-400'
                          }`}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center mb-1 ${
                              ['ARRIVED', 'COMPLETED'].includes(order.status)
                                ? order.status === 'ARRIVED'
                                  ? 'bg-blue-600 text-white animate-pulse'
                                  : 'bg-green-600 text-white'
                                : 'bg-gray-300 text-gray-600'
                            }`}>
                              {['ARRIVED', 'COMPLETED'].includes(order.status) ? '📍' : '4'}
                            </div>
                            <span>Arrived</span>
                          </div>
                          
                          <div className="flex-1 h-0.5 bg-gray-300 mx-2"></div>
                          
                          <div className={`flex flex-col items-center ${
                            order.status === 'COMPLETED' 
                              ? 'text-green-600' 
                              : 'text-gray-400'
                          }`}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center mb-1 ${
                              order.status === 'COMPLETED'
                                ? 'bg-green-600 text-white'
                                : 'bg-gray-300 text-gray-600'
                            }`}>
                              {order.status === 'COMPLETED' ? '✓' : '5'}
                            </div>
                            <span>Completed</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedOrder(order);
                        setShowDetailsModal(true);
                      }}
                      className="w-full mt-4 bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium py-2 rounded-lg transition-colors"
                    >
                      View Full Details →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Past Orders */}
          {pastOrders.length > 0 && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Past Orders ({pastOrders.length})
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                {pastOrders.map((order) => (
                  <div 
                    key={order.id} 
                    className="bg-white rounded-xl p-6 border border-gray-200 cursor-pointer hover:border-gray-300 transition-all"
                    onClick={() => {
                      setSelectedOrder(order);
                      setShowDetailsModal(true);
                    }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          Order #{order.id.slice(0, 8)}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <StatusBadge status={order.status} />
                    </div>

                    <div className="space-y-2 text-sm">
                      <p className="text-gray-700">
                        {order.volume?.toLocaleString()}L {order.fuelType}
                      </p>
                      <p className="text-gray-600">→ {order.destinationName}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {orders.length === 0 && (
            <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
              <span className="text-6xl mb-4 block">📦</span>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Orders Yet</h3>
              <p className="text-gray-600 mb-6">Place your first fuel order to get started</p>
              <button
                onClick={() => router.push('/client/orders/new')}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                + Place Order
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Details Modal */}
      {showDetailsModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold">Order Details</h3>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Order ID</p>
                <p className="font-semibold text-lg">#{selectedOrder.id}</p>
                <StatusBadge status={selectedOrder.status} />
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-2">Fuel Details</p>
                <p className="text-xl font-bold text-gray-900">
                  {selectedOrder.volume?.toLocaleString()}L {selectedOrder.fuelType}
                </p>
                {selectedOrder.isMixedLoad && selectedOrder.fuelBreakdown && (
                  <div className="mt-2 space-y-1">
                    {selectedOrder.fuelBreakdown.map((fuel: any, idx: number) => (
                      <p key={idx} className="text-sm text-gray-700">
                        • {fuel.volume.toLocaleString()}L {fuel.fuelType}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Destination</p>
                <p className="font-semibold text-gray-900">{selectedOrder.destinationName}</p>
                {selectedOrder.destinationAddress && (
                  <p className="text-sm text-gray-600 mt-1">{selectedOrder.destinationAddress}</p>
                )}
              </div>

              {selectedOrder.assignedDriverName && (
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <p className="text-sm text-blue-700 mb-2">Driver Information</p>
                  <p className="font-semibold text-blue-900">{selectedOrder.assignedDriverName}</p>
                  <p className="text-sm text-blue-800">📞 {selectedOrder.assignedDriverPhone}</p>
                  {selectedOrder.assignedTruckRegistration && (
                    <p className="text-sm text-blue-800">🚛 {selectedOrder.assignedTruckRegistration}</p>
                  )}
                </div>
              )}

              {selectedOrder.specialInstructions && (
                <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                  <p className="text-sm text-yellow-800 font-medium mb-1">Special Instructions</p>
                  <p className="text-sm text-yellow-900">{selectedOrder.specialInstructions}</p>
                </div>
              )}

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Order Placed</p>
                <p className="text-sm font-medium text-gray-900">
                  {new Date(selectedOrder.createdAt).toLocaleString()}
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowDetailsModal(false)}
              className="w-full mt-6 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-3 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
