'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import {
  getCurrentUser, getUsers, getWorkspaces, getTrucks,
  getOrders, getSensorRequests,
} from '@/src/lib/demo-data';

const SYSTEM_EVENTS = [
  { id: 'e1', time: '09:22', icon: '🚨', type: 'ALERT',   msg: 'Fuel drop anomaly on TRK-001 — C1 Diesel −180L (Khuwair)',         color: 'red' },
  { id: 'e2', time: '09:14', icon: '✅', type: 'SENSOR',  msg: 'Sensor integration completed — TRK-003 (Transporter 2)',             color: 'green' },
  { id: 'e3', time: '08:58', icon: '📦', type: 'ORDER',   msg: 'New order #ORD-009 placed by Client 1 — 3,000L Diesel',              color: 'blue' },
  { id: 'e4', time: '08:45', icon: '📄', type: 'KYC',     msg: 'KYC documents uploaded by Transporter 2 — pending review',           color: 'yellow' },
  { id: 'e5', time: '08:30', icon: '🎫', type: 'TICKET',  msg: 'Sensor integration ticket created for TRK-004 (Transporter 2)',      color: 'purple' },
  { id: 'e6', time: '08:10', icon: '🚛', type: 'FLEET',   msg: 'TRK-002 departed depot — EN_ROUTE to Al Amrat Station E',            color: 'blue' },
  { id: 'e7', time: '07:55', icon: '✅', type: 'DELIVERY',msg: 'Order #ORD-007 delivery confirmed by Client 2 via QR scan',           color: 'green' },
];

const EVENT_BADGE: Record<string, string> = {
  red:    'bg-red-100 text-red-700',
  green:  'bg-emerald-100 text-emerald-700',
  blue:   'bg-blue-100 text-blue-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  purple: 'bg-purple-100 text-purple-700',
};

