// src/app/seller/reports/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser, getUsers, getOrders, setCurrentUser } from '@/src/lib/demo-data';
import { downloadCSV } from '@/src/lib/export-csv';

// ── Types ─────────────────────────────────────────────────────
interface Order {
  id: string;
  clientId: string;
  clientName: string;
  fuelType: string;
  volume: number;
  status: string;
  urgency: string;
  assignedTSPId?: string;
  assignedDriverName?: string;
  assignedTruckRegistration?: string;
  tankName?: string | null;
  notes?: string;
  createdAt: Date;
  completedAt?: Date;
  assignedAt?: Date;
  tripStartedAt?: Date;
}

// ── Helpers ───────────────────────────────────────────────────
type Range = '7d' | '30d' | '90d' | 'all';

function filterByRange(orders: Order[], range: Range): Order[] {
  if (range === 'all') return orders;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const cutoff = new Date(Date.now() - days * 86400000);
  return orders.filter(o => new Date(o.createdAt) >= cutoff);
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    acc[k] = [...(acc[k] ?? []), item];
    return acc;
  }, {} as Record<string, T[]>);
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

const FUEL_COLORS: Record<string, string> = {
  DIESEL: 'bg-blue-500',
  PETROL: 'bg-green-500',
  PREMIUM: 'bg-purple-500',
};

const FUEL_TEXT: Record<string, string> = {
  DIESEL: 'text-blue-700',
  PETROL: 'text-green-700',
  PREMIUM: 'text-purple-700',
};

