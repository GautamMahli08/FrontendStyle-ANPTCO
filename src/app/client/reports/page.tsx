// src/app/platform-admin/reports/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import { downloadCSV } from '@/src/lib/export-csv';
import Header from '@/src/components/layout/Header';
import {
  getCurrentUser,
  getUsers,
  getOrders,
  getDrivers,
  getTrucks,
  setCurrentUser,
  shortOrderId,
} from '@/src/lib/demo-data';

// ── Types ─────────────────────────────────────────────────────
interface Order {
  id: string;
  clientId: string;
  clientName: string;
  fuelType: string;
  volume: number;
  status: string;
  urgency: string;
  workspaceId?: string;
  assignedTSPId?: string;
  assignedTSPName?: string;      // ← add
  assignedAt?: Date;             // ← add
  assignedDriverId?: string;     // ← add if needed
  assignedDriverName?: string;
  assignedTruckId?: string;      // ← add if needed
  createdAt: Date;
  completedAt?: Date;
  tripStartedAt?: Date;
}

interface User {
  id: string;
  name?: string;
  companyName?: string;
  email: string;
  role: string;
  workspaceId?: string;
  createdAt?: Date;
}

// ── Helpers ───────────────────────────────────────────────────
type Range = '7d' | '30d' | '90d' | 'all';

function filterByRange<T extends { createdAt: Date }>(items: T[], range: Range): T[] {
  if (range === 'all') return items;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const cutoff = new Date(Date.now() - days * 86400000);
  return items.filter(i => new Date(i.createdAt) >= cutoff);
}

