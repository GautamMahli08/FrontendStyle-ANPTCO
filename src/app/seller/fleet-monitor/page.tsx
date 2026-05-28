'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import StatusBadge from '@/src/components/workflow/StatusBadge';
import { getCurrentUser, setCurrentUser, getUsers, getTrucks, getOrders } from '@/src/lib/demo-data';

export default function FleetMonitorPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [trucks, setTrucks] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedTruck, setSelectedTruck] = useState<any>(null);

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();
    setUser(currentUser);
    
    if (currentUser) {
      loadData(currentUser);
    }
  }, []);

  const loadData = (currentUser: any) => {
    const allTrucks = getTrucks();
    const allOrders = getOrders();
    
    setTrucks(allTrucks);
    setOrders(allOrders.filter(o => o.workspaceId === currentUser?.workspaceId));
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

  if (!mounted) return null;
  
  if (!user) {
    router.push('/');
    return null;
  }
  
  if (user.role !== 'SELLER_MANAGER') {
    router.push('/');
    return null;
  }

  const activeTrucks = trucks.filter(t => ['EN_ROUTE', 'ASSIGNED'].includes(t.status));
  const idleTrucks = trucks.filter(t => t.status === 'IDLE');

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />
      
      <div className="flex-1">
        <Header user={user} />
        
        <main className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Fleet Monitor 🗺️</h1>
            <p className="text-gray-600">Real-time tracking of all trucks in the system</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Total Trucks</p>
              <p className="text-3xl font-bold text-gray-900">{trucks.length}</p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Active</p>
              <p className="text-3xl font-bold text-blue-600">{activeTrucks.length}</p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Idle</p>
              <p className="text-3xl font-bold text-green-600">{idleTrucks.length}</p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Active Deliveries</p>
              <p className="text-3xl font-bold text-orange-600">
                {orders.filter(o => ['EN_ROUTE', 'ARRIVED'].includes(o.status)).length}
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Map View */}
            <div className="md:col-span-2 bg-white rounded-xl border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">Live Map View</h2>
              </div>
              <div className="p-6">
                <div className="bg-gray-100 rounded-lg flex items-center justify-center" style={{ height: '500px' }}>
                  <div className="text-center">
                    <div className="text-6xl mb-4">🗺️</div>
                    <p className="text-gray-600 font-medium">Interactive Map</p>
                    <p className="text-sm text-gray-500 mt-2">
                      Showing {activeTrucks.length} active truck{activeTrucks.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Truck List */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">Active Trucks</h2>
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: '500px' }}>
                {activeTrucks.length > 0 ? (
                  <div className="divide-y divide-gray-200">
                    {activeTrucks.map((truck) => {
                      const order = orders.find(o => o.assignedTruckId === truck.id && !['COMPLETED', 'CANCELLED'].includes(o.status));
                      
                      return (
                        <button
                          key={truck.id}
                          onClick={() => setSelectedTruck(truck)}
                          className={`w-full text-left p-4 hover:bg-blue-50 transition-colors ${
                            selectedTruck?.id === truck.id ? 'bg-blue-50' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="font-semibold text-gray-900">{truck.registrationNumber}</p>
                              <p className="text-xs text-gray-600">{truck.driverName}</p>
                            </div>
                            <StatusBadge status={truck.status} />
                          </div>
                          {order && (
                            <div className="bg-gray-50 rounded p-2 text-xs">
                              <p className="text-gray-700">
                                Order #{order.id.slice(0, 8)}
                              </p>
                              <p className="text-gray-600">
                                {order.volume}L {order.fuelType}
                              </p>
                              <p className="text-gray-600">
                                → {order.destinationName}
                              </p>
                            </div>
                          )}
                          <div className="text-xs text-gray-500 mt-2">
                            📍 {truck.currentLat?.toFixed(4)}, {truck.currentLng?.toFixed(4)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-12 text-center">
                    <span className="text-4xl mb-2 block">🚛</span>
                    <p className="text-sm text-gray-600">No active trucks</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Idle Trucks */}
          {idleTrucks.length > 0 && (
            <div className="mt-8 bg-white rounded-xl border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">Idle Trucks ({idleTrucks.length})</h2>
              </div>
              <div className="p-6">
                <div className="grid md:grid-cols-3 gap-4">
                  {idleTrucks.map((truck) => (
                    <div key={truck.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-gray-900">{truck.registrationNumber}</p>
                          <p className="text-sm text-gray-600">{truck.driverName}</p>
                        </div>
                        <StatusBadge status={truck.status} />
                      </div>
                      <div className="text-xs text-gray-500">
                        📍 {truck.currentLat?.toFixed(4)}, {truck.currentLng?.toFixed(4)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Selected Truck Details */}
          {selectedTruck && (
            <div className="fixed bottom-4 right-4 bg-white rounded-xl shadow-2xl p-6 border-2 border-blue-500 w-96 z-50">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{selectedTruck.registrationNumber}</h3>
                  <p className="text-sm text-gray-600">{selectedTruck.driverName}</p>
                </div>
                <button
                  onClick={() => setSelectedTruck(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-gray-600">Status</p>
                  <StatusBadge status={selectedTruck.status} />
                </div>
                <div>
                  <p className="text-gray-600">Driver Phone</p>
                  <p className="font-medium">{selectedTruck.driverPhone}</p>
                </div>
                <div>
                  <p className="text-gray-600">Compartments</p>
                  <p className="font-medium">{selectedTruck.compartments?.length || 0}</p>
                </div>
                <div>
                  <p className="text-gray-600">Current Location</p>
                  <p className="font-mono text-xs">
                    {selectedTruck.currentLat?.toFixed(6)}, {selectedTruck.currentLng?.toFixed(6)}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    // Center map on truck (future implementation)
                    alert(`Centering map on ${selectedTruck.registrationNumber}`);
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors"
                >
                  📍 Center on Map
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
