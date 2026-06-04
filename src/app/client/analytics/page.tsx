'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser, getOrders, shortOrderId } from '@/src/lib/demo-data';

export default function ClientAnalyticsPage() {
  const router = useRouter();
  const [user, setUser]     = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [orders, setOrders]   = useState<any[]>([]);

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();
    setUser(currentUser);
    if (currentUser) loadOrders(currentUser);
  }, []);

  const loadOrders = (currentUser: any) => {
    const allOrders    = getOrders();
    const clientOrders = allOrders.filter((o: any) => o.clientId === currentUser.id);
    setOrders(clientOrders);
  };

  if (!mounted) return null;
  if (!user)            { router.push('/'); return null; }
  if (user.role !== 'CLIENT') { router.push('/'); return null; }

  // ── Analytics ─────────────────────────────────────────────
  const totalOrders        = orders.length;
  const completedOrders    = orders.filter(o => o.status === 'COMPLETED').length;
  const activeOrders       = orders.filter(o => !['COMPLETED', 'CANCELLED'].includes(o.status)).length;
  const cancelledOrders    = orders.filter(o => o.status === 'CANCELLED').length;
  const totalFuelOrdered   = orders.reduce((sum, o) => sum + (o.volume || 0), 0);
  const totalFuelDelivered = orders
    .filter(o => o.status === 'COMPLETED')
    .reduce((sum, o) => sum + (o.volume || 0), 0);

  const completionRate = totalOrders > 0 ? ((completedOrders / totalOrders) * 100).toFixed(1) : '0';
  const avgOrderSize   = totalOrders > 0 ? (totalFuelOrdered / totalOrders).toFixed(0) : '0';

  const fuelBreakdown = {
    DIESEL:  orders.filter(o => o.fuelType === 'DIESEL') .reduce((sum, o) => sum + (o.volume || 0), 0),
    PETROL:  orders.filter(o => o.fuelType === 'PETROL') .reduce((sum, o) => sum + (o.volume || 0), 0),
    PREMIUM: orders.filter(o => o.fuelType === 'PREMIUM').reduce((sum, o) => sum + (o.volume || 0), 0),
  };

  const thisMonth      = new Date().getMonth();
  const lastMonth      = thisMonth === 0 ? 11 : thisMonth - 1;
  const thisMonthOrders = orders.filter(o => new Date(o.createdAt).getMonth() === thisMonth).length;
  const lastMonthOrders = orders.filter(o => new Date(o.createdAt).getMonth() === lastMonth).length;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />

      <div className="flex-1">
        <Header user={user} />

        <main className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">My Analytics</h1>
            <p className="text-gray-600">Track your fuel ordering patterns and statistics</p>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
              <p className="text-blue-100 mb-1 text-sm">Total Orders</p>
              <p className="text-4xl font-bold mb-2">{totalOrders}</p>
              <p className="text-blue-100 text-xs">All time</p>
            </div>
            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
              <p className="text-green-100 mb-1 text-sm">Completed</p>
              <p className="text-4xl font-bold mb-2">{completedOrders}</p>
              <p className="text-green-100 text-xs">{completionRate}% success rate</p>
            </div>
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-6 text-white">
              <p className="text-orange-100 mb-1 text-sm">Active Orders</p>
              <p className="text-4xl font-bold mb-2">{activeOrders}</p>
              <p className="text-orange-100 text-xs">In progress</p>
            </div>
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white">
              <p className="text-purple-100 mb-1 text-sm">Total Fuel</p>
              <p className="text-4xl font-bold mb-2">{(totalFuelOrdered / 1000).toFixed(1)}K</p>
              <p className="text-purple-100 text-xs">Liters ordered</p>
            </div>
          </div>

          {/* Additional Stats */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Fuel Delivered</p>
              <p className="text-3xl font-bold text-gray-900 mb-2">
                {(totalFuelDelivered / 1000).toFixed(1)}K L
              </p>
              <p className="text-xs text-gray-500">From completed orders</p>
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Avg Order Size</p>
              <p className="text-3xl font-bold text-gray-900 mb-2">{avgOrderSize} L</p>
              <p className="text-xs text-gray-500">Per order</p>
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">This Month</p>
              <p className="text-3xl font-bold text-gray-900 mb-2">{thisMonthOrders}</p>
              <p className="text-xs text-gray-500">
                {thisMonthOrders > lastMonthOrders ? '📈' : thisMonthOrders < lastMonthOrders ? '📉' : '➡️'}{' '}
                vs {lastMonthOrders} last month
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* Fuel Type Distribution */}
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Fuel Type Distribution</h3>
              <div className="space-y-3">
                <FuelBar label="Diesel"  volume={fuelBreakdown.DIESEL}  total={totalFuelOrdered} color="blue"   />
                <FuelBar label="Petrol"  volume={fuelBreakdown.PETROL}  total={totalFuelOrdered} color="green"  />
                <FuelBar label="Premium" volume={fuelBreakdown.PREMIUM} total={totalFuelOrdered} color="purple" />
              </div>
            </div>

            {/* Order Status Breakdown */}
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Order Status</h3>
              <div className="space-y-3">
                <StatusBar label="Completed" count={completedOrders} total={totalOrders} color="green" />
                <StatusBar label="Active"    count={activeOrders}    total={totalOrders} color="blue"  />
                <StatusBar label="Cancelled" count={cancelledOrders} total={totalOrders} color="red"   />
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Orders</h3>
            {orders.length > 0 ? (
              <div className="space-y-2">
                {orders.slice(0, 10).map(order => (
                  <div key={order.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-sm">Order #{shortOrderId(order.id)}</p>
                      <p className="text-xs text-gray-600">
                        {order.volume?.toLocaleString()}L {order.fuelType} → {order.destinationName}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </p>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        order.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                        order.status === 'CANCELLED' ? 'bg-red-100 text-red-700'    :
                                                       'bg-blue-100 text-blue-700'
                      }`}>
                        {order.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <span className="text-6xl mb-4 block">📦</span>
                <p className="text-gray-600 mb-4">No orders yet</p>
                <button
                  onClick={() => router.push('/client/orders/new')}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
                >
                  Place Your First Order
                </button>
              </div>
            )}
          </div>

          {/* Insights */}
          {totalOrders > 0 && (
            <div className="mt-8 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6 border border-blue-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">💡 Insights</h3>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div className="bg-white rounded-lg p-4">
                  <p className="font-medium text-gray-900 mb-1">Most Ordered Fuel</p>
                  <p className="text-gray-600">
                    {fuelBreakdown.DIESEL > fuelBreakdown.PETROL && fuelBreakdown.DIESEL > fuelBreakdown.PREMIUM
                      ? 'Diesel'
                      : fuelBreakdown.PETROL > fuelBreakdown.PREMIUM
                      ? 'Petrol'
                      : 'Premium'}{' '}
                    ({Math.max(fuelBreakdown.DIESEL, fuelBreakdown.PETROL, fuelBreakdown.PREMIUM).toLocaleString()}L)
                  </p>
                </div>
                <div className="bg-white rounded-lg p-4">
                  <p className="font-medium text-gray-900 mb-1">Delivery Success Rate</p>
                  <p className="text-gray-600">{completionRate}% of orders completed successfully</p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

type StatusColor = 'green' | 'blue' | 'red';
type FuelColor   = 'blue' | 'green' | 'purple';

function StatusBar({
  label, count, total, color,
}: {
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

function FuelBar({
  label, volume, total, color,
}: {
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