function groupByDay(orders: Order[]): { label: string; value: number }[] {
  const map: Record<string, number> = {};
  orders.forEach(o => {
    const d = new Date(o.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    map[d] = (map[d] ?? 0) + 1;
  });
  return Object.entries(map).map(([label, value]) => ({ label, value }));
}

function groupByMonth(orders: Order[]): { label: string; value: number }[] {
  const map: Record<string, number> = {};
  orders.forEach(o => {
    const k = new Date(o.createdAt).toLocaleString('default', { month: 'short', year: '2-digit' });
    map[k] = (map[k] ?? 0) + (o.volume ?? 0);
  });
  return Object.entries(map).map(([label, value]) => ({ label, value }));
}

function groupUsersByMonth(users: User[]): { label: string; value: number }[] {
  const map: Record<string, number> = {};
  users.forEach(u => {
    if (!u.createdAt) return;
    const k = new Date(u.createdAt).toLocaleString('default', { month: 'short', year: '2-digit' });
    map[k] = (map[k] ?? 0) + 1;
  });
  return Object.entries(map).map(([label, value]) => ({ label, value }));
}

function avgDeliveryHours(orders: Order[]): number {
  const done = orders.filter(o => o.completedAt && o.createdAt);
  if (!done.length) return 0;
  const total = done.reduce(
    (s, o) => s + (new Date(o.completedAt!).getTime() - new Date(o.createdAt).getTime()),
    0
  );
  return Math.round(total / done.length / 3600000);
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  EN_ROUTE: 'bg-blue-100 text-blue-700',
  ARRIVED: 'bg-indigo-100 text-indigo-700',
  ASSIGNED: 'bg-cyan-100 text-cyan-700',
  ASSIGNED_TO_TSP: 'bg-orange-100 text-orange-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const ROLE_COLORS: Record<string, string> = {
  PLATFORM_ADMIN: 'bg-red-100 text-red-700',
  SELLER_MANAGER: 'bg-blue-100 text-blue-700',
  TRANSPORT_ADMIN: 'bg-purple-100 text-purple-700',
  CLIENT: 'bg-green-100 text-green-700',
  DRIVER: 'bg-orange-100 text-orange-700',
};

const FUEL_BADGE: Record<string, string> = {
  DIESEL: 'bg-blue-100 text-blue-700',
  PETROL: 'bg-green-100 text-green-700',
  PREMIUM: 'bg-purple-100 text-purple-700',
};

const FUEL_BAR: Record<string, string> = {
  DIESEL: 'bg-blue-500',
  PETROL: 'bg-green-500',
  PREMIUM: 'bg-purple-500',
};

// ── Bar Chart ─────────────────────────────────────────────────
function BarChart({
  data,
  color = 'bg-blue-500',
}: {
  data: { label: string; value: number }[];
  color?: string;
}) {
  const max = Math.max(...data.map(d => d.value), 1);
  if (!data.length)
    return <p className="text-center text-gray-400 text-sm py-8">No data for this period</p>;

  return (
    <div className="flex items-end gap-1.5 h-44 w-full overflow-x-auto pb-1">
      {data.map((d, i) => (
        <div key={i} className="flex-1 min-w-[28px] flex flex-col items-center gap-1">
          <span className="text-xs text-gray-400 font-medium leading-none">
            {d.value >= 1000 ? `${(d.value / 1000).toFixed(1)}k` : d.value}
          </span>
          <div className="w-full flex items-end" style={{ height: '100px' }}>
            <div
              className={`w-full rounded-t-md ${color} transition-all`}
              style={{ height: `${Math.max((d.value / max) * 100, 3)}%` }}
            />
          </div>
          <span className="text-xs text-gray-400 truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Donut Chart ───────────────────────────────────────────────
function DonutChart({ segments }: { segments: { label: string; value: number }[] }) {
  const total = segments.reduce((s, d) => s + d.value, 0);
  if (!total) return <p className="text-gray-400 text-sm text-center py-6">No data</p>;

  const COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#f97316', '#ef4444', '#14b8a6'];
  let cum = 0;

  return (
    <div className="flex items-center gap-6 flex-wrap">
      <svg viewBox="0 0 36 36" className="w-28 h-28 -rotate-90 flex-shrink-0">
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f3f4f6" strokeWidth="3.5" />
        {segments.map((seg, i) => {
          const pct = seg.value / total;
          const dash = pct * 100;
          const offset = cum * 100;
          cum += pct;
          return (
            <circle
              key={i}
              cx="18"
              cy="18"
              r="15.9"
              fill="none"
              stroke={COLORS[i % COLORS.length]}
              strokeWidth="3.5"
              strokeDasharray={`${dash} ${100 - dash}`}
              strokeDashoffset={-offset}
            />
          );
        })}
      </svg>
      <div className="space-y-2">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <span className="text-gray-600 font-medium">{seg.label.replace(/_/g, ' ')}</span>
            <span className="text-gray-400">
              {seg.value} ({((seg.value / total) * 100).toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Status Funnel ─────────────────────────────────────────────
function StatusFunnel({ orders }: { orders: Order[] }) {
  const pipeline = [
    { key: 'PENDING', label: 'Pending', color: 'bg-yellow-400' },
    { key: 'ASSIGNED_TO_TSP', label: 'Sent to TSP', color: 'bg-orange-400' },
    { key: 'ASSIGNED', label: 'Driver Assigned', color: 'bg-cyan-400' },
    { key: 'EN_ROUTE', label: 'En Route', color: 'bg-blue-500' },
    { key: 'ARRIVED', label: 'Arrived', color: 'bg-indigo-500' },
    { key: 'COMPLETED', label: 'Completed', color: 'bg-green-500' },
  ];

  const counts = pipeline.map(p => ({
    ...p,
    count: orders.filter(o => o.status === p.key).length,
  }));

  const max = Math.max(...counts.map(c => c.count), 1);

  return (
    <div className="space-y-2">
      {counts.map(s => (
        <div key={s.key} className="flex items-center gap-3">
          <span className="text-xs text-gray-500 w-32 shrink-0">{s.label}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
            <div
              className={`${s.color} h-6 rounded-full flex items-center justify-end pr-2 transition-all`}
              style={{ width: `${Math.max((s.count / max) * 100, s.count > 0 ? 8 : 0)}%` }}
            >
              {s.count > 0 && <span className="text-white text-xs font-bold">{s.count}</span>}
            </div>
          </div>
          <span className="text-xs font-semibold text-gray-700 w-6 text-right">{s.count}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
export default function PlatformAdminReportsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [trucks, setTrucks] = useState<any[]>([]);
  const [range, setRange] = useState<Range>('30d');
  const [tab, setTab] = useState<'overview' | 'orders' | 'users' | 'workspaces'>('overview');

useEffect(() => {
  setMounted(true);

  const currentUser = getCurrentUser();
  console.log('REPORT CURRENT USER:', currentUser);

  if (!currentUser) {
    router.push('/');
    return;
  }

  if (currentUser.role !== 'CLIENT') {
    const routes: Record<string, string> = {
      PLATFORM_ADMIN: '/platform-admin/dashboard',
      SELLER_MANAGER: '/seller/dashboard',
      TRANSPORT_ADMIN: '/transport/dashboard',
      CLIENT: '/client/dashboard',
      DRIVER: '/driver/dashboard',
    };

    router.push(routes[currentUser.role] || '/');
    return;
  }

  setUser(currentUser);

  const allUsers = getUsers().map((u: any) => ({
    ...u,
    createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
  }));
  setUsers(allUsers);

  const allOrders = getOrders().map((o: any) => ({
    ...o,
    createdAt: new Date(o.createdAt),
    completedAt: o.completedAt ? new Date(o.completedAt) : undefined,
    tripStartedAt: o.tripStartedAt ? new Date(o.tripStartedAt) : undefined,
  }));
  setOrders(allOrders);

  setDrivers(getDrivers());
  setTrucks(getTrucks());
}, [router]);


  const handleRoleChange = (userId: string) => {
    const newUser = users.find(u => u.id === userId);
    if (!newUser) return;
    setUser(newUser);
    setCurrentUser(newUser as any);

    const routes: Record<string, string> = {
      PLATFORM_ADMIN: '/platform-admin/dashboard',
      SELLER_MANAGER: '/seller/dashboard',
      TRANSPORT_ADMIN: '/transport/dashboard',
      CLIENT: '/client/dashboard',
      DRIVER: '/driver/dashboard',
    };

    router.push(routes[(newUser as any).role]);
  };

  if (!mounted || !user) return null;

  const filteredOrders = filterByRange(orders, range);
  const filteredUsers = filterByRange(users.filter(u => u.createdAt) as any, range);

  const completed = filteredOrders.filter(o => o.status === 'COMPLETED');
  const pending = filteredOrders.filter(o => o.status === 'PENDING');
  const urgent = filteredOrders.filter(o => o.urgency === 'URGENT');
  const totalVolume = completed.reduce((s, o) => s + (o.volume ?? 0), 0);
  const completionRate =
    filteredOrders.length > 0 ? Math.round((completed.length / filteredOrders.length) * 100) : 0;
  const avgHours = avgDeliveryHours(completed);

  const dailyOrderChart = groupByDay(filteredOrders);
  const monthlyVolChart = groupByMonth(completed);
  const userGrowthChart = groupUsersByMonth(users);

  const roleMap: Record<string, number> = {};
  users.forEach(u => {
    roleMap[u.role] = (roleMap[u.role] ?? 0) + 1;
  });
  const roleDonut = Object.entries(roleMap).map(([label, value]) => ({ label, value }));

  const statusMap: Record<string, number> = {};
  filteredOrders.forEach(o => {
    statusMap[o.status] = (statusMap[o.status] ?? 0) + 1;
  });
  const statusDonut = Object.entries(statusMap).map(([label, value]) => ({ label, value }));

  const fuelMap: Record<string, number> = {};
  completed.forEach(o => {
    fuelMap[o.fuelType] = (fuelMap[o.fuelType] ?? 0) + (o.volume ?? 0);
  });
  const fuelDonut = Object.entries(fuelMap).map(([label, value]) => ({ label, value }));

  const workspaceIds = [...new Set(orders.map(o => o.workspaceId).filter(Boolean))];
  const workspaceRows = workspaceIds
    .map(wsId => {
      const wsOrders = filteredOrders.filter(o => o.workspaceId === wsId);
      const wsCompleted = wsOrders.filter(o => o.status === 'COMPLETED');
      const wsVolume = wsCompleted.reduce((s, o) => s + (o.volume ?? 0), 0);
      const wsUsers = users.filter(u => u.workspaceId === wsId);
      const seller = wsUsers.find(u => u.role === 'SELLER_MANAGER');
      const tspCount = wsUsers.filter(u => u.role === 'TRANSPORT_ADMIN').length;
      const clientCount = wsUsers.filter(u => u.role === 'CLIENT').length;
      const rate =
        wsOrders.length > 0 ? Math.round((wsCompleted.length / wsOrders.length) * 100) : 0;
      const avgH = avgDeliveryHours(wsCompleted);

      return {
        id: wsId!,
        name: seller?.companyName ?? seller?.name ?? `Workspace ${wsId!.slice(0, 6)}`,
        orders: wsOrders.length,
        completed: wsCompleted.length,
        volume: wsVolume,
        rate,
        avgHours: avgH,
        tspCount,
        clientCount,
        userCount: wsUsers.length,
      };
    })
    .sort((a, b) => b.orders - a.orders);

  const tspUsers = users.filter(u => u.role === 'TRANSPORT_ADMIN');
  const tspRows = tspUsers
    .map(tsp => {
      const tspOrders = filteredOrders.filter(o => o.assignedTSPId === tsp.id);
      const tspCompleted = tspOrders.filter(o => o.status === 'COMPLETED');
      const tspVolume = tspCompleted.reduce((s, o) => s + (o.volume ?? 0), 0);
      const tspDrivers = drivers.filter(d => d.tspId === tsp.id);
      const tspTrucks = trucks.filter(t => t.tspId === tsp.id);
      const rate =
        tspOrders.length > 0 ? Math.round((tspCompleted.length / tspOrders.length) * 100) : 0;

      return {
        id: tsp.id,
        name: (tsp as any).companyName ?? tsp.name ?? tsp.id.slice(0, 8),
        orders: tspOrders.length,
        completed: tspCompleted.length,
        volume: tspVolume,
        drivers: tspDrivers.length,
        trucks: tspTrucks.length,
        rate,
        avgHours: avgDeliveryHours(tspCompleted),
      };
    })
    .sort((a, b) => b.completed - a.completed);

  const exportOrders = () =>
    downloadCSV(
      'platform-orders',
      filteredOrders.map(o => ({
        Order_ID: o.id,
        Client: o.clientName,
        Fuel_Type: o.fuelType,
        Volume_L: o.volume,
        Workspace: workspaceRows.find(w => w.id === o.workspaceId)?.name ?? '',
        Urgency: o.urgency,
        Status: o.status,
        Date: new Date(o.createdAt).toLocaleDateString(),
      }))
    );

  const exportUsers = () =>
    downloadCSV(
      'platform-users',
      users.map(u => ({
        Name: (u as any).name ?? (u as any).companyName ?? '',
        Email: u.email,
        Role: u.role,
        Workspace: workspaceRows.find(w => w.id === u.workspaceId)?.name ?? '',
        Joined: u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '',
      }))
    );

  const exportWorkspaces = () =>
    downloadCSV(
      'workspace-report',
      workspaceRows.map(w => ({
        Workspace: w.name,
        Total_Orders: w.orders,
        Completed: w.completed,
        Completion_Rate: w.rate + '%',
        Volume_L: w.volume,
        TSPs: w.tspCount,
        Clients: w.clientCount,
        Users: w.userCount,
        Avg_Delivery_Hrs: w.avgHours > 0 ? w.avgHours : '',
      }))
    );

  const RANGES: { key: Range; label: string }[] = [
    { key: '7d', label: '7 days' },
    { key: '30d', label: '30 days' },
    { key: '90d', label: '90 days' },
    { key: 'all', label: 'All' },
  ];

  const TABS = [
    { key: 'overview', label: '📊 Overview' },
    { key: 'orders', label: '📦 All Orders' },
    { key: 'users', label: '👥 Users' },
    { key: 'workspaces', label: '🏢 Workspaces' },
  ] as const;

  const exportConfig: Partial<
    Record<'overview' | 'orders' | 'users' | 'workspaces', { data: any[]; onExport: () => void }>
  > = {
    orders: {
      data: filteredOrders,
      onExport: exportOrders,
    },
    users: {
      data: users,
      onExport: exportUsers,
    },
    workspaces: {
      data: workspaceRows,
      onExport: exportWorkspaces,
    },
  };

  const currentExport = exportConfig[tab];

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />
      <div className="flex-1">
        <Header user={user} />

        <main className="p-8">
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Platform Reports 📊</h1>
              <p className="text-sm text-gray-500 mt-1">
                System-wide analytics across all workspaces, users, and orders
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {RANGES.map(r => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    range === r.key
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
            {[
              {
                label: 'Total Orders',
                value: filteredOrders.length,
                sub: 'platform-wide',
                color: 'text-gray-900',
              },
              {
                label: 'Completed',
                value: completed.length,
                sub: `${completionRate}% rate`,
                color: 'text-green-600',
              },
              {
                label: 'Volume Delivered',
                value: `${totalVolume.toLocaleString()} L`,
                sub: 'across all workspaces',
                color: 'text-blue-600',
              },
              {
                label: 'Avg Delivery Time',
                value: avgHours > 0 ? `${avgHours}h` : '—',
                sub: 'order → complete',
                color: 'text-indigo-600',
              },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
                <p className="text-sm text-gray-500 mb-1">{kpi.label}</p>
                <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
                <p className="text-xs text-gray-400 mt-1">{kpi.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            {[
              {
                label: 'Workspaces',
                value: workspaceIds.length,
                color: 'bg-blue-50 border-blue-200 text-blue-700',
              },
              {
                label: 'Sellers',
                value: users.filter(u => u.role === 'SELLER_MANAGER').length,
                color: 'bg-cyan-50 border-cyan-200 text-cyan-700',
              },
              {
                label: 'TSPs',
                value: users.filter(u => u.role === 'TRANSPORT_ADMIN').length,
                color: 'bg-purple-50 border-purple-200 text-purple-700',
              },
              {
                label: 'Clients',
                value: users.filter(u => u.role === 'CLIENT').length,
                color: 'bg-green-50 border-green-200 text-green-700',
              },
              {
                label: 'Drivers',
                value: drivers.length,
                color: 'bg-orange-50 border-orange-200 text-orange-700',
              },
              {
                label: 'Trucks',
                value: trucks.length,
                color: 'bg-gray-50 border-gray-200 text-gray-700',
              },
            ].map(s => (
              <div key={s.label} className={`rounded-xl border p-4 ${s.color}`}>
                <p className="text-xs font-medium opacity-70">{s.label}</p>
                <p className="text-2xl font-bold mt-1">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mb-6 border-b border-gray-200">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-5 py-3 text-sm font-semibold transition-all border-b-2 -mb-px ${
                  tab === t.key
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

         {(tab === 'orders' || tab === 'users' || tab === 'workspaces') &&
  currentExport &&
  (currentExport.data?.length ?? 0) > 0 && (
    <div className="flex justify-end mb-4">
      <button
        onClick={currentExport.onExport}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
                >
                  ⬇️ Export CSV
                </button>
              </div>
            )}

          {tab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-base font-bold text-gray-900 mb-1">Daily Orders (Platform)</h3>
                  <p className="text-xs text-gray-400 mb-5">All orders placed per day across workspaces</p>
                  <BarChart data={dailyOrderChart} color="bg-blue-500" />
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-base font-bold text-gray-900 mb-1">Monthly Volume Delivered</h3>
                  <p className="text-xs text-gray-400 mb-5">Total litres in completed orders per month</p>
                  <BarChart data={monthlyVolChart} color="bg-green-500" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-base font-bold text-gray-900 mb-1">User Growth</h3>
                  <p className="text-xs text-gray-400 mb-5">New users registered per month</p>
                  <BarChart data={userGrowthChart} color="bg-indigo-500" />
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-base font-bold text-gray-900 mb-4">Order Pipeline (Platform)</h3>
                  <StatusFunnel orders={filteredOrders} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-base font-bold text-gray-900 mb-4">Users by Role</h3>
                  <DonutChart segments={roleDonut} />
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-base font-bold text-gray-900 mb-4">Order Status Split</h3>
                  <DonutChart segments={statusDonut} />
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-base font-bold text-gray-900 mb-4">Fuel Volume Split</h3>
                  <DonutChart segments={fuelDonut} />
                </div>
              </div>

              {tspRows.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h3 className="text-base font-bold text-gray-900">Top TSPs Platform-wide</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Ranked by completed deliveries</p>
                    </div>
                    <button onClick={() => setTab('workspaces')} className="text-sm text-blue-600 hover:underline">
                      Full view →
                    </button>
                  </div>
                  <div className="space-y-3">
                    {tspRows.slice(0, 5).map((tsp, i) => (
                      <div key={tsp.id} className="flex items-center gap-4">
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                            i === 0
                              ? 'bg-yellow-400 text-white'
                              : i === 1
                              ? 'bg-gray-300 text-gray-700'
                              : i === 2
                              ? 'bg-orange-400 text-white'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {i + 1}
                        </span>
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-0.5">
                            <span className="font-semibold text-gray-800">{tsp.name}</span>
                            <span className="text-gray-500">{tsp.completed} trips</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                tsp.rate >= 80 ? 'bg-green-500' : tsp.rate >= 50 ? 'bg-yellow-400' : 'bg-red-500'
                              }`}
                              style={{ width: `${tsp.rate}%` }}
                            />
                          </div>
                        </div>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                            tsp.rate >= 80
                              ? 'bg-green-100 text-green-700'
                              : tsp.rate >= 50
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-600'
                          }`}
                        >
                          {tsp.rate}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(pending.length > 0 || urgent.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pending.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
                      <p className="font-semibold text-yellow-800 mb-1">
                        ⏳ {pending.length} Pending Order{pending.length > 1 ? 's' : ''}
                      </p>
                      <p className="text-sm text-yellow-700">
                        These orders haven't been assigned to a TSP yet.
                      </p>
                    </div>
                  )}
                  {urgent.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-5">
                      <p className="font-semibold text-red-800 mb-1">
                        🚨 {urgent.length} Urgent Order{urgent.length > 1 ? 's' : ''}
                      </p>
                      <p className="text-sm text-red-700">
                        Urgent orders need immediate attention.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'orders' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {filteredOrders.length === 0 ? (
                <div className="p-16 text-center">
                  <div className="text-5xl mb-4">📦</div>
                  <p className="text-gray-500">No orders in this period.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['Order', 'Client', 'Fuel', 'Volume', 'Workspace', 'Urgency', 'Status', 'Date'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredOrders
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map(order => {
                        const ws = workspaceRows.find(w => w.id === order.workspaceId);
                        return (
                          <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 font-mono text-xs text-gray-400">#{shortOrderId(order.id)}</td>
                            <td className="px-4 py-3 font-medium text-gray-800">{order.clientName}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                  FUEL_BADGE[order.fuelType] ?? 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {order.fuelType}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-semibold text-gray-700">{order.volume?.toLocaleString()} L</td>
                            <td className="px-4 py-3 text-xs text-gray-500">
                              {ws?.name ?? order.workspaceId?.slice(0, 8) ?? '—'}
                            </td>
                            <td className="px-4 py-3">
                              {order.urgency === 'URGENT' ? (
                                <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                                  🚨 Urgent
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">Normal</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                  STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {order.status.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400">
                              {new Date(order.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'users' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-base font-bold text-gray-900 mb-4">Users by Role</h3>
                  <DonutChart segments={roleDonut} />
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-base font-bold text-gray-900 mb-1">User Growth</h3>
                  <p className="text-xs text-gray-400 mb-4">All-time registrations per month</p>
                  <BarChart data={userGrowthChart} color="bg-indigo-500" />
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-bold text-gray-900">All Users ({users.length})</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {['Name', 'Email', 'Role', 'Workspace', 'Joined'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users
                      .sort((a, b) => {
                        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                        return bTime - aTime;
                      })
                      .map(u => {
                        const ws = workspaceRows.find(w => w.id === u.workspaceId);
                        return (
                          <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center flex-shrink-0">
                                  {((u as any).name ?? (u as any).companyName ?? 'U').charAt(0).toUpperCase()}
                                </div>
                                <span className="font-medium text-gray-800">
                                  {(u as any).name ?? (u as any).companyName ?? '—'}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500">{u.email}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                  ROLE_COLORS[u.role] ?? 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {u.role.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500">
                              {ws?.name ?? u.workspaceId?.slice(0, 8) ?? <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400">
                              {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'workspaces' && (
            <div className="space-y-6">
              {workspaceRows.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-gray-300 p-16 text-center">
                  <div className="text-5xl mb-4">🏢</div>
                  <p className="text-gray-500">No workspace data available.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {workspaceRows.map(ws => (
                      <div key={ws.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 font-bold text-sm flex items-center justify-center flex-shrink-0">
                            {ws.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{ws.name}</p>
                            <p className="text-xs text-gray-400">{ws.userCount} users</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-center mb-4">
                          <div className="bg-gray-50 rounded-lg p-2">
                            <p className="text-xs text-gray-400">Orders</p>
                            <p className="font-bold text-gray-800">{ws.orders}</p>
                          </div>
                          <div className="bg-green-50 rounded-lg p-2">
                            <p className="text-xs text-gray-400">Done</p>
                            <p className="font-bold text-green-700">{ws.completed}</p>
                          </div>
                          <div className="bg-blue-50 rounded-lg p-2">
                            <p className="text-xs text-gray-400">Volume</p>
                            <p className="font-bold text-blue-700 text-xs">
                              {ws.volume >= 1000 ? `${(ws.volume / 1000).toFixed(0)}k` : ws.volume} L
                            </p>
                          </div>
                        </div>

                        <div className="mb-3">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-500">Completion Rate</span>
                            <span
                              className={`font-bold ${
                                ws.rate >= 80 ? 'text-green-600' : ws.rate >= 50 ? 'text-yellow-600' : 'text-red-600'
                              }`}
                            >
                              {ws.rate}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                ws.rate >= 80 ? 'bg-green-500' : ws.rate >= 50 ? 'bg-yellow-400' : 'bg-red-500'
                              }`}
                              style={{ width: `${ws.rate}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex justify-between text-xs text-gray-400 pt-2 border-t border-gray-100">
                          <span>🚛 {ws.tspCount} TSP{ws.tspCount !== 1 ? 's' : ''}</span>
                          <span>👤 {ws.clientCount} Client{ws.clientCount !== 1 ? 's' : ''}</span>
                          <span>⏱ {ws.avgHours > 0 ? `${ws.avgHours}h avg` : '—'}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-gray-100">
                      <h3 className="font-bold text-gray-900">TSP Performance — Platform Wide</h3>
                      <p className="text-xs text-gray-400 mt-0.5">All transport providers across all workspaces</p>
                    </div>
                    {tspRows.length === 0 ? (
                      <div className="p-8 text-center text-gray-400 text-sm">No TSP data</div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            {['#', 'TSP Name', 'Orders', 'Completed', 'Volume', 'Drivers', 'Trucks', 'Rate', 'Avg Time'].map(h => (
                              <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {tspRows.map((tsp, i) => (
                            <tr key={tsp.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3">
                                <span
                                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                    i === 0
                                      ? 'bg-yellow-400 text-white'
                                      : i === 1
                                      ? 'bg-gray-300 text-gray-700'
                                      : i === 2
                                      ? 'bg-orange-400 text-white'
                                      : 'bg-gray-100 text-gray-500'
                                  }`}
                                >
                                  {i + 1}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-semibold text-gray-800">{tsp.name}</td>
                              <td className="px-4 py-3 text-gray-600">{tsp.orders}</td>
                              <td className="px-4 py-3 text-green-600 font-semibold">{tsp.completed}</td>
                              <td className="px-4 py-3 text-blue-600 font-semibold">
                                {tsp.volume > 0 ? `${tsp.volume.toLocaleString()} L` : '—'}
                              </td>
                              <td className="px-4 py-3 text-gray-600">{tsp.drivers}</td>
                              <td className="px-4 py-3 text-gray-600">{tsp.trucks}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-12 bg-gray-100 rounded-full h-1.5">
                                    <div
                                      className={`h-1.5 rounded-full ${
                                        tsp.rate >= 80 ? 'bg-green-500' : tsp.rate >= 50 ? 'bg-yellow-400' : 'bg-red-500'
                                      }`}
                                      style={{ width: `${tsp.rate}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-bold">{tsp.rate}%</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-indigo-600 font-semibold text-xs">
                                {tsp.avgHours > 0 ? `${tsp.avgHours}h` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}