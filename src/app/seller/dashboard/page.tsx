'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import {
  getOrders, getTrucks, getKYCDocuments, getCurrentUser,
  getSellerConnections, getSensorRequests,
} from '@/src/lib/demo-data';

// ── Theft event types ─────────────────────────────────────────
const THEFT_ALERTS = [
  { id: 'a1', truckReg: 'TRK-001', compartment: 'C1 (Diesel)', drop: '180L', time: '09:14', severity: 'HIGH',   status: 'OPEN',     location: 'Al Khuwair — off-route' },
  { id: 'a2', truckReg: 'TRK-002', compartment: 'C2 (Petrol)', drop: '95L',  time: '08:52', severity: 'MEDIUM', status: 'REVIEWING', location: 'Bowshar — parked 18 min' },
  { id: 'a3', truckReg: 'TRK-003', compartment: 'C1 (Diesel)', drop: '40L',  time: '08:30', severity: 'LOW',    status: 'RESOLVED',  location: 'En-route — normal variation' },
];

const SEVERITY_STYLE: Record<string, string> = {
  HIGH:   'bg-red-100 text-red-700 border-red-300',
  MEDIUM: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  LOW:    'bg-green-100 text-green-700 border-green-300',
};

const STATUS_STYLE: Record<string, string> = {
  OPEN:       'bg-red-500 text-white',
  REVIEWING:  'bg-yellow-500 text-white',
  RESOLVED:   'bg-emerald-500 text-white',
};

