'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser, getOrders, getTrucks, shortOrderId } from '@/src/lib/demo-data';

// ── Types ─────────────────────────────────────────────────────
type BarColor = 'green' | 'blue' | 'yellow' | 'red' | 'purple';

interface StatusBarProps {
  label: string;
  count: number;
  total: number;
  color: BarColor;
}

export default function SellerAnalyticsPage() {
  const router = useRouter();
  const [user,    setUser]    = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [orders,  setOrders]  = useState<any[]>([]);
  const [trucks,  setTrucks]  = useState<any[]>([]);

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();
    setUser(currentUser);
    if (currentUser) loadData(currentUser);
  }, []);

  const loadData = (currentUser: any) => {
    const allOrders = getOrders();
    const allTrucks = getTrucks();
    setOrders(allOrders.filter((o: any) => o.workspaceId === currentUser?.workspaceId));
    setTrucks(allTrucks);
  };

  if (!mounted) return null;
  if (!user)                           { router.push('/'); return null; }
  if (user.role !== 'SELLER_MANAGER')  { router.push('/'); return null; }

  // ── Derived ───────────────────────────────────────────────
  const totalOrders        = orders.length;
  const completedOrders    = orders.filter(o => o.status === 'COMPLETED').length;
  const activeOrders       = orders.filter(o => !['COMPLETED', 'CANCELLED'].includes(o.status)).length;
  const cancelledOrders    = orders.filter(o => o.status === 'CANCELLED').length;
  const pendingOrders      = orders.filter(o => o.status === 'PLACED').length;
  const totalFuelDelivered = orders
    .filter(o => o.status === 'COMPLETED')
    .reduce((sum: number, o: any) => sum + (o.volume || 0), 0);
  const completionRate = totalOrders > 0 ? ((completedOrders / totalOrders) * 100).toFixed(1) : '0';

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />

      <div className="flex-1">
        <Header user={user} />

        <main className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Analytics & Reports 📊</h1>
            <p className="text-gray-600">Performance metrics and insights</p>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            {[
              { label: 'Total Orders',  value: totalOrders,                        sub: 'All time',                      from: 'from-blue-500',   to: 'to-blue-600',   text: 'text-blue-100'   },
              { label: 'Completed',     value: completedOrders,                    sub: `${completionRate}% completion`, from: 'from-green-500',  to: 'to-green-600',  text: 'text-green-100'  },
              { label: 'Active Orders', value: activeOrders,                       sub: 'In progress',                   from: 'from-orange-500', to: 'to-orange-600', text: 'text-orange-100' },
              { label: 'Total Fuel',    value: `${(totalFuelDelivered/1000).toFixed(1)}K`, sub: 'Liters delivered',       from: 'from-purple-500', to: 'to-purple-600', text: 'text-purple-100' },
            ].map(m => (
              <div key={m.label} className={`bg-gradient-to-br ${m.from} ${m.to} rounded-xl p-6 text-white`}>
                <p className={`${m.text} mb-1 text-sm`}>{m.label}</p>
                <p className="text-4xl font-bold mb-2">{m.value}</p>
                <p className={`${m.text} text-xs`}>{m.sub}</p>
              </div>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* Order Status Distribution */}
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Order Status Distribution</h3>
              <div className="space-y-3">
                <StatusBar label="Completed" count={completedOrders} total={totalOrders} color="green"  />
                <StatusBar label="Active"    count={activeOrders}    total={totalOrders} color="blue"   />
                <StatusBar label="Pending"   count={pendingOrders}   total={totalOrders} color="yellow" />
                <StatusBar label="Cancelled" count={cancelledOrders} total={totalOrders} color="red"    />
              </div>
            </div>

            {/* Fuel Type Breakdown */}
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Fuel Type Breakdown</h3>
              <div className="space-y-3">
                {(['DIESEL', 'PETROL', 'PREMIUM'] as const).map(fuelType => (
                  <StatusBar
                    key={fuelType}
                    label={fuelType}
                    count={orders.filter(o => o.fuelType === fuelType).length}
                    total={totalOrders}
                    color="blue"
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Fleet Statistics */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 mb-8">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Fleet Statistics</h3>
            <div className="grid md:grid-cols-4 gap-6">
              {[
                { label: 'Total Trucks',  value: trucks.length,                                                  bg: 'bg-gray-50',   color: 'text-gray-900'   },
                { label: 'Available',     value: trucks.filter(t => t.status === 'IDLE').length,                 bg: 'bg-green-50',  color: 'text-green-600'  },
                { label: 'En Route',      value: trucks.filter(t => t.status === 'EN_ROUTE').length,             bg: 'bg-blue-50',   color: 'text-blue-600'   },
                { label: 'Pending Setup', value: trucks.filter(t => t.status === 'PENDING_INTEGRATION').length,  bg: 'bg-orange-50', color: 'text-orange-600' },
              ].map(s => (
                <div key={s.label} className={`text-center p-4 ${s.bg} rounded-lg`}>
                  <p className={`text-3xl font-bold ${s.color} mb-1`}>{s.value}</p>
                  <p className="text-sm text-gray-600">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Orders */}
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Orders</h3>
            <div className="space-y-2">
              {orders.slice(0, 10).map(order => (
                <div key={order.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-sm">Order #{shortOrderId(order.id)}</p>
                    <p className="text-xs text-gray-600">
                      {order.volume}L {order.fuelType} → {order.destinationName}
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
              {orders.length === 0 && (
                <p className="text-center text-gray-500 py-8">No orders yet</p>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// ── StatusBar Component ────────────────────────────────────────
function StatusBar({ label, count, total, color }: StatusBarProps) {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  const colorClasses: Record<BarColor, string> = {
    green:  'bg-green-500',
    blue:   'bg-blue-500',
    yellow: 'bg-yellow-500',
    red:    'bg-red-500',
    purple: 'bg-purple-500',
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