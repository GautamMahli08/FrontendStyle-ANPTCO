'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, type ApiClientMe, type ApiClientTruck, type ApiAssetEvent, type ApiTrip } from '@/src/lib/api';

type Tab = 'live' | 'events' | 'trips';

const EVENT_LABELS: Record<string, string> = {
  FUEL_FILL:      'Fuel Fill',
  FUEL_DRAIN:     'Fuel Drain',
  BATTERY_ON:     'Battery On',
  BATTERY_OFF:    'Battery Off',
  IGNITION_ON:    'Ignition On',
  IGNITION_OFF:   'Ignition Off',
  MOVEMENT_START: 'Movement Start',
  MOVEMENT_STOP:  'Movement Stop',
};

const EVENT_DOT: Record<string, string> = {
  FUEL_FILL:      'bg-green-500',
  FUEL_DRAIN:     'bg-red-500',
  BATTERY_ON:     'bg-blue-500',
  BATTERY_OFF:    'bg-gray-400',
  IGNITION_ON:    'bg-yellow-500',
  IGNITION_OFF:   'bg-gray-400',
  MOVEMENT_START: 'bg-orange-500',
  MOVEMENT_STOP:  'bg-gray-400',
};

function fmt(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default function ERPClientDashboard() {
  const searchParams = useSearchParams();
  const [me,      setMe]      = useState<ApiClientMe | null>(null);
  const [trucks,  setTrucks]  = useState<ApiClientTruck[]>([]);
  const [events,  setEvents]  = useState<ApiAssetEvent[]>([]);
  const [trips,   setTrips]   = useState<ApiTrip[]>([]);
  const [tab,     setTab]     = useState<Tab>('live');
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    api.client.me()
      .then(m => {
        setMe(m);
        const urlTab = searchParams.get('tab') as Tab | null;
        if (urlTab && ['live', 'events', 'trips'].includes(urlTab)) {
          setTab(urlTab);
        } else {
          setTab(m.modules.monitoring !== false ? 'live' : (m.modules.dispatch_api ? 'events' : 'live'));
        }
        return Promise.all([
          m.modules.monitoring !== false ? api.client.trucks() : Promise.resolve([]),
          m.modules.dispatch_api        ? api.client.events()  : Promise.resolve([]),
          m.modules.dispatch_api        ? api.client.trips()   : Promise.resolve([]),
        ]);
      })
      .then(([t, e, tr]) => {
        setTrucks(t as ApiClientTruck[]);
        setEvents(e as ApiAssetEvent[]);
        setTrips(tr as ApiTrip[]);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load data'))
      .finally(() => setLoading(false));
  }, []);

  const hasMonitoring  = me?.modules.monitoring !== false;
  const hasDispatchApi = me?.modules.dispatch_api === true;

  const ALL_TABS: Tab[] = ['live', 'events', 'trips'];
  const visibleTabs = ALL_TABS.filter(t => {
    if (t === 'live')   return hasMonitoring;
    return hasDispatchApi;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{me?.workspace_name ?? 'Dashboard'}</h1>
        <p className="text-sm text-gray-500 mt-0.5">ERP Client Portal</p>
      </div>

      {/* Tabs */}
      {visibleTabs.length > 1 && (
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
          {visibleTabs.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'live' ? 'Live Status' : t === 'events' ? 'Events' : 'Trips'}
            </button>
          ))}
        </div>
      )}

      {/* Live Status */}
      {tab === 'live' && (
        <div>
          {trucks.length === 0 ? (
            <p className="text-sm text-gray-400">No trucks found for your workspace.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {trucks.map(truck => (
                <div key={truck.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">
                        {truck.license_plate ?? 'Unknown Plate'}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {[truck.make, truck.model, truck.year].filter(Boolean).join(' ') || 'No details'}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${
                      truck.ignition_on
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${truck.ignition_on ? 'bg-green-500' : 'bg-gray-400'}`} />
                      {truck.ignition_on ? 'On' : 'Off'}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-gray-600">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Speed</span>
                      <span>{truck.speed != null ? `${truck.speed} km/h` : '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Fuel</span>
                      <span>{truck.total_fuel_liters != null ? `${truck.total_fuel_liters.toFixed(0)} L` : '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Last seen</span>
                      <span>{fmt(truck.last_seen_at)}</span>
                    </div>
                    {truck.latitude != null && truck.longitude != null && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Position</span>
                        <span>{truck.latitude.toFixed(4)}, {truck.longitude.toFixed(4)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Events */}
      {tab === 'events' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {events.length === 0 ? (
            <p className="p-6 text-sm text-gray-400">No events recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3 text-left">Event</th>
                  <th className="px-5 py-3 text-left">Truck</th>
                  <th className="px-5 py-3 text-left">Value</th>
                  <th className="px-5 py-3 text-left">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {events.map(ev => (
                  <tr key={ev.id} className="hover:bg-gray-50 transition">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${EVENT_DOT[ev.event_type] ?? 'bg-gray-300'}`} />
                        {EVENT_LABELS[ev.event_type] ?? ev.event_type}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-500 font-mono text-xs">{ev.truck_id.slice(0, 8)}…</td>
                    <td className="px-5 py-3 text-gray-500">
                      {ev.value_before != null && ev.value_after != null
                        ? `${ev.value_before.toFixed(0)} → ${ev.value_after.toFixed(0)} L`
                        : '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-400">{fmt(ev.occurred_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Trips */}
      {tab === 'trips' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {trips.length === 0 ? (
            <p className="p-6 text-sm text-gray-400">No trips found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3 text-left">Ref</th>
                  <th className="px-5 py-3 text-left">Destination</th>
                  <th className="px-5 py-3 text-left">Driver</th>
                  <th className="px-5 py-3 text-left">Status</th>
                  <th className="px-5 py-3 text-left">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {trips.map(trip => (
                  <tr key={trip.id} className="hover:bg-gray-50 transition">
                    <td className="px-5 py-3 font-mono text-xs text-gray-500">{trip.order_ref ?? trip.id.slice(0, 8) + '…'}</td>
                    <td className="px-5 py-3">{trip.dest_name}</td>
                    <td className="px-5 py-3 text-gray-500">{trip.driver_name ?? '—'}</td>
                    <td className="px-5 py-3">
                      <span className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full font-medium">
                        {trip.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400">{fmt(trip.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* No modules at all */}
      {!hasMonitoring && !hasDispatchApi && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🔒</p>
          <p className="font-medium text-gray-600">No modules enabled</p>
          <p className="text-sm mt-1">Contact your account manager to enable features.</p>
        </div>
      )}
    </div>
  );
}