export default function PlatformAdminDashboard() {
  const router  = useRouter();
  const [user,   setUser]   = useState<any>(null);
  const [stats,  setStats]  = useState({ workspaces: 0, users: 0, trucks: 0, orders: 0, pending: 0, active: 0 });
  const [mounted, setMounted] = useState(false);

  const loadStats = useCallback(() => {
    const workspaces   = getWorkspaces();
    const users        = getUsers();
    const trucks       = getTrucks();
    const orders       = getOrders();
    const sensorReqs   = getSensorRequests();
    setStats({
      workspaces: workspaces.length,
      users:      users.length,
      trucks:     trucks.length,
      orders:     orders.length,
      pending:    sensorReqs.filter(r => r.status !== 'ADMIN_APPROVED').length,
      active:     trucks.filter(t => t.status === 'EN_ROUTE' || t.status === 'ACTIVE').length,
    });
  }, []);

  useEffect(() => {
    setMounted(true);
    const u = getCurrentUser();
    if (!u || u.role !== 'PLATFORM_ADMIN') { router.push('/'); return; }
    setUser(u);
    loadStats();
    const iv = setInterval(loadStats, 4000);
    return () => clearInterval(iv);
  }, [router, loadStats]);

  if (!mounted || !user) return null;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar userRole={user.role} />

      <div className="flex-1 min-w-0">
        <Header user={user} />

        <main className="p-6 space-y-6">

          {/* Hero */}
          <div className="bg-gradient-to-r from-purple-700 to-purple-900 rounded-2xl p-6 text-white flex items-center justify-between">
            <div>
              <p className="text-purple-200 text-sm font-medium mb-1">ANPTCO Platform Admin</p>
              <h1 className="text-2xl font-black">System Control Center</h1>
              <p className="text-purple-200 text-sm mt-1">Full oversight — sensor integration, tickets & fleet monitoring</p>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-purple-200 text-sm font-medium">All Systems Operational</span>
            </div>
          </div>

          {/* KPI Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            <KpiCard label="Workspaces"  value={stats.workspaces} icon="🏢" color="purple" />
            <KpiCard label="Total Users" value={stats.users}      icon="👥" color="blue"   />
            <KpiCard label="Trucks"      value={stats.trucks}     icon="🚛" color="slate"  />
            <KpiCard label="Orders"      value={stats.orders}     icon="📦" color="blue"   />
            <KpiCard label="En Route"    value={stats.active}     icon="📡" color="green"  />
            <KpiCard label="Sensor Queue" value={stats.pending}   icon="🎫" color="orange" highlight={stats.pending > 0} onClick={() => router.push('/platform-admin/sensor-integration')} />
          </div>

          {/* Pending sensor requests */}
          {stats.pending > 0 && (
            <div className="bg-orange-50 border border-orange-300 rounded-2xl p-5 flex items-start gap-4">
              <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center text-xl flex-shrink-0">🔧</div>
              <div className="flex-1">
                <h3 className="font-bold text-orange-800">Sensor Integration Requests Awaiting Action</h3>
                <p className="text-orange-700 text-sm mt-0.5 mb-3">
                  {stats.pending} truck{stats.pending > 1 ? 's' : ''} pending Galileosky sensor configuration and QR code generation
                </p>
                <button
                  onClick={() => router.push('/platform-admin/sensor-integration')}
                  className="bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
                >
                  Process Integration Requests →
                </button>
              </div>
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-6">

            {/* Live System Events */}
            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div>
                  <h2 className="font-bold text-gray-900">Live System Events</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Real-time activity across the platform</p>
                </div>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  LIVE
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {SYSTEM_EVENTS.map(ev => (
                  <div key={ev.id} className="flex items-start gap-4 px-6 py-3.5 hover:bg-slate-50 transition">
                    <span className="text-xl flex-shrink-0">{ev.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 leading-snug">{ev.msg}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${EVENT_BADGE[ev.color] || 'bg-gray-100 text-gray-600'}`}>
                          {ev.type}
                        </span>
                        <span className="text-xs text-gray-400">{ev.time}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-900">Admin Actions</h2>
              </div>
              <div className="p-4 space-y-2">
                {[
                  { icon: '🔧', label: 'Sensor Integration',  sub: `${stats.pending} pending`,   path: '/platform-admin/sensor-integration', highlight: stats.pending > 0 },
                  { icon: '🎫', label: 'All Tickets',         sub: 'Support & requests',          path: '/platform-admin/tickets',           highlight: false },
                  { icon: '🚛', label: 'All Trucks',          sub: `${stats.trucks} registered`, path: '/platform-admin/trucks',            highlight: false },
                  { icon: '👥', label: 'Users',               sub: `${stats.users} total`,       path: '/platform-admin/users',             highlight: false },
                  { icon: '📊', label: 'Reports',             sub: 'Analytics overview',          path: '/platform-admin/reports',           highlight: false },
                ].map(item => (
                  <button
                    key={item.path}
                    onClick={() => router.push(item.path)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition text-left ${item.highlight ? 'bg-purple-50 border border-purple-200 hover:bg-purple-100' : 'hover:bg-gray-50 border border-transparent'}`}
                  >
                    <span className="text-lg w-7 text-center">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${item.highlight ? 'text-purple-700' : 'text-gray-800'}`}>{item.label}</p>
                      <p className="text-xs text-gray-500">{item.sub}</p>
                    </div>
                    {item.highlight && <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />}
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* System Health */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Platform Health</h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-0 divide-x divide-y sm:divide-y-0 divide-gray-100">
              {[
                { label: 'IoT Telemetry',   status: 'ONLINE',  detail: 'flespi → AWS IoT Core', color: 'green' },
                { label: 'Database (RLS)',  status: 'ONLINE',  detail: 'Aurora PostgreSQL',     color: 'green' },
                { label: 'Email (SES)',     status: 'ONLINE',  detail: 'Amazon SES',            color: 'green' },
                { label: 'QR Generation',  status: 'ONLINE',  detail: 'S3 + CloudFront CDN',   color: 'green' },
              ].map(svc => (
                <div key={svc.label} className="px-6 py-4 flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${svc.color === 'green' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{svc.label}</p>
                    <p className="text-xs text-gray-500">{svc.detail}</p>
                  </div>
                  <span className={`ml-auto text-xs font-bold ${svc.color === 'green' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {svc.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon, color, highlight, onClick }: {
  label: string; value: number; icon: string; color: string; highlight?: boolean; onClick?: () => void;
}) {
  const colors: Record<string, string> = {
    purple: 'bg-purple-50 border-purple-200',
    blue:   'bg-blue-50   border-blue-200',
    slate:  'bg-slate-50  border-slate-200',
    green:  'bg-emerald-50 border-emerald-200',
    orange: 'bg-orange-50 border-orange-200',
  };
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center p-5 rounded-2xl border-2 ${colors[color] || 'bg-gray-50 border-gray-200'} transition hover:shadow-md ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      {highlight && <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full" />}
      <span className="text-2xl mb-1">{icon}</span>
      <p className="text-3xl font-black text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 text-center mt-0.5">{label}</p>
    </button>
  );
}
