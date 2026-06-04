'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser, getTrucks, getOrders, getWorkspaces, getUsers } from '@/src/lib/demo-data';

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const [user,       setUser]       = useState<any>(null);
  const [mounted,    setMounted]    = useState(false);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [users,      setUsers]      = useState<any[]>([]);
  const [trucks,     setTrucks]     = useState<any[]>([]);
  const [orders,     setOrders]     = useState<any[]>([]);

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();
    setUser(currentUser);
    if (currentUser) loadData();
  }, []);

  const loadData = () => {
    setWorkspaces(getWorkspaces());
    setUsers(getUsers());
    setTrucks(getTrucks());
    setOrders(getOrders());
  };

  if (!mounted) return null;
  if (!user)                        { router.push('/'); return null; }
  if (user.role !== 'PLATFORM_ADMIN') { router.push('/'); return null; }

  // ── Analytics ──────────────────────────────────────────────
  const totalWorkspaces  = workspaces.length;
  const activeWorkspaces = workspaces.filter(w => w.status === 'ACTIVE').length;
  const totalUsers       = users.length;

  const usersByRole = {
    PLATFORM_ADMIN:  users.filter(u => u.role === 'PLATFORM_ADMIN').length,
    SELLER_MANAGER:  users.filter(u => u.role === 'SELLER_MANAGER').length,
    TRANSPORT_ADMIN: users.filter(u => u.role === 'TRANSPORT_ADMIN').length,
    CLIENT:          users.filter(u => u.role === 'CLIENT').length,
    DRIVER:          users.filter(u => u.role === 'DRIVER').length,
  };

  const totalTrucks   = trucks.length;
  const idleTrucks    = trucks.filter(t => t.status === 'IDLE').length;
  const activeTrucks  = trucks.filter(t => ['EN_ROUTE', 'ASSIGNED'].includes(t.status)).length;
  const pendingTrucks = trucks.filter(t => t.status === 'PENDING_INTEGRATION').length;

  const totalOrders     = orders.length;
  const completedOrders = orders.filter(o => o.status === 'COMPLETED').length;
  const activeOrders    = orders.filter(o => !['COMPLETED', 'CANCELLED'].includes(o.status)).length;
  const cancelledOrders = orders.filter(o => o.status === 'CANCELLED').length;

  const totalFuelOrdered   = orders.reduce((sum, o) => sum + (o.volume || 0), 0);
  const totalFuelDelivered = orders
    .filter(o => o.status === 'COMPLETED')
    .reduce((sum, o) => sum + (o.volume || 0), 0);

  const totalCapacity  = trucks.reduce((sum, t) => sum + (t.capacity || 0), 0);
  const completionRate = totalOrders > 0 ? ((completedOrders / totalOrders) * 100).toFixed(1) : '0';
  const utilizationRate = totalTrucks > 0 ? ((activeTrucks / totalTrucks) * 100).toFixed(1) : '0';

  const fuelBreakdown = {
    DIESEL:  orders.filter(o => o.fuelType === 'DIESEL') .reduce((sum, o) => sum + (o.volume || 0), 0),
    PETROL:  orders.filter(o => o.fuelType === 'PETROL') .reduce((sum, o) => sum + (o.volume || 0), 0),
    PREMIUM: orders.filter(o => o.fuelType === 'PREMIUM').reduce((sum, o) => sum + (o.volume || 0), 0),
  };

  const ordersByWorkspace = workspaces.map(ws => ({
    workspace:      ws,
    orderCount:     orders.filter(o => o.workspaceId === ws.id).length,
    completedCount: orders.filter(o => o.workspaceId === ws.id && o.status === 'COMPLETED').length,
  })).sort((a, b) => b.orderCount - a.orderCount);

  const tspPerformance = users
    .filter(u => u.role === 'TRANSPORT_ADMIN')
    .map(tsp => {
      const tspTrucks   = trucks.filter(t => t.tspId === tsp.id);
      const tspTruckIds = tspTrucks.map(t => t.id);
      const tspOrders   = orders.filter(o => o.assignedTruckId && tspTruckIds.includes(o.assignedTruckId));
      const completed   = tspOrders.filter(o => o.status === 'COMPLETED').length;
      return { tsp, truckCount: tspTrucks.length, totalOrders: tspOrders.length, completedOrders: completed };
    })
    .filter(p => p.totalOrders > 0)
    .sort((a, b) => b.completedOrders - a.completedOrders)
    .slice(0, 5);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />

      <div className="flex-1">
        <Header user={user} />

        <main className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Platform Analytics</h1>
            <p className="text-gray-600">Comprehensive insights across the entire platform</p>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
              <p className="text-blue-100 mb-1 text-sm">Total Workspaces</p>
              <p className="text-4xl font-bold mb-2">{totalWorkspaces}</p>
              <p className="text-blue-100 text-xs">{activeWorkspaces} active</p>
            </div>
            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
              <p className="text-green-100 mb-1 text-sm">Total Users</p>
              <p className="text-4xl font-bold mb-2">{totalUsers}</p>
              <p className="text-green-100 text-xs">Across all roles</p>
            </div>
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-6 text-white">
              <p className="text-orange-100 mb-1 text-sm">Total Trucks</p>
              <p className="text-4xl font-bold mb-2">{totalTrucks}</p>
              <p className="text-orange-100 text-xs">{utilizationRate}% utilized</p>
            </div>
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white">
              <p className="text-purple-100 mb-1 text-sm">Total Orders</p>
              <p className="text-4xl font-bold mb-2">{totalOrders}</p>
              <p className="text-purple-100 text-xs">{completionRate}% completed</p>
            </div>
          </div>

          {/* Additional Stats */}
          <div className="grid md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Fuel Delivered</p>
              <p className="text-3xl font-bold text-gray-900 mb-2">
                {(totalFuelDelivered / 1000).toFixed(1)}K L
              </p>
              <p className="text-xs text-gray-500">From {completedOrders} orders</p>
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Fleet Capacity</p>
              <p className="text-3xl font-bold text-gray-900 mb-2">
                {(totalCapacity / 1000).toFixed(1)}K L
              </p>
              <p className="text-xs text-gray-500">Total across all trucks</p>
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Active Orders</p>
              <p className="text-3xl font-bold text-gray-900 mb-2">{activeOrders}</p>
              <p className="text-xs text-gray-500">In progress now</p>
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">TSPs</p>
              <p className="text-3xl font-bold text-gray-900 mb-2">{usersByRole.TRANSPORT_ADMIN}</p>
              <p className="text-xs text-gray-500">Transport providers</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* User Distribution */}
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Users by Role</h3>
              <div className="space-y-3">
                <RoleBar label="Admins"              count={usersByRole.PLATFORM_ADMIN}  total={totalUsers} color="red"    />
                <RoleBar label="Sellers"             count={usersByRole.SELLER_MANAGER}  total={totalUsers} color="blue"   />
                <RoleBar label="Transport Providers" count={usersByRole.TRANSPORT_ADMIN} total={totalUsers} color="green"  />
                <RoleBar label="Clients"             count={usersByRole.CLIENT}          total={totalUsers} color="purple" />
                <RoleBar label="Drivers"             count={usersByRole.DRIVER}          total={totalUsers} color="orange" />
              </div>
            </div>

            {/* Fuel Type Distribution */}
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Fuel Delivered by Type</h3>
              {totalFuelDelivered > 0 ? (
                <div className="space-y-3">
                  <FuelBar label="Diesel"  volume={fuelBreakdown.DIESEL}  total={totalFuelDelivered} color="blue"   />
                  <FuelBar label="Petrol"  volume={fuelBreakdown.PETROL}  total={totalFuelDelivered} color="green"  />
                  <FuelBar label="Premium" volume={fuelBreakdown.PREMIUM} total={totalFuelDelivered} color="purple" />
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-8">No deliveries completed yet</p>
              )}
            </div>
          </div>

          {/* Fleet Status */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 mb-8">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Fleet Status Overview</h3>
            <div className="grid md:grid-cols-4 gap-6">
              <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
                <p className="text-3xl font-bold text-green-600 mb-1">{idleTrucks}</p>
                <p className="text-sm text-gray-600">Idle</p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-3xl font-bold text-blue-600 mb-1">{activeTrucks}</p>
                <p className="text-sm text-gray-600">Active</p>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded-lg border border-orange-200">
                <p className="text-3xl font-bold text-orange-600 mb-1">{pendingTrucks}</p>
                <p className="text-sm text-gray-600">Pending Setup</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-3xl font-bold text-gray-900 mb-1">{utilizationRate}%</p>
                <p className="text-sm text-gray-600">Utilization</p>
              </div>
            </div>
          </div>

          {/* Workspace Performance */}
          {ordersByWorkspace.length > 0 && (
            <div className="bg-white rounded-xl p-6 border border-gray-200 mb-8">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Workspace Performance</h3>
              <div className="space-y-3">
                {ordersByWorkspace.map(ws => (
                  <div key={ws.workspace.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-semibold text-gray-900">{ws.workspace.name}</p>
                      <p className="text-sm text-gray-600">{ws.workspace.country}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-blue-600">{ws.orderCount}</p>
                      <p className="text-xs text-gray-500">{ws.completedCount} completed</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Performing TSPs */}
          {tspPerformance.length > 0 && (
            <div className="bg-white rounded-xl p-6 border border-gray-200 mb-8">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Top Transport Providers</h3>
              <div className="space-y-3">
                {tspPerformance.map((perf, index) => (
                  <div key={perf.tsp.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-4">
                      <span className="text-2xl font-bold text-gray-400">#{index + 1}</span>
                      <div>
                        <p className="font-semibold text-gray-900">{perf.tsp.companyName || perf.tsp.name}</p>
                        <p className="text-sm text-gray-600">{perf.truckCount} trucks</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-blue-600">{perf.completedOrders}</p>
                      <p className="text-xs text-gray-500">Completed deliveries</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Order Status Breakdown */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 mb-8">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Order Status Distribution</h3>
            <div className="space-y-3">
              <StatusBar label="Completed" count={completedOrders} total={totalOrders} color="green" />
              <StatusBar label="Active"    count={activeOrders}    total={totalOrders} color="blue"  />
              <StatusBar label="Cancelled" count={cancelledOrders} total={totalOrders} color="red"   />
            </div>
          </div>

          {/* Platform Insights */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6 border border-blue-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4">💡 Platform Insights</h3>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div className="bg-white rounded-lg p-4">
                <p className="font-medium text-gray-900 mb-1">Avg Orders per Workspace</p>
                <p className="text-2xl font-bold text-blue-600">
                  {totalWorkspaces > 0 ? (totalOrders / totalWorkspaces).toFixed(1) : '0'}
                </p>
              </div>
              <div className="bg-white rounded-lg p-4">
                <p className="font-medium text-gray-900 mb-1">Most Delivered Fuel</p>
                <p className="text-2xl font-bold text-green-600">
                  {fuelBreakdown.DIESEL > fuelBreakdown.PETROL && fuelBreakdown.DIESEL > fuelBreakdown.PREMIUM
                    ? 'Diesel'
                    : fuelBreakdown.PETROL > fuelBreakdown.PREMIUM
                    ? 'Petrol'
                    : 'Premium'}
                </p>
              </div>
              <div className="bg-white rounded-lg p-4">
                <p className="font-medium text-gray-900 mb-1">Success Rate</p>
                <p className="text-2xl font-bold text-purple-600">{completionRate}%</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────
type StatusColor = 'green' | 'blue' | 'red';
type FuelColor   = 'blue' | 'green' | 'purple';
type RoleColor   = 'red' | 'blue' | 'green' | 'purple' | 'orange';

// ── StatusBar ─────────────────────────────────────────────────
function StatusBar({ label, count, total, color }: {
  label: string;
  count: number;
  total: number;
  color: StatusColor;
}) {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  const colorClasses: Record<StatusColor, string> = {
    green: 'bg-green-500',
    blue:  'bg-blue-500',
    red:   'bg-red-500',
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm text-gray-600">{count} ({percentage.toFixed(0)}%)</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${colorClasses[color]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// ── FuelBar ───────────────────────────────────────────────────
function FuelBar({ label, volume, total, color }: {
  label: string;
  volume: number;
  total: number;
  color: FuelColor;
}) {
  const percentage = total > 0 ? (volume / total) * 100 : 0;
  const colorClasses: Record<FuelColor, string> = {
    blue:   'bg-blue-500',
    green:  'bg-green-500',
    purple: 'bg-purple-500',
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm text-gray-600">
          {volume.toLocaleString()}L ({percentage.toFixed(0)}%)
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${colorClasses[color]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// ── RoleBar ───────────────────────────────────────────────────
function RoleBar({ label, count, total, color }: {
  label: string;
  count: number;
  total: number;
  color: RoleColor;
}) {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  const colorClasses: Record<RoleColor, string> = {
    red:    'bg-red-500',
    blue:   'bg-blue-500',
    green:  'bg-green-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm text-gray-600">{count} ({percentage.toFixed(0)}%)</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${colorClasses[color]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}