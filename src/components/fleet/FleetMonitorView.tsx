'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  getOrders, getTrucks, getAlerts, updateAlert, isAlertOpen, abortDelivery,
  advanceJourneys, advanceLoading, OFFLOAD_DURATION_MS, shortOrderId,
  FIXED_DEPOT, JOURNEY_DURATION_MS, destinationCoords,
  type FleetAlert,
} from '@/src/lib/demo-data';
import TruckFocusPanel from '@/src/components/fleet/TruckFocusPanel';
import type { Journey } from '@/src/components/maps/LiveTrackingMap';
import { escapeHtml as esc } from '@/src/lib/utils';

// Leaflet touches `window`, so load the overview map only on the client.
const LiveTrackingMap = dynamic(() => import('@/src/components/maps/LiveTrackingMap'), {
  ssr: false,
  loading: () => <div className="w-full h-[460px] flex items-center justify-center text-sm text-gray-400">Loading map…</div>,
});

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  IDLE:      { label: 'Idle',           cls: 'bg-emerald-100 text-emerald-700' },
  ACTIVE:    { label: 'Idle',           cls: 'bg-emerald-100 text-emerald-700' },
  ASSIGNED:  { label: 'Truck assigned', cls: 'bg-indigo-100  text-indigo-700'  },
  LOADING:   { label: 'Loading fuel',   cls: 'bg-cyan-100    text-cyan-700'    },
  LOADED:    { label: 'Loaded',         cls: 'bg-sky-100     text-sky-700'     },
  EN_ROUTE:  { label: 'En route',       cls: 'bg-blue-100    text-blue-700'    },
  ARRIVED:   { label: 'Arrived',        cls: 'bg-teal-100    text-teal-700'    },
  COMPLETED: { label: 'Delivered',      cls: 'bg-emerald-100 text-emerald-700' },
  DELIVERY_FAILED:     { label: 'Aborted', cls: 'bg-red-100  text-red-700'  },
  PENDING_INTEGRATION: { label: 'Pending', cls: 'bg-gray-100 text-gray-500' },
};
// Severity drives the whole visual weight of an alert card. A stop is amber and
// acknowledgeable; fuel actually leaving the tank is red and abortable.
const ALERT_STYLE: Record<string, { icon: string; bg: string; text: string; badge: string }> = {
  CRITICAL: { icon: '🚨', bg: 'bg-red-50',   text: 'text-red-800',   badge: 'bg-red-600 text-white'   },
  WARNING:  { icon: '⏸️', bg: 'bg-amber-50', text: 'text-amber-800', badge: 'bg-amber-500 text-white' },
};

// DELIVERY_FAILED stays in the list: an aborted trip is exactly the one an operator
// still wants to look at, and dropping it the instant it fails would make the truck
// vanish from the map mid-incident.
const ACTIVE_STATUSES = ['ASSIGNED', 'LOADING', 'LOADED', 'EN_ROUTE', 'ARRIVED', 'DELIVERY_FAILED'];

// Overview map legend — mirrors TRUCK_BG in LiveTrackingMap.
const LEGEND = [
  { label: 'At depot', color: '#06b6d4' },
  { label: 'En route', color: '#f59e0b' },
  { label: 'Arrived',  color: '#10b981' },
  { label: 'Idle',     color: '#94a3b8' },
];

// Statuses where the truck is actually on the road (everything else parks at the depot).
const ON_ROAD_STATUSES = ['EN_ROUTE', 'ARRIVED'];

// Ring radius used to fan parked trucks out around the depot (~1 km) so each one
// stays individually hoverable instead of collapsing into a single pin.
const DEPOT_FAN_RADIUS = 0.010;

/** Alerts render in full up to this many; beyond it the panel caps and scrolls. */
const ALERT_SCROLL_AFTER = 5;

type Filter = 'order' | 'truck';
type Selection = { type: Filter; id: string } | null;
type Item = {
  key: string; sel: { type: Filter; id: string }; title: string; sub: string;
  status: string; alert: boolean; search: string;
  order: any | null; truck: any | null;
};

