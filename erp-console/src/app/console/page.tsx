'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { erp, type ERPTruck, type ERPDriver, type ERPGeofence, type ERPAssetEvent, type DispatchedTrip } from '@/src/lib/api';

// ── Local SO order model (never stored in the platform DB) ──────────────────

type SOStatus = 'PENDING' | 'DISPATCHED' | 'FAILED';

interface CompartmentEntry {
  compartmentNo: number;
  productType: string;
  capacityLiters: number;
  volumeToLoad: number;
}

interface SOOrder {
  id: string;
  orderRef: string;
  status: SOStatus;
  tripId?: string;
  // form state
  truckId: string;
  driverName: string;
  originName: string;
  destName: string;
  destLat: string;
  destLng: string;
  destRadius: number;
  compartments: CompartmentEntry[];
}

const INITIAL_ORDERS: SOOrder[] = [
  {
    id: 'SO-1001',
    orderRef: 'SO-1001',
    status: 'PENDING',
    truckId: '',
    driverName: 'Ali Hassan',
    originName: 'Muscat Terminal — Mina Al Fahal',
    destName: 'Nizwa Fuel Hub',
    destLat: '22.9337',
    destLng: '57.5356',
    destRadius: 200,
    compartments: [],
  },
  {
    id: 'SO-1002',
    orderRef: 'SO-1002',
    status: 'PENDING',
    truckId: '',
    driverName: 'Mohammed Al-Farsi',
    originName: 'Muscat Terminal — Mina Al Fahal',
    destName: 'Sohar Industrial Station',
    destLat: '24.3467',
    destLng: '56.7289',
    destRadius: 200,
    compartments: [],
  },
];

let orderCounter = 3;

// ── Component ────────────────────────────────────────────────────────────────

