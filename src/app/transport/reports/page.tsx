// src/app/transport/reports/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { downloadCSV } from '@/src/lib/export-csv';
import {
  getCurrentUser,
  getUsers,
  getOrders,
  getDrivers,
  getTrucks,
  setCurrentUser,
  shortOrderId,
} from '@/src/lib/demo-data';

// ── Helpers ───────────────────────────────────────────────────
type Range = '7d' | '30d' | '90d' | 'all';

function filterByRange(orders: any[], range: Range): any[] {
  if (range === 'all') return orders;
  const days   = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const cutoff = new Date(Date.now() - days * 86400000);
  return orders.filter(o => new Date(o.createdAt) >= cutoff);
}

function tripDurationHours(order: any): number | null {
  if (!order.tripStartedAt || !order.completedAt) return null;
  return Math.round(
    (new Date(order.completedAt).getTime() - new Date(order.tripStartedAt).getTime()) / 3600000
  );
}

function avgOf(nums: (number | null)[]): number {
  const valid = nums.filter((n): n is number => n !== null);
  if (!valid.length) return 0;
  return Math.round(valid.reduce((s, n) => s + n, 0) / valid.length);
}

function groupByDay(orders: any[]): { label: string; value: number }[] {
  const map: Record<string, number> = {};
  orders.forEach(o => {
    const d = new Date(o.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    map[d] = (map[d] ?? 0) + 1;
  });
  return Object.entries(map).map(([label, value]) => ({ label, value }));
}

function groupByMonth(orders: any[]): { label: string; value: number }[] {
  const map: Record<string, number> = {};
  orders.forEach(o => {
    const k = new Date(o.createdAt).toLocaleString('default', { month: 'short', year: '2-digit' });
    map[k] = (map[k] ?? 0) + (o.volume ?? 0);
  });
  return Object.entries(map).map(([label, value]) => ({ label, value }));
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED:        'bg-green-100 text-green-700',
  PENDING:          'bg-yellow-100 text-yellow-700',
  EN_ROUTE:         'bg-blue-100 text-blue-700',
  ARRIVED:          'bg-indigo-100 text-indigo-700',
  ASSIGNED:         'bg-cyan-100 text-cyan-700',
  ASSIGNED_TO_TSP:  'bg-orange-100 text-orange-700',
};

const FUEL_COLORS: Record<string, string> = {
  DIESEL:  'bg-blue-500',
  PETROL:  'bg-green-500',
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
          const pct    = seg.value / total;
          const dash   = pct * 100;
          const offset = cum * 100;
          cum += pct;
          return (
            <circle
              key={i} cx="18" cy="18" r="15.9" fill="none"
              stroke={COLORS[i % COLORS.length]} strokeWidth="3.5"
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
              {seg.value} ({((seg.value / total) * 100).toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Rating Bar ────────────────────────────────────────────────
function RatingBar({
  value,
  max = 100,
  color = 'bg-blue-500',
}: {
  value: number;
  max?: number;
  color?: string;
}) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div
          className={`${color} h-2 rounded-full transition-all`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-gray-600 w-8 text-right">{value}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────
export default function TransportReportsPage() {
  const router = useRouter();
  const [user,     setUser]     = useState<any>(null);
  const [mounted,  setMounted]  = useState(false);
  const [orders,   setOrders]   = useState<any[]>([]);
  const [drivers,  setDrivers]  = useState<any[]>([]);
  const [trucks,   setTrucks]   = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [range,    setRange]    = useState<Range>('30d');
  const [tab,      setTab]      = useState<'overview' | 'trips' | 'drivers' | 'fleet'>('overview');

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();
    if (!currentUser) { router.push('/'); return; }

    if (currentUser.role !== 'TRANSPORT_ADMIN') {
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
    setAllUsers(
      getUsers().map((u: any) => ({
        ...u,
        createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
      }))
    );
    setOrders(
      getOrders().map((o: any) => ({
        ...o,
        createdAt:     new Date(o.createdAt),
        completedAt:   o.completedAt   ? new Date(o.completedAt)   : undefined,
        tripStartedAt: o.tripStartedAt ? new Date(o.tripStartedAt) : undefined,
      }))
    );
    setDrivers(getDrivers());
    setTrucks(getTrucks());
  }, [router]);

  const handleRoleChange = (userId: string) => {
    const newUser = allUsers.find((u: any) => u.id === userId);
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

  // ── Derived metrics ───────────────────────────────────────
  const filtered       = filterByRange(orders, range);
  const completed      = filtered.filter(o => o.status === 'COMPLETED');
  const active         = filtered.filter(o => ['ASSIGNED', 'EN_ROUTE', 'ARRIVED'].includes(o.status));
  const totalVolume    = completed.reduce((s, o) => s + (o.volume ?? 0), 0);
  const completionRate = filtered.length > 0 ? Math.round((completed.length / filtered.length) * 100) : 0;
  const avgTripHours   = avgOf(completed.map(tripDurationHours));
  const dailyChart     = groupByDay(filtered);
  const monthlyVol     = groupByMonth(completed);

  const fuelVolMap: Record<string, number> = {};
  completed.forEach(o => {
    fuelVolMap[o.fuelType] = (fuelVolMap[o.fuelType] ?? 0) + (o.volume ?? 0);
  });
  const fuelDonut = Object.entries(fuelVolMap).map(([label, value]) => ({ label, value }));

  const statusMap: Record<string, number> = {};
  filtered.forEach(o => { statusMap[o.status] = (statusMap[o.status] ?? 0) + 1; });
  const statusDonut = Object.entries(statusMap).map(([label, value]) => ({ label, value }));

  const driverStats = drivers
    .map((driver: any) => {
      const driverOrders    = filtered.filter(o => o.assignedDriverId === driver.id);
      const driverCompleted = driverOrders.filter(o => o.status === 'COMPLETED');
      const driverVolume    = driverCompleted.reduce((s: number, o: any) => s + (o.volume ?? 0), 0);
      const avgH            = avgOf(driverCompleted.map(tripDurationHours));
      const rate            = driverOrders.length > 0
        ? Math.round((driverCompleted.length / driverOrders.length) * 100) : 0;
      const truck = trucks.find((t: any) => t.id === driver.assignedTruckId);
      return {
        id: driver.id,
        name: `${driver.firstName} ${driver.lastName}`,
        phone: driver.phone,
        status: driver.currentStatus,
        verified: driver.verified,
        license: driver.licenseNumber,
        truck: truck?.registrationNumber ?? null,
        trips: driverOrders.length,
        completed: driverCompleted.length,
        volume: driverVolume,
        avgHours: avgH,
        rate,
      };
    })
    .sort((a, b) => b.completed - a.completed);

  const truckStats = trucks
    .map((truck: any) => {
      const truckOrders    = filtered.filter(o => o.assignedTruckId === truck.id);
      const truckCompleted = truckOrders.filter(o => o.status === 'COMPLETED');
      const truckVolume    = truckCompleted.reduce((s: number, o: any) => s + (o.volume ?? 0), 0);
      const utilRate       = truckOrders.length > 0
        ? Math.round((truckCompleted.length / truckOrders.length) * 100) : 0;
      const driver = drivers.find((d: any) => d.assignedTruckId === truck.id);
      return {
        id: truck.id,
        reg: truck.registrationNumber,
        capacity: truck.capacity,
        fuelType: truck.fuelType ?? '—',
        status: truck.status,
        compartments: truck.compartments?.length ?? 0,
        trips: truckOrders.length,
        completed: truckCompleted.length,
        volume: truckVolume,
        utilRate,
        driverName: driver ? `${driver.firstName} ${driver.lastName}` : null,
      };
    })
    .sort((a, b) => b.trips - a.trips);

  const fleetStatusMap: Record<string, number> = {};
  trucks.forEach((t: any) => { fleetStatusMap[t.status] = (fleetStatusMap[t.status] ?? 0) + 1; });
  const fleetDonut = Object.entries(fleetStatusMap).map(([label, value]) => ({ label, value }));

  const driverStatusMap: Record<string, number> = {};
  drivers.forEach((d: any) => { driverStatusMap[d.currentStatus] = (driverStatusMap[d.currentStatus] ?? 0) + 1; });
  const driverDonut = Object.entries(driverStatusMap).map(([label, value]) => ({ label, value }));

  const exportTrips = () =>
    downloadCSV('trip-log', filtered.map(o => ({
      Order_ID:     o.id,
      Client:       o.clientName,
      Fuel_Type:    o.fuelType,
      Volume_L:     o.volume,
      Driver:       o.assignedDriverName ?? '',
      Truck:        o.assignedTruckRegistration ?? '',
      Status:       o.status,
      Duration_Hrs: tripDurationHours(o) ?? '',
      Date:         new Date(o.createdAt).toLocaleDateString(),
    })));

  const exportDrivers = () =>
    downloadCSV('driver-performance', driverStats.map(d => ({
      Driver:           d.name,
      Phone:            d.phone,
      Status:           d.status,
      Truck:            d.truck ?? '',
      Trips:            d.trips,
      Completed:        d.completed,
      Volume_L:         d.volume,
      Avg_Duration_Hrs: d.avgHours > 0 ? d.avgHours : '',
      Completion_Rate:  d.rate + '%',
    })));

  const exportFleet = () =>
    downloadCSV('fleet-report', truckStats.map(t => ({
      Registration: t.reg,
      Capacity_L:   t.capacity,
      Driver:       t.driverName ?? '',
      Status:       t.status,
      Compartments: t.compartments,
      Trips:        t.trips,
      Completed:    t.completed,
      Volume_L:     t.volume,
      Util_Rate:    t.utilRate + '%',
    })));

  const RANGES: { key: Range; label: string }[] = [
    { key: '7d',  label: '7 days'  },
    { key: '30d', label: '30 days' },
    { key: '90d', label: '90 days' },
    { key: 'all', label: 'All'     },
  ];

  const TABS = [
    { key: 'overview', label: '📊 Overview' },
    { key: 'trips',    label: '🗺️ Trip Log'  },
    { key: 'drivers',  label: '👤 Drivers'   },
    { key: 'fleet',    label: '🚛 Fleet'     },
  ] as const;

  const exportConfig: Partial<Record<
    'overview' | 'trips' | 'drivers' | 'fleet',
    { data: any[]; onExport: () => void }
  >> = {
    trips:   { data: filtered,    onExport: exportTrips   },
    drivers: { data: driverStats, onExport: exportDrivers },
    fleet:   { data: truckStats,  onExport: exportFleet   },
  };
  const currentExport = exportConfig[tab];

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />
      <div className="flex-1">
        <Header user={user} />

        <main className="p-8">
          {/* Header + Range Selector */}
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
              <p className="text-sm text-gray-500 mt-1">
                Trip history, driver performance, and fleet utilization
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

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
            {[
              { label: 'Total Trips',       value: filtered.length,                              sub: 'in period',        color: 'text-gray-900'   },
              { label: 'Completed',         value: completed.length,                             sub: `${completionRate}% rate`, color: 'text-green-600' },
              { label: 'Volume Delivered',  value: `${totalVolume.toLocaleString()} L`,          sub: 'completed trips',  color: 'text-blue-600'   },
              { label: 'Avg Trip Duration', value: avgTripHours > 0 ? `${avgTripHours}h` : '—', sub: 'start → complete', color: 'text-indigo-600' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
                <p className="text-sm text-gray-500 mb-1">{kpi.label}</p>
                <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
                <p className="text-xs text-gray-400 mt-1">{kpi.sub}</p>
              </div>
            ))}
          </div>

          {/* Secondary Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Active Now',        value: active.length,                                                          color: 'bg-blue-50 border-blue-200 text-blue-700'      },
              { label: 'Total Drivers',     value: drivers.length,                                                         color: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
              { label: 'Total Trucks',      value: trucks.length,                                                          color: 'bg-purple-50 border-purple-200 text-purple-700' },
              { label: 'Available Drivers', value: drivers.filter((d: any) => d.currentStatus === 'AVAILABLE').length,    color: 'bg-green-50 border-green-200 text-green-700'    },
            ].map(s => (
              <div key={s.label} className={`rounded-xl border p-4 ${s.color}`}>
                <p className="text-xs font-medium opacity-70">{s.label}</p>
                <p className="text-2xl font-bold mt-1">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Tab Nav */}
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

          {/* Export Button */}
          {(tab === 'trips' || tab === 'drivers' || tab === 'fleet') &&
            (currentExport?.data?.length ?? 0) > 0 && (
              <div className="flex justify-end mb-4">
                <button
                  onClick={currentExport!.onExport}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
                >
                  ⬇️ Export CSV
                </button>
              </div>
            )}

          {/* ── Overview Tab ── */}
          {tab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-base font-bold text-gray-900 mb-1">Daily Trips</h3>
                  <p className="text-xs text-gray-400 mb-5">Trips assigned per day</p>
                  <BarChart data={dailyChart} color="bg-blue-500" />
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-base font-bold text-gray-900 mb-1">Monthly Volume Delivered</h3>
                  <p className="text-xs text-gray-400 mb-5">Litres in completed trips per month</p>
                  <BarChart data={monthlyVol} color="bg-green-500" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-base font-bold text-gray-900 mb-4">Fuel Type Delivered</h3>
                  <DonutChart segments={fuelDonut} />
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-base font-bold text-gray-900 mb-4">Fleet Status</h3>
                  <DonutChart segments={fleetDonut} />
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-base font-bold text-gray-900 mb-4">Driver Status</h3>
                  <DonutChart segments={driverDonut} />
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-gray-900">Top Drivers</h3>
                  <button onClick={() => setTab('drivers')} className="text-sm text-blue-600 hover:underline">
                    View All
                  </button>
                </div>
                {driverStats.length === 0 ? (
                  <p className="text-gray-400 text-sm">No driver data</p>
                ) : (
                  <div className="space-y-3">
                    {driverStats.slice(0, 4).map((d, i) => (
                      <div key={d.id} className="flex items-center gap-4">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                          i === 0 ? 'bg-yellow-400 text-white' :
                          i === 1 ? 'bg-gray-300 text-gray-700' :
                          i === 2 ? 'bg-orange-400 text-white' : 'bg-gray-100 text-gray-500'
                        }`}>{i + 1}</span>
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-0.5">
                            <span className="font-semibold text-gray-800">{d.name}</span>
                            <span className="text-gray-500">{d.completed} trips</span>
                          </div>
                          <RatingBar
                            value={d.rate} max={100}
                            color={d.rate >= 80 ? 'bg-green-500' : d.rate >= 50 ? 'bg-yellow-400' : 'bg-red-500'}
                          />
                        </div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                          d.rate >= 80 ? 'bg-green-100 text-green-700' :
                          d.rate >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'
                        }`}>{d.rate}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Trips Tab ── */}
          {tab === 'trips' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {filtered.length === 0 ? (
                <div className="p-16 text-center">
                  <div className="text-5xl mb-4">🗺️</div>
                  <p className="text-gray-500">No trips in this period.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['Order', 'Client', 'Fuel', 'Volume', 'Driver', 'Truck', 'Status', 'Duration', 'Date'].map(h => (
                        <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((order: any) => {
                      const dur = tripDurationHours(order);
                      return (
                        <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-3">#{shortOrderId(order.id)}</td>
                          <td className="px-4 py-3">{order.clientName}</td>
                          <td className="px-4 py-3">{order.fuelType}</td>
                          <td className="px-4 py-3">{order.volume} L</td>
                          <td className="px-4 py-3">{order.assignedDriverName ?? '-'}</td>
                          <td className="px-4 py-3">{order.assignedTruckRegistration ?? '-'}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                              {order.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">{dur ? `${dur}h` : '-'}</td>
                          <td className="px-4 py-3">{new Date(order.createdAt).toLocaleDateString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Drivers Tab ── */}
          {tab === 'drivers' && (
            <div className="space-y-6">
              {driverStats.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-gray-300 p-16 text-center">
                  <div className="text-5xl mb-4">👤</div>
                  <p className="text-gray-500">No drivers registered yet.</p>
                  <button
                    onClick={() => router.push('/transport/drivers')}
                    className="mt-4 bg-blue-600 text-white font-semibold px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    + Add Drivers
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {driverStats.map(d => (
                      <div key={d.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center flex-shrink-0">
                            {d.name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 truncate">{d.name}</p>
                            <p className="text-xs text-gray-400">{d.phone}</p>
                          </div>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                            d.status === 'AVAILABLE' ? 'bg-green-100 text-green-700' :
                            d.status === 'ON_TRIP'   ? 'bg-blue-100 text-blue-700'  : 'bg-gray-100 text-gray-500'
                          }`}>{d.status}</span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-center mb-4">
                          <div className="bg-gray-50 rounded-lg p-2"><p className="text-xs text-gray-400">Trips</p><p className="font-bold text-gray-800">{d.trips}</p></div>
                          <div className="bg-green-50 rounded-lg p-2"><p className="text-xs text-gray-400">Done</p><p className="font-bold text-green-700">{d.completed}</p></div>
                          <div className="bg-blue-50 rounded-lg p-2"><p className="text-xs text-gray-400">Avg</p><p className="font-bold text-blue-700">{d.avgHours > 0 ? `${d.avgHours}h` : '—'}</p></div>
                        </div>

                        <div className="mb-3">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-500">Completion Rate</span>
                            <span className={`font-bold ${d.rate >= 80 ? 'text-green-600' : d.rate >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>{d.rate}%</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${d.rate >= 80 ? 'bg-green-500' : d.rate >= 50 ? 'bg-yellow-400' : 'bg-red-500'}`}
                              style={{ width: `${d.rate}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex justify-between text-xs text-gray-400 pt-2 border-t border-gray-100">
                          <span>🚛 {d.truck ?? 'No truck'}</span>
                          <span>📦 {d.volume.toLocaleString()} L delivered</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-gray-100">
                      <h3 className="font-bold text-gray-900">Driver Comparison</h3>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          {['Driver', 'Truck', 'Status', 'Trips', 'Completed', 'Volume', 'Avg Duration', 'Rate'].map(h => (
                            <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {driverStats.map(d => (
                          <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center flex-shrink-0">
                                  {d.name.charAt(0)}
                                </div>
                                <span className="font-medium text-gray-800">{d.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500">{d.truck ?? '—'}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                d.status === 'AVAILABLE' ? 'bg-green-100 text-green-700' :
                                d.status === 'ON_TRIP'   ? 'bg-blue-100 text-blue-700'  : 'bg-gray-100 text-gray-500'
                              }`}>{d.status}</span>
                            </td>
                            <td className="px-4 py-3 text-gray-600">{d.trips}</td>
                            <td className="px-4 py-3 text-green-600 font-semibold">{d.completed}</td>
                            <td className="px-4 py-3 text-blue-600 font-semibold">{d.volume > 0 ? `${d.volume.toLocaleString()} L` : '—'}</td>
                            <td className="px-4 py-3 text-indigo-600 font-semibold">{d.avgHours > 0 ? `${d.avgHours}h` : '—'}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-12 bg-gray-100 rounded-full h-1.5">
                                  <div
                                    className={`h-1.5 rounded-full ${d.rate >= 80 ? 'bg-green-500' : d.rate >= 50 ? 'bg-yellow-400' : 'bg-red-500'}`}
                                    style={{ width: `${d.rate}%` }}
                                  />
                                </div>
                                <span className="text-xs font-bold">{d.rate}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Fleet Tab ── */}
          {tab === 'fleet' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-base font-bold text-gray-900 mb-4">Fleet Status Breakdown</h3>
                  <DonutChart segments={fleetDonut} />
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-base font-bold text-gray-900 mb-4">Fuel Type Capacity</h3>
                  <div className="space-y-3">
                    {Object.entries(
                      trucks.reduce((acc: Record<string, number>, t: any) => {
                        const ft = t.fuelType ?? 'MIXED';
                        acc[ft] = (acc[ft] ?? 0) + (t.capacity ?? 0);
                        return acc;
                      }, {})
                    ).map(([ft, cap]) => {
                      const totalCap = trucks.reduce((s: number, t: any) => s + (t.capacity ?? 0), 0);
                      const pct = totalCap > 0 ? Math.round(((cap as number) / totalCap) * 100) : 0;
                      return (
                        <div key={ft}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-semibold text-gray-700">{ft}</span>
                            <span className="text-gray-500">{(cap as number).toLocaleString()} L ({pct}%)</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div
                              className={`${FUEL_COLORS[ft] ?? 'bg-gray-400'} h-2 rounded-full`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {truckStats.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-gray-300 p-16 text-center">
                  <div className="text-5xl mb-4">🚛</div>
                  <p className="text-gray-500">No trucks registered yet.</p>
                  <button
                    onClick={() => router.push('/transport/fleet')}
                    className="mt-4 bg-blue-600 text-white font-semibold px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    + Add Trucks
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {truckStats.map(t => (
                      <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="text-lg font-bold text-gray-900">{t.reg}</p>
                            <p className="text-xs text-gray-400">{t.capacity?.toLocaleString()} L capacity</p>
                          </div>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            t.status === 'IDLE'     ? 'bg-gray-100 text-gray-600'    :
                            t.status === 'ASSIGNED' ? 'bg-cyan-100 text-cyan-700'    :
                            t.status === 'EN_ROUTE' ? 'bg-blue-100 text-blue-700'    :
                            t.status === 'ARRIVED'  ? 'bg-indigo-100 text-indigo-700': 'bg-green-100 text-green-700'
                          }`}>{t.status}</span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-center mb-4">
                          <div className="bg-gray-50 rounded-lg p-2"><p className="text-xs text-gray-400">Trips</p><p className="font-bold text-gray-800">{t.trips}</p></div>
                          <div className="bg-green-50 rounded-lg p-2"><p className="text-xs text-gray-400">Done</p><p className="font-bold text-green-700">{t.completed}</p></div>
                          <div className="bg-blue-50 rounded-lg p-2"><p className="text-xs text-gray-400">Comps</p><p className="font-bold text-blue-700">{t.compartments}</p></div>
                        </div>

                        <div className="mb-3">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-500">Utilization Rate</span>
                            <span className={`font-bold ${t.utilRate >= 80 ? 'text-green-600' : t.utilRate >= 50 ? 'text-yellow-600' : 'text-gray-500'}`}>{t.utilRate}%</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${t.utilRate >= 80 ? 'bg-green-500' : t.utilRate >= 50 ? 'bg-yellow-400' : 'bg-gray-400'}`}
                              style={{ width: `${t.utilRate}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex justify-between text-xs text-gray-400 pt-2 border-t border-gray-100">
                          <span>👤 {t.driverName ?? 'No driver'}</span>
                          <span>📦 {t.volume.toLocaleString()} L</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-gray-100">
                      <h3 className="font-bold text-gray-900">Fleet Comparison</h3>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          {['Reg No.', 'Capacity', 'Driver', 'Status', 'Trips', 'Volume', 'Util. Rate'].map(h => (
                            <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {truckStats.map(t => (
                          <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 font-bold text-gray-900">{t.reg}</td>
                            <td className="px-4 py-3 text-gray-600">{t.capacity?.toLocaleString()} L</td>
                            <td className="px-4 py-3 text-xs text-gray-500">{t.driverName ?? '—'}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                t.status === 'IDLE'     ? 'bg-gray-100 text-gray-600' :
                                t.status === 'ASSIGNED' ? 'bg-cyan-100 text-cyan-700' :
                                t.status === 'EN_ROUTE' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                              }`}>{t.status}</span>
                            </td>
                            <td className="px-4 py-3 text-gray-600">{t.trips}</td>
                            <td className="px-4 py-3 text-blue-600 font-semibold">{t.volume > 0 ? `${t.volume.toLocaleString()} L` : '—'}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-12 bg-gray-100 rounded-full h-1.5">
                                  <div
                                    className={`h-1.5 rounded-full ${t.utilRate >= 80 ? 'bg-green-500' : t.utilRate >= 50 ? 'bg-yellow-400' : 'bg-gray-400'}`}
                                    style={{ width: `${t.utilRate}%` }}
                                  />
                                </div>
                                <span className="text-xs font-bold">{t.utilRate}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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