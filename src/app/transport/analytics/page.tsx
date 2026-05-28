'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser, getTrucks, getOrders } from '@/src/lib/demo-data';

// ── Types ─────────────────────────────────────────────────────
type StatusColor = 'green' | 'blue' | 'orange';
type FuelColor   = 'blue' | 'green' | 'purple';

interface StatusBarProps {
  label: string;
  count: number;
  total: number;
  color: StatusColor;
}

interface FuelBarProps {
  label:  string;
  volume: number;
  total:  number;
  color:  FuelColor;
}

export default function TransportAnalyticsPage() {
  const router = useRouter();
  const [user,    setUser]    = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [trucks,  setTrucks]  = useState<any[]>([]);
  const [orders,  setOrders]  = useState<any[]>([]);

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();
    setUser(currentUser);
    if (currentUser) loadData(currentUser);
  }, []);

  const loadData = (currentUser: any) => {
    const allTrucks  = getTrucks();
    const allOrders  = getOrders();
    const tspTrucks  = allTrucks.filter((t: any) => t.tspId === currentUser.id);
    setTrucks(tspTrucks);
    const tspTruckIds = tspTrucks.map((t: any) => t.id);
    setOrders(allOrders.filter((o: any) => o.assignedTruckId && tspTruckIds.includes(o.assignedTruckId)));
  };

  if (!mounted) return null;
  if (!user)                           { router.push('/'); return null; }
  if (user.role !== 'TRANSPORT_ADMIN') { router.push('/'); return null; }

  // ── Derived ───────────────────────────────────────────────
  const totalTrucks   = trucks.length;
  const idleTrucks    = trucks.filter((t: any) => t.status === 'IDLE').length;
  const activeTrucks  = trucks.filter((t: any) => ['EN_ROUTE', 'ASSIGNED'].includes(t.status)).length;
  const pendingTrucks = trucks.filter((t: any) => t.status === 'PENDING_INTEGRATION').length;

  const totalOrders      = orders.length;
  const completedOrders  = orders.filter((o: any) => o.status === 'COMPLETED').length;
  const totalFuelDelivered = orders
    .filter((o: any) => o.status === 'COMPLETED')
    .reduce((sum: number, o: any) => sum + (o.volume || 0), 0);
  const totalCapacity    = trucks.reduce((sum: number, t: any) => sum + (t.capacity || 0), 0);
  const completionRate   = totalOrders  > 0 ? ((completedOrders / totalOrders)   * 100).toFixed(1) : '0';
  const utilizationRate  = totalTrucks  > 0 ? ((activeTrucks   / totalTrucks)    * 100).toFixed(1) : '0';

  const fuelBreakdown = {
    DIESEL:  orders.filter((o: any) => o.fuelType === 'DIESEL' ).reduce((s: number, o: any) => s + (o.volume || 0), 0),
    PETROL:  orders.filter((o: any) => o.fuelType === 'PETROL' ).reduce((s: number, o: any) => s + (o.volume || 0), 0),
    PREMIUM: orders.filter((o: any) => o.fuelType === 'PREMIUM').reduce((s: number, o: any) => s + (o.volume || 0), 0),
  };

  const truckPerformance = trucks
    .map((truck: any) => {
      const truckOrders = orders.filter((o: any) => o.assignedTruckId === truck.id);
      return {
        truck,
        totalOrders:     truckOrders.length,
        completedOrders: truckOrders.filter((o: any) => o.status === 'COMPLETED').length,
      };
    })
    .sort((a, b) => b.completedOrders - a.completedOrders)
    .slice(0, 5);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />

      <div className="flex-1">
        <Header user={user} />

        <main className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Fleet Analytics 📊</h1>
            <p className="text-gray-600">Performance metrics and insights for your fleet</p>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            {[
              { label: 'Total Trucks',    value: totalTrucks,                              sub: 'Registered fleet',        from: 'from-blue-500',   to: 'to-blue-600',   text: 'text-blue-100'   },
              { label: 'Deliveries',      value: completedOrders,                          sub: `${completionRate}% success rate`, from: 'from-green-500', to: 'to-green-600', text: 'text-green-100' },
              { label: 'Active Trucks',   value: activeTrucks,                             sub: `${utilizationRate}% utilization`, from: 'from-orange-500', to: 'to-orange-600', text: 'text-orange-100' },
              { label: 'Fuel Delivered',  value: `${(totalFuelDelivered / 1000).toFixed(1)}K`, sub: 'Liters total', from: 'from-purple-500', to: 'to-purple-600', text: 'text-purple-100' },
            ].map(m => (
              <div key={m.label} className={`bg-gradient-to-br ${m.from} ${m.to} rounded-xl p-6 text-white`}>
                <p className={`${m.text} mb-1 text-sm`}>{m.label}</p>
                <p className="text-4xl font-bold mb-2">{m.value}</p>
                <p className={`${m.text} text-xs`}>{m.sub}</p>
              </div>
            ))}
          </div>

          {/* Additional Stats */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {[
              { label: 'Fleet Capacity',  value: `${(totalCapacity / 1000).toFixed(1)}K L`, sub: 'Total capacity across all trucks'  },
              { label: 'Idle Trucks',     value: idleTrucks,                                 sub: 'Available for assignment'          },
              { label: 'Pending Setup',   value: pendingTrucks,                              sub: 'Awaiting QR integration'           },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl p-6 border border-gray-200">
                <p className="text-sm text-gray-600 mb-1">{s.label}</p>
                <p className="text-3xl font-bold text-gray-900 mb-2">{s.value}</p>
                <p className="text-xs text-gray-500">{s.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
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
                <p className="text-sm text-gray-500 text-center py-8">No deliveries yet</p>
              )}
            </div>

            {/* Fleet Status */}
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Fleet Status</h3>
              {totalTrucks > 0 ? (
                <div className="space-y-3">
                  <StatusBar label="Idle"          count={idleTrucks}    total={totalTrucks} color="green"  />
                  <StatusBar label="Active"         count={activeTrucks}  total={totalTrucks} color="blue"   />
                  <StatusBar label="Pending Setup"  count={pendingTrucks} total={totalTrucks} color="orange" />
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-8">No trucks registered</p>
              )}
            </div>
          </div>

          {/* Top Performing Trucks */}
          {truckPerformance.length > 0 && (
            <div className="bg-white rounded-xl p-6 border border-gray-200 mb-8">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Top Performing Trucks</h3>
              <div className="space-y-3">
                {truckPerformance.map((perf, index) => (
                  <div key={perf.truck.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-4">
                      <span className="text-2xl font-bold text-gray-400">#{index + 1}</span>
                      <div>
                        <p className="font-semibold text-gray-900">{perf.truck.registrationNumber}</p>
                        <p className="text-sm text-gray-600">{perf.truck.driverName}</p>
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

          {/* Recent Deliveries */}
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Deliveries</h3>
            {orders.length > 0 ? (
              <div className="space-y-2">
                {orders.slice(0, 10).map((order: any) => {
                  const truck = trucks.find((t: any) => t.id === order.assignedTruckId);
                  return (
                    <div key={order.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">Order #{order.id.slice(0, 8)}</p>
                        <p className="text-xs text-gray-600">
                          {truck?.registrationNumber} • {order.volume?.toLocaleString()}L {order.fuelType}
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
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <span className="text-6xl mb-4 block">📦</span>
                <p className="text-gray-600 mb-4">No deliveries assigned yet</p>
                <p className="text-sm text-gray-500">Register trucks and complete KYC to start receiving orders</p>
              </div>
            )}
          </div>

          {/* Insights */}
          {totalOrders > 0 && (
            <div className="mt-8 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6 border border-blue-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">💡 Fleet Insights</h3>
              <div className="grid md:grid-cols-3 gap-4 text-sm">
                <div className="bg-white rounded-lg p-4">
                  <p className="font-medium text-gray-900 mb-1">Avg Orders per Truck</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {totalTrucks > 0 ? (totalOrders / totalTrucks).toFixed(1) : '0'}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-4">
                  <p className="font-medium text-gray-900 mb-1">Most Delivered Fuel</p>
                  <p className="text-2xl font-bold text-green-600">
                    {fuelBreakdown.DIESEL >= fuelBreakdown.PETROL && fuelBreakdown.DIESEL >= fuelBreakdown.PREMIUM
                      ? 'Diesel'
                      : fuelBreakdown.PETROL >= fuelBreakdown.PREMIUM
                      ? 'Petrol'
                      : 'Premium'}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-4">
                  <p className="font-medium text-gray-900 mb-1">Fleet Utilization</p>
                  <p className="text-2xl font-bold text-orange-600">{utilizationRate}%</p>
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {totalTrucks === 0 && (
            <div className="mt-8 bg-white rounded-xl p-12 text-center border border-gray-200">
              <span className="text-6xl mb-4 block">🚛</span>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Fleet Data Yet</h3>
              <p className="text-gray-600 mb-6">Register your first truck to start tracking analytics</p>
              <button
                onClick={() => router.push('/transport/trucks/register')}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                + Register Truck
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ── StatusBar ─────────────────────────────────────────────────
function StatusBar({ label, count, total, color }: StatusBarProps) {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  const colorClasses: Record<StatusColor, string> = {
    green:  'bg-green-500',
    blue:   'bg-blue-500',
    orange: 'bg-orange-500',
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm text-gray-600">{count} ({percentage.toFixed(0)}%)</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div className={`h-2 rounded-full ${colorClasses[color]}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

// ── FuelBar ───────────────────────────────────────────────────
function FuelBar({ label, volume, total, color }: FuelBarProps) {
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
        <span className="text-sm text-gray-600">{volume.toLocaleString()}L ({percentage.toFixed(0)}%)</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div className={`h-2 rounded-full ${colorClasses[color]}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}