export default function SellerDashboard() {
  const router  = useRouter();
  const [user,    setUser]    = useState<any>(null);
  const [orders,  setOrders]  = useState<any[]>([]);
  const [trucks,  setTrucks]  = useState<any[]>([]);
  const [kycDocs, setKycDocs] = useState<any[]>([]);
  const [mounted, setMounted] = useState(false);

  const loadData = useCallback((currentUser: any) => {
    const allOrders = getOrders();
    const allTrucks = getTrucks();
    const allKYC    = getKYCDocuments();
    setOrders(allOrders.filter((o: any) => o.workspaceId === currentUser?.workspaceId));
    setTrucks(allTrucks.filter((t: any) => t.workspaceId === currentUser?.workspaceId));
    setKycDocs(allKYC);
  }, []);

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== 'SELLER_MANAGER') { router.push('/'); return; }
    setUser(currentUser);
    loadData(currentUser);
  }, [router, loadData]);

  if (!mounted || !user) return null;

  // ── Derived metrics ───────────────────────────────────────
  const pendingOrders   = orders.filter(o => o.status === 'PLACED').length;
  const activeOrders    = orders.filter(o => !['COMPLETED', 'CANCELLED', 'PLACED'].includes(o.status)).length;
  const pendingKYC      = kycDocs.filter(k => k.reviewStatus === 'PENDING').length;
  const availableTrucks = trucks.filter(t => t.status === 'IDLE').length;
  const enRouteTrucks   = trucks.filter(t => t.status === 'EN_ROUTE').length;
  const activeAlerts    = THEFT_ALERTS.filter(a => a.status !== 'RESOLVED').length;

  const sensorRequests  = getSensorRequests().filter(r => r.sellerId === user.id);
  const pendingConn     = getSellerConnections().filter(r => r.sellerId === user.id && r.status === 'PENDING').length;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar userRole={user.role} />

      <div className="flex-1 min-w-0">
        <Header user={user} />

        <main className="p-6 space-y-6">

          {/* Welcome banner */}
          <div className="bg-gradient-to-r from-blue-700 to-blue-900 rounded-2xl p-6 text-white flex items-center justify-between">
            <div>
              <p className="text-blue-200 text-sm font-medium mb-1">Seller Manager · ANPTCO Fuel Depot</p>
              <h1 className="text-2xl font-black">Welcome, {user.firstName} {user.lastName}</h1>
              <p className="text-blue-200 text-sm mt-1">Manage orders, KYC approvals, and monitor your fleet</p>
            </div>
            <div className="hidden md:flex items-center gap-3">
              <div className="bg-white/10 rounded-xl px-4 py-3 text-center">
                <p className="text-2xl font-black">{trucks.length}</p>
                <p className="text-blue-200 text-xs">Total Trucks</p>
              </div>
              <div className="bg-white/10 rounded-xl px-4 py-3 text-center">
                <p className="text-2xl font-black">{orders.length}</p>
                <p className="text-blue-200 text-xs">Total Orders</p>
              </div>
            </div>
          </div>

          {/* Theft Alert Banner */}
          {activeAlerts > 0 && (
            <div className="bg-red-50 border border-red-300 rounded-2xl p-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-xl flex-shrink-0">🚨</div>
                <div className="flex-1">
                  <h3 className="font-bold text-red-800 text-lg">Fuel Anomaly Alerts — Action Required</h3>
                  <p className="text-red-600 text-sm mt-0.5 mb-3">
                    {activeAlerts} active alert{activeAlerts > 1 ? 's' : ''} detected — unexpected fuel level drops outside delivery windows
                  </p>
                  <button
                    onClick={() => router.push('/seller/fleet-monitor')}
                    className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
                  >
                    View Fleet Monitor →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Stat row */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            <StatTile label="Pending Orders"   value={pendingOrders}   icon="📦" color="orange" onClick={() => router.push('/seller/orders')} badge={pendingOrders > 0} />
            <StatTile label="Active Orders"    value={activeOrders}    icon="🔄" color="blue"   />
            <StatTile label="En Route"         value={enRouteTrucks}   icon="🚛" color="blue"   onClick={() => router.push('/seller/fleet-monitor')} />
            <StatTile label="Available Trucks" value={availableTrucks} icon="✅" color="green"  />
            <StatTile label="KYC Pending"      value={pendingKYC}      icon="📄" color="yellow" onClick={() => router.push('/seller/kyc-review')} badge={pendingKYC > 0} />
            <StatTile label="Theft Alerts"     value={activeAlerts}    icon="🚨" color="red"    onClick={() => router.push('/seller/fleet-monitor')} badge={activeAlerts > 0} />
          </div>

          {/* Two-column grid */}
          <div className="grid lg:grid-cols-3 gap-6">

            {/* Fuel Theft Monitoring Panel */}
            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div>
                  <h2 className="font-bold text-gray-900">Fuel Anomaly Detection</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Per-compartment sensor alerts — real-time</p>
                </div>
                <button onClick={() => router.push('/seller/fleet-monitor')} className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                  Open Map →
                </button>
              </div>
              <div className="divide-y divide-gray-50">
                {THEFT_ALERTS.map(alert => (
                  <div key={alert.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${alert.severity === 'HIGH' ? 'bg-red-500' : alert.severity === 'MEDIUM' ? 'bg-yellow-500' : 'bg-green-500'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-sm text-gray-900">{alert.truckReg}</span>
                        <span className="text-xs text-gray-500">{alert.compartment}</span>
                      </div>
                      <p className="text-xs text-gray-500">{alert.location}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-red-600">−{alert.drop}</p>
                      <p className="text-xs text-gray-400">{alert.time}</p>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${SEVERITY_STYLE[alert.severity]}`}>
                      {alert.severity}
                    </span>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLE[alert.status]}`}>
                      {alert.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-900">Quick Actions</h2>
              </div>
              <div className="p-4 space-y-2">
                {[
                  { icon: '📦', label: 'Review Orders',      sub: `${pendingOrders} pending`,   path: '/seller/orders',          highlight: pendingOrders > 0 },
                  { icon: '📄', label: 'KYC Review',         sub: `${pendingKYC} awaiting`,     path: '/seller/kyc-review',      highlight: pendingKYC > 0 },
                  { icon: '🎫', label: 'Sensor Requests',    sub: `${sensorRequests.length} total`, path: '/seller/sensor-requests', highlight: false },
                  { icon: '🗺️', label: 'Fleet Monitor',      sub: 'Live map',                   path: '/seller/fleet-monitor',   highlight: false },
                  { icon: '✉️', label: 'Invite Transporter', sub: 'Add TSP',                    path: '/seller/invite-tsp',      highlight: false },
                  { icon: '🚛', label: 'Transporters',       sub: `${pendingConn} pending conn`,path: '/seller/transporters',    highlight: pendingConn > 0 },
                  { icon: '📊', label: 'Reports',            sub: 'Analytics',                  path: '/seller/reports',         highlight: false },
                ].map(item => (
                  <button
                    key={item.path}
                    onClick={() => router.push(item.path)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition text-left ${item.highlight ? 'bg-blue-50 border border-blue-200 hover:bg-blue-100' : 'hover:bg-gray-50 border border-transparent'}`}
                  >
                    <span className="text-lg w-7 text-center">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${item.highlight ? 'text-blue-700' : 'text-gray-800'}`}>{item.label}</p>
                      <p className="text-xs text-gray-500 truncate">{item.sub}</p>
                    </div>
                    {item.highlight && <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />}
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Truck Overview */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Fleet Overview</h2>
              <button onClick={() => router.push('/seller/fleet-monitor')} className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                Live Map →
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-6 py-3 text-left">Truck</th>
                    <th className="px-6 py-3 text-left">Transporter</th>
                    <th className="px-6 py-3 text-left">Compartments</th>
                    <th className="px-6 py-3 text-left">Capacity</th>
                    <th className="px-6 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {trucks.map(truck => (
                    <tr key={truck.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-3 font-semibold text-gray-900">{truck.registrationNumber}</td>
                      <td className="px-6 py-3 text-gray-600">{truck.tspName}</td>
                      <td className="px-6 py-3 text-gray-600">{truck.compartments?.length ?? 0}</td>
                      <td className="px-6 py-3 text-gray-600">{truck.capacity?.toLocaleString()}L</td>
                      <td className="px-6 py-3">
                        <TruckStatusBadge status={truck.status} />
                      </td>
                    </tr>
                  ))}
                  {trucks.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">No trucks in workspace</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Orders */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Recent Orders</h2>
              <button onClick={() => router.push('/seller/orders')} className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                All Orders →
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {orders.slice(0, 6).map(order => (
                <div key={order.id} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">Order #{order.id.slice(0, 8)}</p>
                    <p className="text-xs text-gray-500">{order.volume}L {order.fuelType}</p>
                  </div>
                  <div className="text-right">
                    <OrderStatusBadge status={order.status} />
                    <p className="text-xs text-gray-400 mt-0.5">{new Date(order.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
              {orders.length === 0 && (
                <div className="px-6 py-10 text-center">
                  <p className="text-3xl mb-2">📭</p>
                  <p className="text-gray-500 text-sm">No orders yet. Clients will place orders here.</p>
                </div>
              )}
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}

// ── Micro-components ──────────────────────────────────────────

function StatTile({
  label, value, icon, color, onClick, badge,
}: {
  label: string; value: number; icon: string; color: string;
  onClick?: () => void; badge?: boolean;
}) {
  const colors: Record<string, string> = {
    orange: 'bg-orange-50 border-orange-200',
    blue:   'bg-blue-50 border-blue-200',
    green:  'bg-emerald-50 border-emerald-200',
    yellow: 'bg-yellow-50 border-yellow-200',
    red:    'bg-red-50 border-red-200',
  };
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center p-4 rounded-2xl border-2 ${colors[color] || 'bg-gray-50 border-gray-200'} transition hover:shadow-md ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      {badge && <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full" />}
      <span className="text-2xl mb-1">{icon}</span>
      <p className="text-2xl font-black text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 text-center leading-tight mt-0.5">{label}</p>
    </button>
  );
}

function TruckStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    IDLE:                'bg-emerald-100 text-emerald-700',
    EN_ROUTE:            'bg-blue-100 text-blue-700',
    ASSIGNED:            'bg-yellow-100 text-yellow-700',
    AT_DESTINATION:      'bg-purple-100 text-purple-700',
    PENDING_INTEGRATION: 'bg-gray-100 text-gray-600',
    ACTIVE:              'bg-emerald-100 text-emerald-700',
    MAINTENANCE:         'bg-red-100 text-red-700',
  };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function OrderStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PLACED:           'bg-yellow-100 text-yellow-700',
    ACCEPTED:         'bg-blue-100 text-blue-700',
    ASSIGNED_TO_TSP:  'bg-purple-100 text-purple-700',
    TRUCKS_ASSIGNED:  'bg-indigo-100 text-indigo-700',
    EN_ROUTE:         'bg-cyan-100 text-cyan-700',
    ARRIVED:          'bg-teal-100 text-teal-700',
    COMPLETED:        'bg-emerald-100 text-emerald-700',
    CANCELLED:        'bg-red-100 text-red-700',
  };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
