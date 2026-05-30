'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import StatusBadge from '@/src/components/workflow/StatusBadge';
import { getCurrentUser, setCurrentUser, getUsers, getOrders, updateOrder, addNotification, shortOrderId } from '@/src/lib/demo-data';
import { DRIVER_POOL } from '@/src/lib/driver-pool';

export default function AssignTransporterPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.orderId as string;
  
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [transporters, setTransporters] = useState<any[]>([]);
  const [selectedTransporter, setSelectedTransporter] = useState<string>('');

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();
    setUser(currentUser);
    
    if (!currentUser || currentUser.role !== 'SELLER_MANAGER') {
      router.push('/');
      return;
    }
    
    loadData(currentUser);
  }, [orderId]);

  const loadData = (currentUser: any) => {
    const orders = getOrders();
    const foundOrder = orders.find(o => o.id === orderId);
    setOrder(foundOrder);

    // Get all transport admins who have drivers
    const users = getUsers();
    const allTransporters = users.filter(u => u.role === 'TRANSPORT_ADMIN');
    
    // Filter transporters who have selected drivers
    const storedPool = localStorage.getItem('driver_pool');
    const pool = storedPool ? JSON.parse(storedPool) : DRIVER_POOL;
    
    const transportersWithDrivers = allTransporters.map(t => {
      const driverCount = pool.filter((d: any) => d.transporterId === t.id).length;
      return { ...t, driverCount };
    }).filter(t => t.driverCount > 0);

    setTransporters(transportersWithDrivers);
  };

  const handleRoleChange = (userId: string) => {
    const users = getUsers();
    const newUser = users.find(u => u.id === userId);
    if (newUser) {
      setUser(newUser);
      setCurrentUser(newUser);
      router.push('/seller/dashboard');
    }
  };

  const handleAssignTransporter = () => {
    if (!selectedTransporter) {
      alert('Please select a transporter');
      return;
    }

    const transporter = transporters.find(t => t.id === selectedTransporter);
    
    // Update order with transporter assignment
 updateOrder(orderId, {
  status:              'ASSIGNED_TO_TSP',
  assignedTSPId:       selectedTransporter,        // ← was transporterId
  assignedDriverName:  `${transporter.firstName} ${transporter.lastName}`, // ← was transporterName
  workspaceId:         transporter.workspaceId,
  assignedToTspAt:     new Date(),
});

    // Notify transporter
    addNotification({
      id: `notif-${Date.now()}`,
      userId: selectedTransporter,
      type: 'ORDER_ASSIGNED',
      title: '📦 New Order Assigned',
      message: `You have been assigned order #${shortOrderId(orderId)}. Please assign driver and truck.`,
      read: false,
      createdAt: new Date(),
    });

    // Notify client
    if (order?.clientId) {
      addNotification({
        id: `notif-${Date.now()}-client`,
        userId: order.clientId,
        type: 'ORDER_PROGRESS',
        title: '🚛 Transporter Assigned',
        message: `Your order #${shortOrderId(orderId)} has been assigned to a transporter`,
        read: false,
        createdAt: new Date(),
      });
    }

    alert(`✅ Order assigned to ${transporter.firstName} ${transporter.lastName}!`);
    router.push('/seller/orders');
  };

  if (!mounted || !user || !order) return null;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />
      
      <div className="flex-1">
        <Header user={user} />
        
        <main className="p-8">
          <button
            onClick={() => router.push('/seller/orders')}
            className="text-blue-600 hover:text-blue-700 mb-6"
          >
            ← Back to Orders
          </button>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Assign Transporter</h1>
            <p className="text-gray-600">Select a transport provider for this order</p>
          </div>

          {/* Order Details */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 mb-8">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Order Details</h2>
                <p className="text-sm text-gray-600">Order #{shortOrderId(order.id)}</p>
              </div>
              <StatusBadge status={order.status} />
            </div>

            <div className="grid md:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-gray-600">Fuel Type</p>
                <p className="font-semibold text-lg">{order.fuelType}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Volume</p>
                <p className="font-semibold text-lg">{order.volume}L</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Destination</p>
                <p className="font-semibold text-lg">{order.destinationName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Address</p>
                <p className="font-semibold text-sm">{order.destinationAddress}</p>
              </div>
            </div>
          </div>

          {/* Transporter Selection */}
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Available Transporters ({transporters.length})
            </h2>

            {transporters.length > 0 ? (
              <div className="space-y-4">
                {transporters.map((transporter) => (
                  <button
                    key={transporter.id}
                    onClick={() => setSelectedTransporter(transporter.id)}
                    className={`w-full text-left p-6 border-2 rounded-xl transition-all ${
                      selectedTransporter === transporter.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-3xl">
                          🚛
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-gray-900 mb-1">
                            {transporter.firstName} {transporter.lastName}
                          </h3>
                          <p className="text-sm text-gray-600">{transporter.email}</p>
                          <p className="text-sm text-gray-600">
                            Workspace: {transporter.workspaceId}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-medium mb-2">
                          {transporter.driverCount} Drivers
                        </div>
                        {selectedTransporter === transporter.id && (
                          <span className="text-blue-600 text-3xl">✓</span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}

                {selectedTransporter && (
                  <button
                    onClick={handleAssignTransporter}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-lg transition-colors text-lg mt-6"
                  >
                    ✓ Assign to Selected Transporter
                  </button>
                )}
              </div>
            ) : (
              <div className="text-center py-12">
                <span className="text-6xl mb-4 block">🚫</span>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No Transporters Available</h3>
                <p className="text-gray-600 mb-6">
                  No transport providers have drivers registered yet
                </p>
                <button
                  onClick={() => router.push('/seller/invite-tsp')}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg transition-colors"
                >
                  Invite Transport Providers →
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