const FUEL_BADGE: Record<string, string> = {
  DIESEL: 'bg-blue-100 text-blue-700',
  PETROL: 'bg-green-100 text-green-700',
  PREMIUM: 'bg-purple-100 text-purple-700',
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

  if (data.length === 0) {
    return <p className="text-center text-gray-400 text-sm py-8">No data for this period</p>;
  }

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
function DonutChart({
  segments,
}: {
  segments: { label: string; value: number }[];
}) {
  const total = segments.reduce((s, d) => s + d.value, 0);

  if (!total) {
    return <p className="text-gray-400 text-sm text-center py-6">No data</p>;
  }

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
            <span className="text-gray-600 font-medium">{seg.label}</span>
            <span className="text-gray-400">
              {seg.value.toLocaleString()} ({((seg.value / total) * 100).toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Funnel ────────────────────────────────────────────────────
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
export default function SellerReportsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [range, setRange] = useState<Range>('30d');
  const [tab, setTab] = useState<'overview' | 'orders' | 'clients' | 'tsp'>('overview');

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();

    if (!currentUser || currentUser.role !== 'SELLER_MANAGER') {
      router.push('/');
      return;
    }

    setUser(currentUser);

    const allOrders = getOrders();
    const wsOrders = allOrders
      .filter((o: any) => o.workspaceId === currentUser.workspaceId)
      .map((o: any) => ({
        ...o,
        createdAt: new Date(o.createdAt),
        completedAt: o.completedAt ? new Date(o.completedAt) : undefined,
        assignedAt: o.assignedAt ? new Date(o.assignedAt) : undefined,
        tripStartedAt: o.tripStartedAt ? new Date(o.tripStartedAt) : undefined,
      }));

    setOrders(wsOrders);
    setUsers(getUsers());
  }, [router]);

  const handleRoleChange = (userId: string) => {
    const newUser = users.find(u => u.id === userId);
    if (!newUser) return;

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
  };

  if (!mounted || !user) return null;

  const filtered = filterByRange(orders, range);
  const completed = filtered.filter(o => o.status === 'COMPLETED');
  const pending = filtered.filter(o => o.status === 'PENDING');
  const urgent = filtered.filter(o => o.urgency === 'URGENT');
  const totalVolume = completed.reduce((s, o) => s + (o.volume ?? 0), 0);
  const avgHours = avgDeliveryHours(completed);
  const completionRate =
    filtered.length > 0 ? Math.round((completed.length / filtered.length) * 100) : 0;

  const dailyChart = groupByDay(filtered);
  const monthlyVol = groupByMonth(completed);

  const fuelVols = groupBy(completed, o => o.fuelType);
  const fuelDonut = Object.entries(fuelVols).map(([label, arr]) => ({
    label,
    value: arr.reduce((s, o) => s + (o.volume ?? 0), 0),
  }));

  const urgencyDonut = [
    { label: 'Normal', value: filtered.filter(o => o.urgency !== 'URGENT').length },
    { label: 'Urgent', value: urgent.length },
  ].filter(d => d.value > 0);

  const byClient = groupBy(filtered, o => o.clientName ?? o.clientId);
  const clientRows = Object.entries(byClient)
    .map(([name, ords]) => ({
      name,
      total: ords.length,
      completed: ords.filter(o => o.status === 'COMPLETED').length,
      volume: ords
        .filter(o => o.status === 'COMPLETED')
        .reduce((s, o) => s + (o.volume ?? 0), 0),
      urgent: ords.filter(o => o.urgency === 'URGENT').length,
      last: new Date(Math.max(...ords.map(o => new Date(o.createdAt).getTime()))),
    }))
    .sort((a, b) => b.total - a.total);

  const byTSP = groupBy(
    filtered.filter(o => o.assignedTSPId),
    o => o.assignedTSPId!
  );

  const tspRows = Object.entries(byTSP)
    .map(([tspId, ords]) => {
      const tspUser = users.find(u => u.id === tspId);
      const done = ords.filter(o => o.status === 'COMPLETED');
      const avgH = avgDeliveryHours(done);

      return {
        name: tspUser?.name ?? tspUser?.companyName ?? tspId.slice(0, 8),
        assigned: ords.length,
        completed: done.length,
        rate: ords.length > 0 ? Math.round((done.length / ords.length) * 100) : 0,
        avgHours: avgH,
      };
    })
    .sort((a, b) => b.completed - a.completed);

  const exportOrders = () => {
    downloadCSV(
      'seller-orders',
      filtered.map(o => ({
        Order_ID: o.id,
        Client: o.clientName,
        Fuel_Type: o.fuelType,
        Volume_L: o.volume,
        Urgency: o.urgency,
        Status: o.status,
        Driver: o.assignedDriverName ?? '',
        Date: new Date(o.createdAt).toLocaleDateString(),
        Completed: o.completedAt ? new Date(o.completedAt).toLocaleDateString() : '',
      }))
    );
  };

  const exportClients = () => {
    downloadCSV(
      'client-activity',
      clientRows.map(c => ({
        Client: c.name,
        Total_Orders: c.total,
        Completed: c.completed,
        Completion_Pct: c.total > 0 ? `${Math.round((c.completed / c.total) * 100)}%` : '0%',
        Volume_L: c.volume,
        Urgent_Orders: c.urgent,
        Last_Order: c.last.toLocaleDateString(),
      }))
    );
  };

  const exportTSP = () => {
    downloadCSV(
      'tsp-performance',
      tspRows.map(t => ({
        TSP_Name: t.name,
        Assigned_Orders: t.assigned,
        Completed: t.completed,
        Completion_Rate: `${t.rate}%`,
        Avg_Delivery_Hrs: t.avgHours > 0 ? t.avgHours : '',
      }))
    );
  };

  const RANGES: { key: Range; label: string }[] = [
    { key: '7d', label: '7 days' },
    { key: '30d', label: '30 days' },
    { key: '90d', label: '90 days' },
    { key: 'all', label: 'All' },
  ];

  const TABS = [
    { key: 'overview', label: '📊 Overview' },
    { key: 'orders', label: '📦 Orders' },
    { key: 'clients', label: '👤 Clients' },
    { key: 'tsp', label: '🚛 TSP Performance' },
  ] as const;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />
      <div className="flex-1">
        <Header user={user} />

        <main className="p-8">
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Reports 📊</h1>
              <p className="text-sm text-gray-500 mt-1">
                Order volume, client activity, and TSP performance
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

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            {[
              {
                label: 'Total Orders',
                value: filtered.length,
                sub: 'all statuses',
                color: 'text-gray-900',
              },
              {
                label: 'Completed',
                value: completed.length,
                sub: `${completionRate}% rate`,
                color: 'text-green-600',
              },
              {
                label: 'Volume Dispatched',
                value: `${totalVolume.toLocaleString()} L`,
                sub: 'completed orders',
                color: 'text-blue-600',
              },
              {
                label: 'Avg Delivery Time',
                value: avgHours > 0 ? `${avgHours}h` : '—',
                sub: 'order → completed',
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

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              {
                label: 'Pending',
                value: pending.length,
                color: 'bg-yellow-50 border-yellow-200 text-yellow-700',
              },
              {
                label: 'Urgent',
                value: urgent.length,
                color: 'bg-red-50 border-red-200 text-red-700',
              },
              {
                label: 'Active Clients',
                value: Object.keys(byClient).length,
                color: 'bg-blue-50 border-blue-200 text-blue-700',
              },
              {
                label: 'TSPs Used',
                value: Object.keys(byTSP).length,
                color: 'bg-purple-50 border-purple-200 text-purple-700',
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

          {tab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-base font-bold text-gray-900 mb-1">Daily Orders</h3>
                  <p className="text-xs text-gray-400 mb-5">Number of orders placed per day</p>
                  <BarChart data={dailyChart} color="bg-blue-500" />
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-base font-bold text-gray-900 mb-1">Monthly Volume Delivered</h3>
                  <p className="text-xs text-gray-400 mb-5">Litres in completed orders per month</p>
                  <BarChart data={monthlyVol} color="bg-green-500" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-base font-bold text-gray-900 mb-4">Fuel Type Volume</h3>
                  <DonutChart segments={fuelDonut} />
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-base font-bold text-gray-900 mb-4">Urgency Split</h3>
                  <DonutChart segments={urgencyDonut} />
                  {urgent.length > 0 && (
                    <p className="text-xs text-red-500 mt-4 font-semibold">
                      🚨 {urgent.length} urgent order{urgent.length > 1 ? 's' : ''} in this period
                    </p>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-base font-bold text-gray-900 mb-4">Order Pipeline</h3>
                  <StatusFunnel orders={filtered} />
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <h3 className="text-base font-bold text-gray-900 mb-4">Volume by Fuel Type</h3>
                {Object.keys(fuelVols).length === 0 ? (
                  <p className="text-gray-400 text-sm">No completed orders yet</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(fuelVols).map(([ft, ords]) => {
                      const vol = ords.reduce((s, o) => s + (o.volume ?? 0), 0);
                      const pct = totalVolume > 0 ? Math.round((vol / totalVolume) * 100) : 0;

                      return (
                        <div key={ft}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className={`font-semibold ${FUEL_TEXT[ft] ?? 'text-gray-600'}`}>{ft}</span>
                            <span className="text-gray-500">
                              {vol.toLocaleString()} L — {pct}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2.5">
                            <div
                              className={`${FUEL_COLORS[ft] ?? 'bg-gray-400'} h-2.5 rounded-full`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'orders' && (
            <div>
              {filtered.length > 0 && (
                <div className="flex justify-end mb-4">
                  <button
                    onClick={exportOrders}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
                  >
                    ⬇️ Export CSV
                  </button>
                </div>
              )}

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {filtered.length === 0 ? (
                  <div className="p-16 text-center">
                    <div className="text-5xl mb-4">📦</div>
                    <p className="text-gray-500">No orders in this period.</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {['Order ID', 'Client', 'Fuel', 'Volume', 'Urgency', 'Status', 'Driver', 'Date'].map(h => (
                          <th
                            key={h}
                            className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filtered
                        .slice()
                        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                        .map(order => (
                          <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 font-mono text-xs text-gray-400">#{order.id.slice(0, 8)}</td>
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
                            <td className="px-4 py-3 font-semibold text-gray-800">
                              {order.volume?.toLocaleString()} L
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
                            <td className="px-4 py-3 text-xs text-gray-500">
                              {order.assignedDriverName ?? <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400">
                              {new Date(order.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {tab === 'clients' && (
            <div>
              {clientRows.length > 0 && (
                <div className="flex justify-end mb-4">
                  <button
                    onClick={exportClients}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
                  >
                    ⬇️ Export CSV
                  </button>
                </div>
              )}

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {clientRows.length === 0 ? (
                  <div className="p-16 text-center">
                    <div className="text-5xl mb-4">👤</div>
                    <p className="text-gray-500">No client data in this period.</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {['Client', 'Total Orders', 'Completed', 'Volume Received', 'Urgent', 'Last Order'].map(h => (
                          <th
                            key={h}
                            className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {clientRows.map((c, i) => (
                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center flex-shrink-0">
                                {c.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium text-gray-800">{c.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-semibold text-gray-800">{c.total}</td>
                          <td className="px-4 py-3">
                            <span className="text-green-600 font-semibold">{c.completed}</span>
                            <span className="text-gray-400 text-xs ml-1">
                              ({c.total > 0 ? Math.round((c.completed / c.total) * 100) : 0}%)
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold text-blue-600">
                            {c.volume > 0 ? `${c.volume.toLocaleString()} L` : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {c.urgent > 0 ? (
                              <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                                🚨 {c.urgent}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">0</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400">{c.last.toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {tab === 'tsp' && (
            <div>
              {tspRows.length > 0 && (
                <div className="flex justify-end mb-4">
                  <button
                    onClick={exportTSP}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
                  >
                    ⬇️ Export CSV
                  </button>
                </div>
              )}

              <div className="space-y-6">
                {tspRows.length === 0 ? (
                  <div className="bg-white rounded-xl border border-dashed border-gray-300 p-16 text-center">
                    <div className="text-5xl mb-4">🚛</div>
                    <p className="text-gray-500">No TSP data in this period.</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {tspRows.map((tsp, i) => (
                        <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-sm flex-shrink-0">
                              {tsp.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">{tsp.name}</p>
                              <p className="text-xs text-gray-400">Transport Provider</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2 text-center mb-4">
                            <div className="bg-gray-50 rounded-lg p-2">
                              <p className="text-xs text-gray-400">Assigned</p>
                              <p className="font-bold text-gray-800">{tsp.assigned}</p>
                            </div>
                            <div className="bg-green-50 rounded-lg p-2">
                              <p className="text-xs text-gray-400">Done</p>
                              <p className="font-bold text-green-700">{tsp.completed}</p>
                            </div>
                            <div className="bg-blue-50 rounded-lg p-2">
                              <p className="text-xs text-gray-400">Avg Time</p>
                              <p className="font-bold text-blue-700">{tsp.avgHours > 0 ? `${tsp.avgHours}h` : '—'}</p>
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-gray-500">Completion Rate</span>
                              <span
                                className={`font-bold ${
                                  tsp.rate >= 80 ? 'text-green-600' : tsp.rate >= 50 ? 'text-yellow-600' : 'text-red-600'
                                }`}
                              >
                                {tsp.rate}%
                              </span>
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
                        </div>
                      ))}
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="p-5 border-b border-gray-100">
                        <h3 className="font-bold text-gray-900">TSP Comparison</h3>
                      </div>
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            {['TSP Name', 'Assigned Orders', 'Completed', 'Completion Rate', 'Avg Delivery'].map(h => (
                              <th
                                key={h}
                                className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {tspRows.map((tsp, i) => (
                            <tr key={i} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 font-semibold text-gray-800">{tsp.name}</td>
                              <td className="px-4 py-3 text-gray-600">{tsp.assigned}</td>
                              <td className="px-4 py-3 text-green-600 font-semibold">{tsp.completed}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-16 bg-gray-100 rounded-full h-1.5">
                                    <div
                                      className={`h-1.5 rounded-full ${
                                        tsp.rate >= 80 ? 'bg-green-500' : tsp.rate >= 50 ? 'bg-yellow-400' : 'bg-red-500'
                                      }`}
                                      style={{ width: `${tsp.rate}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-semibold">{tsp.rate}%</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-indigo-600 font-semibold">
                                {tsp.avgHours > 0 ? `${tsp.avgHours}h` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}