export default function ConsolePage() {
  const router = useRouter();

  const [activeTab, setActiveTab]       = useState<'dispatch' | 'events' | 'trips'>('dispatch');
  const [apiKey, setApiKey]             = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [trucks, setTrucks]             = useState<ERPTruck[]>([]);
  const [drivers, setDrivers]           = useState<ERPDriver[]>([]);
  const [geofences, setGeofences]       = useState<ERPGeofence[]>([]);
  const [orders, setOrders]             = useState<SOOrder[]>(INITIAL_ORDERS);
  const [selectedId, setSelectedId]     = useState<string>(INITIAL_ORDERS[0].id);
  const [loadError, setLoadError]       = useState<string | null>(null);
  const [dispatching, setDispatching]   = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  // Redirect to connect page if no key stored.
  useEffect(() => {
    const key  = sessionStorage.getItem('erp_api_key') ?? '';
    const name = sessionStorage.getItem('erp_workspace_name') ?? 'Your Workspace';
    if (!key) { router.replace('/'); return; }
    setApiKey(key);
    setWorkspaceName(name);
  }, [router]);

  // Load trucks, drivers, geofences once key is known.
  const loadResources = useCallback(async (key: string) => {
    try {
      const [info, drvs, geos] = await Promise.all([
        erp.listTrucks(key),
        erp.listDrivers(key),
        erp.listGeofences(key),
      ]);
      setTrucks(info.trucks ?? []);
      setDrivers(drvs ?? []);
      setGeofences(geos ?? []);

      // Pre-assign first two trucks to seeded orders if they exist.
      if (info.trucks.length > 0) {
        setOrders(prev => prev.map((o, i) => {
          const truck = info.trucks[i] ?? info.trucks[0];
          if (o.truckId) return o;
          return {
            ...o,
            truckId: truck.id,
            compartments: truck.compartments.map(c => ({
              compartmentNo: c.compartment_no,
              productType: c.product_type,
              capacityLiters: c.capacity_liters,
              volumeToLoad: 0,
            })),
          };
        }));
      }
    } catch (e: any) {
      setLoadError(e.message ?? 'Failed to load resources');
    }
  }, []);

  useEffect(() => {
    if (apiKey) loadResources(apiKey);
  }, [apiKey, loadResources]);

  function handleSignOut() {
    sessionStorage.clear();
    router.replace('/');
  }

  function handleNewOrder() {
    const id = `SO-10${String(orderCounter++).padStart(2, '0')}`;
    const newOrder: SOOrder = {
      id,
      orderRef: id,
      status: 'PENDING',
      truckId: trucks[0]?.id ?? '',
      driverName: '',
      originName: 'Muscat Terminal — Mina Al Fahal',
      destName: '',
      destLat: '',
      destLng: '',
      destRadius: 200,
      compartments: trucks[0]?.compartments.map(c => ({
        compartmentNo: c.compartment_no,
        productType: c.product_type,
        capacityLiters: c.capacity_liters,
        volumeToLoad: 0,
      })) ?? [],
    };
    setOrders(prev => [...prev, newOrder]);
    setSelectedId(id);
    setDispatchError(null);
  }

  function handleTruckChange(truckId: string) {
    const truck = trucks.find(t => t.id === truckId);
    updateSelected(o => ({
      ...o,
      truckId,
      compartments: truck?.compartments.map(c => ({
        compartmentNo: c.compartment_no,
        productType: c.product_type,
        capacityLiters: c.capacity_liters,
        volumeToLoad: 0,
      })) ?? [],
    }));
  }

  function handleGeofenceSelect(geoId: string) {
    const geo = geofences.find(g => g.id === geoId);
    if (!geo) return;
    updateSelected(o => ({
      ...o,
      destName: geo.name,
      destLat: String(geo.latitude),
      destLng: String(geo.longitude),
      destRadius: geo.radius_meters,
    }));
  }

  function updateSelected(fn: (o: SOOrder) => SOOrder) {
    setOrders(prev => prev.map(o => o.id === selectedId ? fn(o) : o));
  }

  function updateCompartmentVolume(compartmentNo: number, value: string) {
    const vol = parseFloat(value) || 0;
    updateSelected(o => ({
      ...o,
      compartments: o.compartments.map(c =>
        c.compartmentNo === compartmentNo ? { ...c, volumeToLoad: vol } : c
      ),
    }));
  }

  async function handleDispatch(e: React.FormEvent) {
    e.preventDefault();
    const order = orders.find(o => o.id === selectedId);
    if (!order || order.status === 'DISPATCHED') return;

    setDispatching(true);
    setDispatchError(null);
    try {
      const lat = parseFloat(order.destLat);
      const lng = parseFloat(order.destLng);
      if (isNaN(lat) || isNaN(lng)) throw new Error('Invalid destination coordinates');

      const trip = await erp.dispatch(apiKey, {
        truck_id:           order.truckId,
        order_ref:          order.orderRef,
        driver_name:        order.driverName || undefined,
        origin_name:        order.originName || undefined,
        dest_name:          order.destName,
        dest_lat:           lat,
        dest_lng:           lng,
        dest_radius_meters: order.destRadius,
        compartments: order.compartments
          .filter(c => c.volumeToLoad > 0)
          .map(c => ({
            compartment_no: c.compartmentNo,
            product_type:   c.productType,
            volume_liters:  c.volumeToLoad,
          })),
      });

      updateSelected(o => ({ ...o, status: 'DISPATCHED', tripId: trip.id }));
    } catch (err: any) {
      setDispatchError(err.message ?? 'Dispatch failed');
      updateSelected(o => ({ ...o, status: 'FAILED' }));
    } finally {
      setDispatching(false);
    }
  }

  const selected = orders.find(o => o.id === selectedId) ?? orders[0];

  const truckLabel = (t: ERPTruck) =>
    [t.license_plate, t.make, t.model].filter(Boolean).join(' — ') || t.id.slice(0, 8);

  const statusBadge = (s: SOStatus) => {
    const cls = {
      PENDING:    'bg-yellow-100 text-yellow-700',
      DISPATCHED: 'bg-green-100 text-green-700',
      FAILED:     'bg-red-100 text-red-700',
    }[s];
    return <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cls}`}>{s}</span>;
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">

      {/* ── Header ── */}
      <header className="bg-slate-900 text-white flex items-center justify-between px-6 py-3 shadow-lg flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
          <div>
            <div className="font-bold text-sm leading-tight">{workspaceName || 'Loading…'}</div>
            <div className="text-slate-400 text-xs">ANPTCO Dispatch Console</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Tab bar */}
          <nav className="flex gap-1">
            {([
              { key: 'dispatch', label: '📋 Dispatch' },
              { key: 'events',   label: '⚡ Events'  },
              { key: 'trips',    label: '📍 Trips'   },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  activeTab === t.key
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {loadError && (
            <span className="text-xs text-red-400 bg-red-900/30 px-2 py-1 rounded">{loadError}</span>
          )}
          <div className="text-xs text-slate-400">
            {trucks.length} trucks · {drivers.length} drivers
          </div>
          <button
            onClick={handleSignOut}
            className="text-xs text-slate-400 hover:text-white transition px-3 py-1.5 rounded-lg hover:bg-slate-700"
          >
            Disconnect
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      {activeTab === 'events' && (
        <div className="flex-1 overflow-y-auto bg-gray-100">
          <EventsView apiKey={apiKey} trucks={trucks} />
        </div>
      )}
      {activeTab === 'trips' && (
        <div className="flex-1 overflow-y-auto bg-gray-100">
          <TripsView apiKey={apiKey} trucks={trucks} />
        </div>
      )}
      <div className={`flex flex-1 overflow-hidden ${activeTab !== 'dispatch' ? 'hidden' : ''}`}>

        {/* ── Left panel: order list ── */}
        <aside className="w-72 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <div className="font-semibold text-gray-800 text-sm">Today's Dispatches</div>
              <div className="text-xs text-gray-400">
                {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </div>
            <button
              onClick={handleNewOrder}
              className="text-xs text-blue-600 font-semibold hover:text-blue-800 transition"
            >
              + New
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {orders.map(o => {
              const truck = trucks.find(t => t.id === o.truckId);
              const isActive = o.id === selectedId;
              return (
                <button
                  key={o.id}
                  onClick={() => { setSelectedId(o.id); setDispatchError(null); }}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-0 transition
                    ${isActive ? 'bg-blue-50 border-l-4 border-l-blue-600' : 'hover:bg-gray-50 border-l-4 border-l-transparent'}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-gray-800">{o.orderRef}</span>
                    {statusBadge(o.status)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {truck ? truckLabel(truck) : 'No truck selected'}
                  </div>
                  {o.tripId && (
                    <div className="text-xs text-green-600 font-mono mt-0.5 truncate">
                      Trip: {o.tripId.slice(0, 16)}…
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
            <div className="text-xs text-gray-400 font-medium mb-1.5">AUTH MODE</div>
            <div className="text-xs text-gray-500 font-mono break-all">
              Bearer {apiKey ? `${apiKey.slice(0, 8)}…` : '—'}
            </div>
          </div>
        </aside>

        {/* ── Right panel: dispatch form ── */}
        <main className="flex-1 overflow-y-auto">
          {selected ? (
            <form onSubmit={handleDispatch} className="max-w-3xl mx-auto p-6 space-y-6">

              {/* Form header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selected.orderRef}</h2>
                  <p className="text-sm text-gray-500">Fuel dispatch order</p>
                </div>
                <div className="flex items-center gap-3">
                  {statusBadge(selected.status)}
                </div>
              </div>

              {/* Success banner */}
              {selected.status === 'DISPATCHED' && selected.tripId && (
                <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                  <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <div className="font-semibold text-green-800 text-sm">Dispatch accepted by ANPTCO</div>
                    <div className="text-green-700 text-xs font-mono mt-0.5">Trip ID: {selected.tripId}</div>
                    <div className="text-green-600 text-xs mt-1">
                      Track this shipment in the ANPTCO fleet monitor dashboard.
                    </div>
                  </div>
                </div>
              )}

              {dispatchError && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                  <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <div className="font-semibold text-red-800 text-sm">Dispatch rejected</div>
                    <div className="text-red-600 text-xs mt-0.5">{dispatchError}</div>
                  </div>
                </div>
              )}

              {/* Section 1: Order */}
              <Section title="Order Reference">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Order Ref">
                    <input
                      value={selected.orderRef}
                      onChange={e => updateSelected(o => ({ ...o, orderRef: e.target.value }))}
                      className={inputCls}
                      required
                      disabled={selected.status === 'DISPATCHED'}
                    />
                  </Field>
                  <Field label="Dispatch Date">
                    <input
                      type="date"
                      defaultValue={new Date().toISOString().slice(0, 10)}
                      className={inputCls}
                      disabled={selected.status === 'DISPATCHED'}
                    />
                  </Field>
                </div>
              </Section>

              {/* Section 2: Vehicle */}
              <Section title="Vehicle">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Truck *">
                    <select
                      value={selected.truckId}
                      onChange={e => handleTruckChange(e.target.value)}
                      className={inputCls}
                      required
                      disabled={selected.status === 'DISPATCHED' || trucks.length === 0}
                    >
                      <option value="">
                        {trucks.length === 0 ? 'No trucks in workspace' : '— Select truck —'}
                      </option>
                      {trucks.map(t => (
                        <option key={t.id} value={t.id}>{truckLabel(t)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Driver">
                    <select
                      value={selected.driverName}
                      onChange={e => updateSelected(o => ({ ...o, driverName: e.target.value }))}
                      className={inputCls}
                      disabled={selected.status === 'DISPATCHED'}
                    >
                      <option value="">— Select driver —</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.full_name}>{d.full_name}</option>
                      ))}
                      <option value="__custom__">Enter manually…</option>
                    </select>
                    {selected.driverName === '__custom__' && (
                      <input
                        className={`${inputCls} mt-2`}
                        placeholder="Driver full name"
                        onChange={e => updateSelected(o => ({ ...o, driverName: e.target.value }))}
                        disabled={selected.status === 'DISPATCHED'}
                      />
                    )}
                  </Field>
                </div>
              </Section>

              {/* Section 3: Route */}
              <Section title="Route">
                <div className="space-y-3">
                  <Field label="Origin / Loading Point">
                    <input
                      value={selected.originName}
                      onChange={e => updateSelected(o => ({ ...o, originName: e.target.value }))}
                      className={inputCls}
                      placeholder="Terminal name or depot"
                      disabled={selected.status === 'DISPATCHED'}
                    />
                  </Field>

                  {geofences.length > 0 && (
                    <Field label="Known Delivery Station (optional)">
                      <select
                        onChange={e => handleGeofenceSelect(e.target.value)}
                        className={inputCls}
                        disabled={selected.status === 'DISPATCHED'}
                        defaultValue=""
                      >
                        <option value="">— Choose station or enter manually below —</option>
                        {geofences.map(g => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    </Field>
                  )}

                  <div className="grid grid-cols-1 gap-3">
                    <Field label="Destination Name *">
                      <input
                        value={selected.destName}
                        onChange={e => updateSelected(o => ({ ...o, destName: e.target.value }))}
                        className={inputCls}
                        placeholder="e.g. Nizwa Fuel Hub"
                        required
                        disabled={selected.status === 'DISPATCHED'}
                      />
                    </Field>
                    <div className="grid grid-cols-3 gap-3">
                      <Field label="Latitude *">
                        <input
                          type="number"
                          step="any"
                          value={selected.destLat}
                          onChange={e => updateSelected(o => ({ ...o, destLat: e.target.value }))}
                          className={inputCls}
                          placeholder="22.9337"
                          required
                          disabled={selected.status === 'DISPATCHED'}
                        />
                      </Field>
                      <Field label="Longitude *">
                        <input
                          type="number"
                          step="any"
                          value={selected.destLng}
                          onChange={e => updateSelected(o => ({ ...o, destLng: e.target.value }))}
                          className={inputCls}
                          placeholder="57.5356"
                          required
                          disabled={selected.status === 'DISPATCHED'}
                        />
                      </Field>
                      <Field label="Radius (m)">
                        <input
                          type="number"
                          value={selected.destRadius}
                          onChange={e => updateSelected(o => ({ ...o, destRadius: parseInt(e.target.value) || 200 }))}
                          className={inputCls}
                          disabled={selected.status === 'DISPATCHED'}
                        />
                      </Field>
                    </div>
                  </div>
                </div>
              </Section>

              {/* Section 4: Cargo / Compartments */}
              <Section title="Cargo Assignment">
                {selected.compartments.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">
                    {selected.truckId
                      ? 'This truck has no compartments configured. Register compartments in Platform Admin first.'
                      : 'Select a truck to configure cargo compartments.'}
                  </p>
                ) : (
                  <div className="overflow-hidden border border-gray-200 rounded-xl">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Compartment</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Product</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Capacity (L)</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Volume to Load (L)</th>
                          <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Fill %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.compartments.map(c => {
                          const pct = c.capacityLiters > 0
                            ? Math.round((c.volumeToLoad / c.capacityLiters) * 100)
                            : 0;
                          const over = pct > 100;
                          return (
                            <tr key={c.compartmentNo} className="border-b border-gray-100 last:border-0">
                              <td className="px-4 py-3 font-semibold text-gray-700">#{c.compartmentNo}</td>
                              <td className="px-4 py-3">
                                <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded font-medium">
                                  {c.productType}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-gray-600">
                                {c.capacityLiters.toLocaleString()}
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  min={0}
                                  max={c.capacityLiters}
                                  step={100}
                                  value={c.volumeToLoad || ''}
                                  onChange={e => updateCompartmentVolume(c.compartmentNo, e.target.value)}
                                  placeholder="0"
                                  disabled={selected.status === 'DISPATCHED'}
                                  className={`w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2
                                    ${over ? 'border-red-300 focus:ring-red-400' : 'border-gray-200 focus:ring-blue-500'}`}
                                />
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className={`text-xs font-semibold ${over ? 'text-red-600' : pct >= 80 ? 'text-green-600' : 'text-gray-500'}`}>
                                  {pct}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                        {/* Total row */}
                        <tr className="bg-gray-50 border-t-2 border-gray-200">
                          <td colSpan={2} className="px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase">Total</td>
                          <td className="px-4 py-2.5 text-xs font-semibold text-gray-700">
                            {selected.compartments.reduce((s, c) => s + c.capacityLiters, 0).toLocaleString()} L
                          </td>
                          <td className="px-4 py-2.5 text-xs font-semibold text-gray-800">
                            {selected.compartments.reduce((s, c) => s + c.volumeToLoad, 0).toLocaleString()} L
                          </td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>

              {/* Submit */}
              {selected.status !== 'DISPATCHED' && (
                <div className="flex items-center justify-between pt-2">
                  <div className="text-xs text-gray-400">
                    Dispatching will create a tracked trip in the ANPTCO platform.
                    This action cannot be undone.
                  </div>
                  <button
                    type="submit"
                    disabled={dispatching || !selected.truckId || !selected.destName || !selected.destLat || !selected.destLng}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700
                               disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold
                               rounded-xl transition text-sm shadow-sm"
                  >
                    {dispatching ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Dispatching…
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                        Dispatch to ANPTCO
                      </>
                    )}
                  </button>
                </div>
              )}

            </form>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <div className="text-5xl mb-3">📋</div>
                <p className="font-medium">Select an order from the left panel</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ── Events view ──────────────────────────────────────────────────────────────

const EVENT_META: Record<string, { label: string; dot: string; color: string; unit: string }> = {
  FUEL_FILL:      { label: 'Fuel Fill',      dot: '⛽', color: 'bg-green-100 text-green-800',   unit: 'L'    },
  FUEL_DRAIN:     { label: 'Fuel Drain',     dot: '📉', color: 'bg-orange-100 text-orange-800', unit: 'L'    },
  BATTERY_ON:     { label: 'Battery ON',     dot: '🔋', color: 'bg-blue-100 text-blue-800',     unit: 'V'    },
  BATTERY_OFF:    { label: 'Battery OFF',    dot: '🪫', color: 'bg-red-100 text-red-700',       unit: 'V'    },
  IGNITION_ON:    { label: 'Ignition ON',    dot: '🔑', color: 'bg-teal-100 text-teal-800',     unit: ''     },
  IGNITION_OFF:   { label: 'Ignition OFF',   dot: '🔒', color: 'bg-gray-200 text-gray-600',     unit: ''     },
  MOVEMENT_START: { label: 'Movement Start', dot: '🚛', color: 'bg-indigo-100 text-indigo-800', unit: 'km/h' },
  MOVEMENT_STOP:  { label: 'Movement Stop',  dot: '🅿️', color: 'bg-purple-100 text-purple-800', unit: 'km/h' },
};

function EventsView({ apiKey, trucks }: { apiKey: string; trucks: ERPTruck[] }) {
  const [events, setEvents]   = useState<ERPAssetEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [filter, setFilter]   = useState('ALL');

  useEffect(() => {
    if (!apiKey) return;
    erp.listEvents(apiKey)
      .then(evs => setEvents(evs ?? []))
      .catch(e  => setError(e.message ?? 'Failed to load events'))
      .finally(() => setLoading(false));
  }, [apiKey]);

  const truckLabel = (id: string) => {
    const t = trucks.find(t => t.id === id);
    return t ? ([t.license_plate, t.make, t.model].filter(Boolean).join(' ') || id.slice(0, 8)) : id.slice(0, 8);
  };

  const categories = ['ALL', 'FUEL', 'BATTERY', 'IGNITION', 'MOVEMENT'];
  const filtered = filter === 'ALL' ? events : events.filter(e => e.event_type.startsWith(filter));

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Truck Events</h2>
        <span className="text-xs text-gray-400">{filtered.length} event{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {categories.map(c => (
          <button key={c} onClick={() => setFilter(c)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${
              filter === c ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}>
            {c}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-gray-400">Loading…</p>}
      {error   && <p className="text-sm text-red-500">{error}</p>}

      {!loading && !error && filtered.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center shadow-sm">
          <p className="text-gray-400 text-sm">No events recorded yet</p>
          <p className="text-gray-300 text-xs mt-1">Events appear automatically as the truck sends telemetry</p>
        </div>
      )}

      {/* Timeline */}
      {filtered.length > 0 && (
        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-px bg-gray-200" />
          <div className="space-y-3">
            {filtered.map(e => {
              const m = EVENT_META[e.event_type] ?? { label: e.event_type, dot: '•', color: 'bg-gray-100 text-gray-600', unit: '' };
              const hasVal = e.value_before != null || e.value_after != null;
              const mapsUrl = e.latitude && e.longitude
                ? `https://www.google.com/maps?q=${e.latitude},${e.longitude}` : null;
              return (
                <div key={e.id} className="flex gap-4 relative">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 z-10 text-base ${m.color}`}>
                    {m.dot}
                  </div>
                  <div className="flex-1 bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${m.color}`}>{m.label}</span>
                        <span className="text-xs text-gray-500 font-medium">{truckLabel(e.truck_id)}</span>
                      </div>
                      <p className="text-xs text-gray-400 flex-shrink-0">{new Date(e.occurred_at).toLocaleString()}</p>
                    </div>
                    <div className="mt-1.5 flex items-center gap-4 flex-wrap">
                      {hasVal && (
                        <span className="text-sm font-mono text-gray-700">
                          {e.value_before != null ? `${e.value_before.toFixed(1)}${m.unit}` : '—'}
                          {' → '}
                          {e.value_after  != null ? `${e.value_after.toFixed(1)}${m.unit}`  : '—'}
                        </span>
                      )}
                      {(e.event_type === 'FUEL_FILL' || e.event_type === 'FUEL_DRAIN') &&
                        e.value_before != null && e.value_after != null && (
                        <span className={`text-xs font-semibold ${e.event_type === 'FUEL_FILL' ? 'text-green-600' : 'text-orange-600'}`}>
                          {e.event_type === 'FUEL_FILL' ? '+' : ''}{(e.value_after - e.value_before).toFixed(1)}L
                        </span>
                      )}
                      {mapsUrl ? (
                        <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:text-blue-700 underline font-mono">
                          {e.latitude!.toFixed(4)}, {e.longitude!.toFixed(4)}
                        </a>
                      ) : (
                        <span className="text-xs text-gray-300">no location</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Trips view ────────────────────────────────────────────────────────────────

const TRIP_STATUS_COLOR: Record<string, string> = {
  EN_ROUTE:          'bg-yellow-100 text-yellow-700',
  ARRIVED:           'bg-orange-100 text-orange-700',
  DELIVERY_ACCEPTED: 'bg-indigo-100 text-indigo-700',
  COMPLETED:         'bg-green-100 text-green-700',
  LOADING:           'bg-gray-100 text-gray-500',
  LOADED:            'bg-blue-50 text-blue-600',
};

function TripsView({ apiKey, trucks }: { apiKey: string; trucks: ERPTruck[] }) {
  const [trips, setTrips]     = useState<DispatchedTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey) return;
    erp.listTrips(apiKey)
      .then(t  => setTrips(t ?? []))
      .catch(e => setError(e.message ?? 'Failed to load trips'))
      .finally(() => setLoading(false));
  }, [apiKey]);

  const truckLabel = (id: string) => {
    const t = trucks.find(t => t.id === id);
    return t ? ([t.license_plate, t.make, t.model].filter(Boolean).join(' ') || id.slice(0, 8)) : id.slice(0, 8);
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Trips</h2>
        <span className="text-xs text-gray-400">{trips.length} trip{trips.length !== 1 ? 's' : ''}</span>
      </div>

      {loading && <p className="text-sm text-gray-400">Loading…</p>}
      {error   && <p className="text-sm text-red-500">{error}</p>}

      {!loading && !error && trips.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center shadow-sm">
          <p className="text-gray-400 text-sm">No trips yet</p>
          <p className="text-gray-300 text-xs mt-1">Dispatched trips will appear here</p>
        </div>
      )}

      <div className="space-y-3">
        {trips.map(t => {
          const color = TRIP_STATUS_COLOR[t.status] ?? 'bg-gray-100 text-gray-500';
          return (
            <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${color}`}>
                      {t.status.replace(/_/g, ' ')}
                    </span>
                    {t.order_ref && (
                      <span className="text-xs font-mono text-gray-500 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
                        {t.order_ref}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-gray-900 mt-1.5">{t.dest_name}</p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-xs text-gray-500">{truckLabel(t.truck_id)}</span>
                    {t.driver_name && <span className="text-xs text-gray-400">· {t.driver_name}</span>}
                    <a
                      href={`https://www.google.com/maps?q=${t.dest_lat},${t.dest_lng}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:text-blue-700 underline font-mono"
                    >
                      {t.dest_lat.toFixed(4)}, {t.dest_lng.toFixed(4)}
                    </a>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-400">{new Date(t.created_at).toLocaleDateString()}</p>
                  <p className="text-xs text-gray-300 font-mono mt-0.5">{t.id.slice(0, 8)}…</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500';