/** Hover card for a truck on the fleet-overview map. */
function tooltipHtml(item: Item): string {
  const pill = STATUS_PILL[item.status] ?? { label: String(item.status).replace(/_/g, ' ') };
  const o = item.order;
  const lines: string[] = [];

  lines.push(o
    ? `<div style="color:#64748b">Order <b style="color:#0f172a">#${esc(shortOrderId(o.id))}</b></div>`
    : `<div style="color:#94a3b8">No active delivery</div>`);
  if (o?.destinationName)  lines.push(`<div style="color:#64748b">→ ${esc(o.destinationName)}</div>`);
  if (o?.assignedDriverName) lines.push(`<div style="color:#64748b">👤 ${esc(o.assignedDriverName)}</div>`);
  if (o?.volume)           lines.push(`<div style="color:#64748b">🛢️ ${esc(o.volume.toLocaleString())}L ${esc(o.fuelType)}</div>`);
  if (item.alert)          lines.push(`<div style="color:#dc2626;font-weight:700">🚨 Alert open</div>`);

  return `<div style="font-family:inherit;font-size:12px;line-height:1.5;min-width:150px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
        <b style="font-size:13px;color:#0f172a">🚛 ${esc(item.truck?.registrationNumber ?? o?.assignedTruckRegistration ?? '—')}</b>
        <span style="font-size:10px;font-weight:700;color:#475569;background:#f1f5f9;border-radius:9999px;padding:1px 6px">${esc(pill.label)}</span>
      </div>
      ${lines.join('')}
      <div style="color:#94a3b8;margin-top:4px;font-size:11px">Click to track</div>
    </div>`;
}

