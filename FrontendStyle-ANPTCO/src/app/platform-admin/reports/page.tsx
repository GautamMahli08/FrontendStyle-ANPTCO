'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api } from '@/src/lib/api';

function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function today() { return new Date().toISOString().slice(0, 10); }

export default function PlatformAdminReportsPage() {
  const router = useRouter();
  const user   = getCurrentUser();
  const [busy,  setBusy]  = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!user) router.replace('/auth/login'); }, [router, user]);
  if (!user) return null;

  const downloadOrders = async () => {
    setBusy('orders'); setError(null);
    try {
      const orders = await api.orders.list();
      const header = ['Order ID', 'Status', 'Fuel Type', 'Volume (L)', 'Destination Station', 'Created At'];
      const rows   = orders.map(o => [
        o.id, o.status, o.fuel_type ?? '', String(o.volume_liters ?? ''),
        o.destination_station_id ?? '', o.created_at,
      ]);
      downloadCSV(`orders-${today()}.csv`, [header, ...rows]);
    } catch (e: any) {
      setError(e.message ?? 'Export failed');
    } finally {
      setBusy(null);
    }
  };

  const downloadEvents = async () => {
    setBusy('events'); setError(null);
    try {
      const events = await api.fleet.events();
      const header = ['Event ID', 'Truck ID', 'Event Type', 'Geofence Zone', 'Latitude', 'Longitude', 'Occurred At'];
      const rows   = events.map(e => [
        e.id, e.truck_id, e.event_type,
        e.geofence_zone ?? '',
        String(e.latitude ?? ''), String(e.longitude ?? ''),
        e.occurred_at,
      ]);
      downloadCSV(`events-${today()}.csv`, [header, ...rows]);
    } catch (e: any) {
      setError(e.message ?? 'Export failed');
    } finally {
      setBusy(null);
    }
  };

  const downloadTrucks = async () => {
    setBusy('trucks'); setError(null);
    try {
      const trucks = await api.trucks.list();
      const header = ['Truck ID', 'Device ID', 'Status', 'Latitude', 'Longitude', 'Speed (km/h)', 'Total Fuel (L)', 'Last Seen'];
      const rows   = trucks.map(t => [
        t.id, t.device_id, t.status,
        String(t.latitude ?? ''), String(t.longitude ?? ''),
        String(t.speed ?? ''), String(t.total_fuel_liters ?? ''),
        t.last_seen_at ?? '',
      ]);
      downloadCSV(`fleet-${today()}.csv`, [header, ...rows]);
    } catch (e: any) {
      setError(e.message ?? 'Export failed');
    } finally {
      setBusy(null);
    }
  };

  const downloadTrips = async () => {
    setBusy('trips'); setError(null);
    try {
      const trips = await api.trips.list();
      const header = ['Trip ID', 'Truck ID', 'Order ID', 'Status', 'Driver', 'Origin', 'Destination', 'Created At'];
      const rows   = trips.map(t => [
        t.id, t.truck_id, t.order_id ?? '', t.status,
        t.driver_name ?? '', t.origin_name ?? '', t.dest_name ?? '',
        t.created_at,
      ]);
      downloadCSV(`trips-${today()}.csv`, [header, ...rows]);
    } catch (e: any) {
      setError(e.message ?? 'Export failed');
    } finally {
      setBusy(null);
    }
  };

  const REPORTS = [
    { key: 'orders', label: 'All Orders', desc: 'Full order history with status, fuel type, volume and destination', icon: '📋', action: downloadOrders },
    { key: 'trips',  label: 'All Trips',  desc: 'Trip records with truck, driver, origin, destination and status',   icon: '🗺️',  action: downloadTrips  },
    { key: 'events', label: 'Asset Events', desc: 'Geofence entries/exits, fuel fills, ignition events and more',   icon: '⚡',  action: downloadEvents },
    { key: 'trucks', label: 'Fleet Status', desc: 'Live truck positions, fuel levels, and last-seen timestamps',     icon: '🚛',  action: downloadTrucks },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="PLATFORM_ADMIN" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Platform Reports" user={user} />
        <main className="flex-1 overflow-y-auto p-6">
          <p className="text-sm text-slate-500 mb-6">Download CSV exports of platform data.</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
            {REPORTS.map(r => (
              <div key={r.key} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{r.icon}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-800 text-sm">{r.label}</h3>
                    <p className="text-xs text-slate-400 mt-0.5 mb-4">{r.desc}</p>
                    <button
                      onClick={r.action}
                      disabled={!!busy}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      {busy === r.key ? 'Exporting…' : `↓ Download CSV`}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
