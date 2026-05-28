'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { 
  getCurrentUser, 
  setCurrentUser, 
  getUsers, 
  getWorkspaces, 
  getTrucks, 
  getOrders,
  getSensorRequests 
} from '@/src/lib/demo-data';

export default function PlatformAdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState({
    workspaces: 0,
    users: 0,
    trucks: 0,
    orders: 0,
    pendingSensorRequests: 0,
  });

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();
    setUser(currentUser);
    
    if (currentUser) {
      loadStats();
    }
  }, []);

  // Auto-refresh every 3 seconds
  useEffect(() => {
    if (!user) return;
    
    const interval = setInterval(() => {
      loadStats();
    }, 3000);

    return () => clearInterval(interval);
  }, [user]);

  const loadStats = () => {
    const workspaces = getWorkspaces();
    const users = getUsers();
    const trucks = getTrucks();
    const orders = getOrders();
    const sensorRequests = getSensorRequests();
    
    const pendingRequests = sensorRequests.filter(r => r.status === 'PENDING_MANAGER_REVIEW');

    setStats({
      workspaces: workspaces.length,
      users: users.length,
      trucks: trucks.length,
      orders: orders.length,
      pendingSensorRequests: pendingRequests.length,
    });

    console.log('Dashboard stats updated:', {
      totalSensorRequests: sensorRequests.length,
      pendingRequests: pendingRequests.length,
    });
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
    loadStats();
    alert('✅ Dashboard refreshed!');
  };

  if (!mounted) return null;
  
  if (!user) {
    router.push('/');
    return null;
  }
  
  if (user.role !== 'PLATFORM_ADMIN') {
    router.push('/');
    return null;
  }

  // Get actual pending sensor requests for display
  const sensorRequests = getSensorRequests();
  const pendingSensorRequests = sensorRequests.filter(r =>
  r.status === 'PENDING_MANAGER_REVIEW' || r.status === 'FORWARDED_TO_ADMIN'
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
                Platform Dashboard
              </h1>
              <p className="text-gray-600">
                Overview of the entire platform
              </p>
            </div>
            <button
              onClick={handleRefresh}
              className="bg-blue-100 hover:bg-blue-200 text-blue-700 font-medium px-4 py-2 rounded-lg transition-colors"
            >
              🔄 Refresh
            </button>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-5 gap-6 mb-8">
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Workspaces</p>
              <p className="text-3xl font-bold text-gray-900">{stats.workspaces}</p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Users</p>
              <p className="text-3xl font-bold text-gray-900">{stats.users}</p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Trucks</p>
              <p className="text-3xl font-bold text-gray-900">{stats.trucks}</p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Orders</p>
              <p className="text-3xl font-bold text-gray-900">{stats.orders}</p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-orange-200 bg-orange-50">
              <p className="text-sm text-orange-600 mb-1">Pending Sensors</p>
              <p className="text-3xl font-bold text-orange-600">{stats.pendingSensorRequests}</p>
            </div>
          </div>

          {/* Pending Sensor Integration Tickets */}
          {pendingSensorRequests.length > 0 && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Pending Sensor Integration Tickets ({pendingSensorRequests.length})
              </h2>
              <div className="space-y-4">
                {pendingSensorRequests.map((request) => (
                  <div 
                    key={request.id}
                    className="bg-white rounded-xl p-6 border-2 border-orange-200 cursor-pointer hover:border-orange-300 transition-all"
                    onClick={() => router.push('/platform-admin/sensor-integration')}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">
                          Sensor Integration - {request.truckRegistration}
                        </h3>
                        <p className="text-sm text-gray-600">
                          Created: {request.requestedAt.toLocaleDateString()}
                        </p>
                      </div>
                      <span className="px-3 py-1 bg-orange-100 text-orange-700 text-sm font-medium rounded-full">
                        PENDING
                      </span>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm text-gray-700 mb-2">
                        Request for sensor integration and QR code generation for truck {request.truckRegistration}
                      </p>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Truck:</span>
                          <span className="font-semibold ml-2">{request.truckRegistration}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Driver:</span>
                          <span className="font-semibold ml-2">{request.driverName}</span>
                        </div>
                       <div>
  <span className="text-gray-600">Transporter:</span>
  <span className="font-semibold ml-2">{request.transporterName}</span>
</div>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push('/platform-admin/sensor-integration');
                      }}
                      className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors"
                    >
                      Review & Integrate →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="grid md:grid-cols-3 gap-6">
            <button
              onClick={() => router.push('/platform-admin/sensor-integration')}
              className="bg-white rounded-xl p-6 border-2 border-gray-200 hover:border-blue-300 transition-all text-left"
            >
              <span className="text-3xl mb-3 block">📡</span>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Sensor Integration</h3>
              <p className="text-sm text-gray-600">
                {stats.pendingSensorRequests > 0 
                  ? `${stats.pendingSensorRequests} pending request(s)`
                  : 'No pending requests'
                }
              </p>
            </button>

            <button
              onClick={() => router.push('/platform-admin/trucks')}
              className="bg-white rounded-xl p-6 border-2 border-gray-200 hover:border-blue-300 transition-all text-left"
            >
              <span className="text-3xl mb-3 block">🚛</span>
              <h3 className="text-lg font-bold text-gray-900 mb-1">All Trucks</h3>
              <p className="text-sm text-gray-600">
                Manage {stats.trucks} truck(s)
              </p>
            </button>

            <button
              onClick={() => router.push('/platform-admin/analytics')}
              className="bg-white rounded-xl p-6 border-2 border-gray-200 hover:border-blue-300 transition-all text-left"
            >
              <span className="text-3xl mb-3 block">📊</span>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Analytics</h3>
              <p className="text-sm text-gray-600">
                View platform insights
              </p>
            </button>
          </div>

          {/* No Pending Requests Message */}
          {pendingSensorRequests.length === 0 && (
            <div className="mt-8 bg-green-50 rounded-lg p-6 border border-green-200">
              <p className="text-green-800 font-medium">
                ✅ All caught up! No pending sensor integration requests.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