export default function FleetMonitorView({ user, allowTruckFilter }: { user: any; allowTruckFilter: boolean }) {
  const isSeller = user.role === 'SELLER_MANAGER';

  const [orders,    setOrders]    = useState<any[]>([]);
  const [trucks,    setTrucks]    = useState<any[]>([]);
  const [alerts,    setAlerts]    = useState<FleetAlert[]>([]);
  const [filter,    setFilter]    = useState<Filter>('order');
  const [selection, setSelection] = useState<Selection>(null);
  // Free-text filter over the side list (not a dropdown — the list IS the picker).
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    advanceLoading();
    advanceJourneys();
    setOrders(getOrders().filter((o: any) => isSeller ? o.workspaceId === user.workspaceId : o.assignedTSPId === user.id));
    setTrucks(getTrucks().filter((t: any) => isSeller ? true : t.tspId === user.id));
    setAlerts(getAlerts());
  }, [user, isSeller]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('order');
    if (id) { setFilter('order'); setSelection({ type: 'order', id }); }
    load();
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, [load]);

  const orderForTruck = (truckId: string) =>
    orders.find(o => o.assignedTruckId === truckId && ACTIVE_STATUSES.includes(o.status)) ??
    orders.find(o =>
      o.assignedTruckId === truckId && o.status === 'COMPLETED' && o.completedAt &&
      Date.now() - new Date(o.completedAt).getTime() < OFFLOAD_DURATION_MS + 3000
    ) ?? null;

  const isOffloading = (o: any) =>
    o.status === 'COMPLETED' && o.completedAt && Date.now() - new Date(o.completedAt).getTime() < OFFLOAD_DURATION_MS + 3000;

  const trackableOrders = orders
    .filter(o => o.assignedTruckId && (ACTIVE_STATUSES.includes(o.status) || isOffloading(o)))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Resolve selection → order + truck.
  let focusedOrder: any = null;
  let focusedTruck: any = null;
  if (selection?.type === 'order') {
    focusedOrder = orders.find(o => o.id === selection.id) ?? null;
    focusedTruck = focusedOrder ? trucks.find(t => t.id === focusedOrder.assignedTruckId) : null;
  } else if (selection?.type === 'truck') {
    focusedTruck = trucks.find(t => t.id === selection.id) ?? null;
    focusedOrder = focusedTruck ? orderForTruck(focusedTruck.id) : null;
  }
  const hasFocus = !!(focusedOrder || focusedTruck);

  const myRegs = new Set(trucks.map(t => t.registrationNumber));
  const visibleAlerts = (isSeller ? alerts : alerts.filter(a => myRegs.has(a.truckReg)))
    // Newest first, and CRITICAL above WARNING at the same moment.
    .sort((a, b) =>
      Number(isAlertOpen(b)) - Number(isAlertOpen(a)) ||
      new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
  const openAlerts = visibleAlerts.filter(isAlertOpen);

  // ── Searchable items for the current filter ──────────────────
  const allItems: Item[] = filter === 'truck'
    ? trucks.map(t => {
        const order  = orderForTruck(t.id);
        const status = order?.status ?? t.status;
        const sub    = order ? `→ ${order.destinationName}` : `${t.compartments?.length ?? 0}C · ${t.capacity?.toLocaleString()}L`;
        return {
          key: t.id, sel: { type: 'truck' as Filter, id: t.id }, title: t.registrationNumber, sub, status,
          alert: openAlerts.some(a => a.truckReg === t.registrationNumber),
          search: `${t.registrationNumber} ${order?.destinationName ?? ''}`.toLowerCase(),
          order, truck: t,
        };
      })
    : trackableOrders.map(o => ({
        key: o.id, sel: { type: 'order' as Filter, id: o.id },
        title: `#${shortOrderId(o.id)}`, sub: `${o.assignedTruckRegistration ?? '—'} · → ${o.destinationName}`, status: o.status,
        alert: openAlerts.some(a => a.truckReg === o.assignedTruckRegistration),
        search: `${shortOrderId(o.id)} ${o.id} ${o.assignedTruckRegistration ?? ''} ${o.destinationName ?? ''}`.toLowerCase(),
        order: o, truck: trucks.find(t => t.id === o.assignedTruckId) ?? null,
      }));

  // ── Fleet overview (nothing selected) ────────────────────────
  // Every item in the current filter becomes a marker: trucks on the road ride
  // their route, the rest park in a ring around the depot. Journey ids match the
  // item keys, so a marker click feeds straight back into `choose`.
  const depot = { lat: FIXED_DEPOT.lat, lng: FIXED_DEPOT.lng, name: FIXED_DEPOT.name, address: FIXED_DEPOT.address };
  const parkedKeys = allItems
    .filter(i => !(i.order && ON_ROAD_STATUSES.includes(i.order.status)))
    .map(i => i.key);

  const overviewJourneys: Journey[] = allItems.map(item => {
    const o = item.order;
    const parkedAt = parkedKeys.indexOf(item.key);
    // Only fan out parked trucks, and only when more than one shares the depot.
    const angle = parkedAt >= 0 && parkedKeys.length > 1
      ? (2 * Math.PI * parkedAt) / parkedKeys.length
      : null;

    return {
      id:         item.key,
      truckReg:   item.truck?.registrationNumber ?? o?.assignedTruckRegistration ?? '—',
      status:     item.status,
      depot,
      dest: o
        ? { ...destinationCoords(o), name: o.destinationName || 'Destination', address: o.destinationAddress }
        : undefined,
      startedAt:  o?.tripStartedAt ? new Date(o.tripStartedAt).getTime() : 0,
      durationMs: JOURNEY_DURATION_MS,
      // A halted truck pins to where it stopped; otherwise `at` is just the parking
      // spot used before departure.
      halted: !!o?.stoppedAt,
      at: o?.stoppedAt && o.stoppedLat != null
        ? { lat: o.stoppedLat, lng: o.stoppedLng }
        : item.truck?.currentLat != null && item.truck?.currentLng != null
          ? { lat: item.truck.currentLat, lng: item.truck.currentLng }
          : undefined,
      offset: angle == null
        ? undefined
        : [Math.sin(angle) * DEPOT_FAN_RADIUS, Math.cos(angle) * DEPOT_FAN_RADIUS],
      tooltip: tooltipHtml(item),
      alert:   item.alert,
    };
  });

  const q = query.trim().toLowerCase();
  const visibleItems = q ? allItems.filter(i => i.search.includes(q)) : allItems;

  // Selecting no longer rewrites the query — the text box filters the list, so
  // stuffing the chosen title into it would collapse the list to a single row.
  const choose = (item: Item) => setSelection(item.sel);
  const clearSelection = () => setSelection(null);

  // Clicking a truck on the overview map is the same action as picking it from the
  // side list — both drop into the focused-tracking flow.
  const selectFromMap = (id: string) => {
    const item = allItems.find(i => i.key === id);
    if (item) choose(item);
  };

  return (
    <main className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Fleet Monitor</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {hasFocus
              ? 'Pick another from the list, or go back to the fleet overview'
              : 'Pick from the list on the left, or click a truck on the map, to track it live'}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          LIVE
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start">

        {/* ── LEFT: ACTIVE LIST ── */}
        <aside className="w-full lg:w-80 flex-shrink-0 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-3 border-b border-gray-100 space-y-2">
            {/* Order/Truck toggle (TSP only) */}
            {allowTruckFilter && (
              <div className="grid grid-cols-2 gap-1 bg-slate-100 rounded-xl p-1">
                {(['order', 'truck'] as Filter[]).map(f => (
                  <button
                    key={f}
                    onClick={() => { setFilter(f); clearSelection(); setQuery(''); }}
                    className={`text-xs font-bold py-2 rounded-lg transition ${filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    {f === 'order' ? '📦 Orders' : '🚛 Trucks'}
                  </button>
                ))}
              </div>
            )}

            {/* Filter box — narrows the list below, no dropdown */}
            <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 h-10 focus-within:border-blue-400 transition">
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
              </svg>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={filter === 'truck' ? 'Filter trucks…' : 'Filter deliveries…'}
                className="flex-1 min-w-0 text-sm bg-transparent outline-none placeholder:text-gray-400"
              />
              {query && (
                <button onClick={() => setQuery('')} title="Clear filter" className="text-gray-300 hover:text-gray-600 flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>

            <div className="flex items-center justify-between px-0.5">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                {filter === 'truck' ? 'Fleet' : 'Active deliveries'}
              </p>
              <span className="text-[11px] text-gray-400">
                {q ? `${visibleItems.length} of ${allItems.length}` : allItems.length}
              </span>
            </div>
          </div>

          {/* The list itself — always visible, so the fleet can be scanned at a glance
              and a different truck is one click away even while focused on another. */}
          <div className="max-h-[320px] overflow-y-auto divide-y divide-gray-50">
            {visibleItems.length === 0 ? (
              <p className="px-4 py-8 text-sm text-gray-400 text-center">
                {allItems.length === 0
                  ? (filter === 'truck' ? 'No trucks yet' : 'No active deliveries')
                  : 'No matches'}
              </p>
            ) : visibleItems.map(item => {
              const pill     = STATUS_PILL[item.status] ?? { label: String(item.status).replace(/_/g, ' '), cls: 'bg-gray-100 text-gray-500' };
              const isActive = selection?.id === item.sel.id && selection?.type === item.sel.type;
              return (
                <button
                  key={item.key}
                  onClick={() => choose(item)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition border-l-[3px] ${
                    isActive ? 'bg-blue-50 border-blue-600' : 'border-transparent hover:bg-slate-50'
                  }`}
                >
                  <span className="text-base flex-shrink-0">{filter === 'truck' ? '🚛' : '📦'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`font-bold text-sm truncate ${isActive ? 'text-blue-800' : 'text-gray-900'}`}>{item.title}</p>
                      {item.alert && <span className="text-[10px] font-black text-red-600 bg-red-100 px-1 rounded-full animate-pulse">🚨</span>}
                    </div>
                    <p className="text-xs text-gray-400 truncate">{item.sub}</p>
                    <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${pill.cls}`}>{pill.label}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── ALERTS ── Sits directly under the deliveries it refers to, so the
              incident and the trip it belongs to are read in one glance. Scrolls
              independently — a burst of alerts must never push the fleet list away. */}
          <div className="border-t-2 border-gray-100">
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-gray-100">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Alerts</p>
              {openAlerts.length > 0 && (
                <span className="text-[10px] font-black text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                  {openAlerts.length} OPEN
                </span>
              )}
            </div>

            {/* Grows freely up to ALERT_SCROLL_AFTER cards — a scrollbar over two or
                three alerts just hides them behind a gesture. Past that it caps at
                most of the viewport height and scrolls. */}
            <div className={`divide-y divide-gray-50 ${
              visibleAlerts.length > ALERT_SCROLL_AFTER ? 'max-h-[60vh] overflow-y-auto' : ''
            }`}>
              {visibleAlerts.length === 0 ? (
                <p className="px-4 py-6 text-xs text-gray-400 text-center">No alerts — all trips nominal</p>
              ) : visibleAlerts.map(a => {
                const s      = ALERT_STYLE[a.severity];
                const closed = !isAlertOpen(a);
                return (
                  // The whole card selects the truck — same gesture as the delivery
                  // rows above, so "Track" doesn't need to exist as a button. Only the
                  // decision (acknowledge / abort) earns one.
                  <div
                    key={a.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelection({ type: 'order', id: a.orderId })}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelection({ type: 'order', id: a.orderId }); }}
                    className={`px-4 py-3 cursor-pointer transition ${closed ? 'opacity-50 hover:opacity-70' : `${s.bg} hover:brightness-95`}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-sm leading-none mt-0.5 flex-shrink-0">{s.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${s.badge}`}>
                            {closed ? a.status : a.severity}
                          </span>
                          <p className="text-xs font-bold text-gray-900 truncate">{a.truckReg}</p>
                          <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">
                            {new Date(a.detectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className={`text-xs font-semibold mt-0.5 ${s.text}`}>{a.title}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{a.detail}</p>

                        {/* The detector's own reasoning — why this fired, not a canned line. */}
                        {isAlertOpen(a) && (
                          <ul className="mt-1.5 space-y-0.5">
                            {a.reasoning.map((r, i) => (
                              <li key={i} className="text-[10px] text-gray-400 flex gap-1">
                                <span className="flex-shrink-0">·</span>
                                <span>{r}</span>
                              </li>
                            ))}
                          </ul>
                        )}

                        {/* CRITICAL gets the destructive action; a WARNING only gets
                            acknowledged — a stop on its own isn't grounds to abort.
                            stopPropagation so acting doesn't also re-select the card. */}
                        {isAlertOpen(a) && (
                          <div className="flex flex-wrap items-center gap-1.5 mt-2" onClick={e => e.stopPropagation()}>
                            {a.type === 'FUEL_THEFT' ? (
                              <button
                                onClick={() => {
                                  if (!confirm(`Abort delivery #${shortOrderId(a.orderId)}?\n\nThe truck will be recalled to the depot and the client notified. This cannot be undone.`)) return;
                                  abortDelivery(a.orderId, a.detail);
                                  load();
                                }}
                                className="text-[11px] font-bold text-white bg-red-600 hover:bg-red-700 px-2.5 py-1 rounded-lg transition"
                              >
                                Abort delivery
                              </button>
                            ) : a.status === 'OPEN' ? (
                              <button
                                onClick={() => { updateAlert(a.id, { status: 'ACKNOWLEDGED' }); load(); }}
                                className="text-[11px] font-bold text-amber-700 bg-white border border-amber-300 hover:bg-amber-50 px-2.5 py-1 rounded-lg transition"
                              >
                                Acknowledge
                              </button>
                            ) : (
                              <span className="text-[11px] font-semibold text-amber-700">✓ Acknowledged — monitoring</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* ── RIGHT: MAP OR FOCUSED TRUCK ── */}
        <div className="flex-1 min-w-0 w-full space-y-4">
      {hasFocus ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <button
            onClick={clearSelection}
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-lg px-2.5 py-1.5 transition"
          >
            ← Fleet overview
          </button>
          <TruckFocusPanel order={focusedOrder} truck={focusedTruck} />
        </div>
      ) : (
        <>
          {/* Fleet overview — every truck in the current filter on one map. Hover for
              details, click to drop into the single-truck tracking view below. */}
          <section className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            {overviewJourneys.length > 0 ? (
              <>
                <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100">
                  <div>
                    <p className="text-sm font-bold text-gray-900">Fleet overview</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Hover a truck for its details · click it to track that delivery
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {LEGEND.map(l => (
                      <span key={l.label} className="hidden sm:flex items-center gap-1.5 text-[11px] text-gray-400 font-medium">
                        <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: l.color }} />
                        {l.label}
                      </span>
                    ))}
                  </div>
                </div>
                <LiveTrackingMap
                  journeys={overviewJourneys}
                  onSelect={selectFromMap}
                  className="w-full h-[460px]"
                />
              </>
            ) : (
              <div className="w-full h-[460px] flex flex-col items-center justify-center text-center px-6">
                <p className="text-3xl mb-2">🅿️</p>
                <p className="text-sm font-semibold text-gray-600">
                  No {allowTruckFilter ? 'trucks' : 'active deliveries'} to show
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Trucks appear here as soon as a delivery is assigned to them.
                </p>
              </div>
            )}
          </section>

        </>
      )}
        </div>
      </div>
    </main>
  );
}
