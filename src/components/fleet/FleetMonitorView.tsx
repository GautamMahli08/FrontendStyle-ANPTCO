'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getOrders, getTrucks, getFuelAnomalies, updateFuelAnomaly,
  advanceJourneys, advanceLoading, OFFLOAD_DURATION_MS, shortOrderId,
} from '@/src/lib/demo-data';
import TruckFocusPanel from '@/src/components/fleet/TruckFocusPanel';

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  IDLE:      { label: 'Idle',           cls: 'bg-emerald-100 text-emerald-700' },
  ACTIVE:    { label: 'Idle',           cls: 'bg-emerald-100 text-emerald-700' },
  ASSIGNED:  { label: 'Truck assigned', cls: 'bg-indigo-100  text-indigo-700'  },
  LOADING:   { label: 'Loading fuel',   cls: 'bg-cyan-100    text-cyan-700'    },
  LOADED:    { label: 'Loaded',         cls: 'bg-sky-100     text-sky-700'     },
  EN_ROUTE:  { label: 'En route',       cls: 'bg-blue-100    text-blue-700'    },
  ARRIVED:   { label: 'Arrived',        cls: 'bg-teal-100    text-teal-700'    },
  COMPLETED: { label: 'Delivered',      cls: 'bg-emerald-100 text-emerald-700' },
  PENDING_INTEGRATION: { label: 'Pending', cls: 'bg-gray-100 text-gray-500' },
};
const SEVERITY_STYLE: Record<string, string> = {
  HIGH:   'bg-red-100    text-red-700    border-red-300',
  MEDIUM: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  LOW:    'bg-green-100  text-green-700  border-green-300',
};
const ANOMALY_STATUS_STYLE: Record<string, string> = {
  OPEN:      'bg-red-500     text-white',
  REVIEWING: 'bg-yellow-500  text-white',
  RESOLVED:  'bg-emerald-500 text-white',
};

const ACTIVE_STATUSES = ['ASSIGNED', 'LOADING', 'LOADED', 'EN_ROUTE', 'ARRIVED'];

type Filter = 'order' | 'truck';
type Selection = { type: Filter; id: string } | null;
type Item = { key: string; sel: { type: Filter; id: string }; title: string; sub: string; status: string; alert: boolean; search: string };

export default function FleetMonitorView({ user, allowTruckFilter }: { user: any; allowTruckFilter: boolean }) {
  const isSeller = user.role === 'SELLER_MANAGER';

  const [orders,    setOrders]    = useState<any[]>([]);
  const [trucks,    setTrucks]    = useState<any[]>([]);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [filter,    setFilter]    = useState<Filter>('order');
  const [selection, setSelection] = useState<Selection>(null);
  // search combobox
  const [query, setQuery] = useState('');
  const [open,  setOpen]  = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    advanceLoading();
    advanceJourneys();
    setOrders(getOrders().filter((o: any) => isSeller ? o.workspaceId === user.workspaceId : o.assignedTSPId === user.id));
    setTrucks(getTrucks().filter((t: any) => isSeller ? true : t.tspId === user.id));
    setAnomalies(getFuelAnomalies());
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
  const visibleAnomalies = isSeller ? anomalies : anomalies.filter(a => myRegs.has(a.truckReg));
  const openAnomalies = visibleAnomalies.filter(a => a.status !== 'RESOLVED');

  // ── Searchable items for the current filter ──────────────────
  const allItems: Item[] = filter === 'truck'
    ? trucks.map(t => {
        const order  = orderForTruck(t.id);
        const status = order?.status ?? t.status;
        const sub    = order ? `→ ${order.destinationName}` : `${t.compartments?.length ?? 0}C · ${t.capacity?.toLocaleString()}L`;
        return {
          key: t.id, sel: { type: 'truck' as Filter, id: t.id }, title: t.registrationNumber, sub, status,
          alert: openAnomalies.some(a => a.truckReg === t.registrationNumber),
          search: `${t.registrationNumber} ${order?.destinationName ?? ''}`.toLowerCase(),
        };
      })
    : trackableOrders.map(o => ({
        key: o.id, sel: { type: 'order' as Filter, id: o.id },
        title: `#${shortOrderId(o.id)}`, sub: `${o.assignedTruckRegistration ?? '—'} · → ${o.destinationName}`, status: o.status,
        alert: openAnomalies.some(a => a.truckReg === o.assignedTruckRegistration),
        search: `${shortOrderId(o.id)} ${o.id} ${o.assignedTruckRegistration ?? ''} ${o.destinationName ?? ''}`.toLowerCase(),
      }));

  const q = query.trim().toLowerCase();
  const suggestions = q ? allItems.filter(i => i.search.includes(q)) : allItems;

  const choose = (item: Item) => {
    setSelection(item.sel);
    setQuery(item.title);
    setOpen(false);
  };
  const clearSelection = () => { setSelection(null); setQuery(''); setOpen(false); };

  return (
    <main className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Fleet Monitor</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {allowTruckFilter ? 'Search by order ID or truck, then watch it live' : 'Search a delivery to watch its truck fuel up, drive and offload'}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          LIVE
        </div>
      </div>

      {/* ── TOP FILTER BAR ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-3 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* Order/Truck toggle (TSP only) */}
        {allowTruckFilter && (
          <div className="grid grid-cols-2 gap-1 bg-slate-100 rounded-xl p-1 sm:w-56 flex-shrink-0">
            {(['order', 'truck'] as Filter[]).map(f => (
              <button
                key={f}
                onClick={() => { setFilter(f); clearSelection(); }}
                className={`text-xs font-bold py-2 rounded-lg transition ${filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {f === 'order' ? '📦 Orders' : '🚛 Trucks'}
              </button>
            ))}
          </div>
        )}

        {/* Searchable combobox */}
        <div className="relative flex-1 min-w-0">
          <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 h-11 focus-within:border-blue-400 transition">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
            <input
              value={query}
              onChange={e => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150); }}
              placeholder={filter === 'truck' ? 'Search truck reg (e.g. TRK-001)…' : 'Search order ID (e.g. ' + (allItems[0]?.title.replace('#','') ?? 'A1B2C3') + ')…'}
              className="flex-1 min-w-0 text-sm bg-transparent outline-none placeholder:text-gray-400"
            />
            {(selection || query) && (
              <button onClick={clearSelection} title="Clear" className="text-gray-300 hover:text-gray-600 flex-shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>

          {/* Dropdown */}
          {open && (
            <div
              className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-72 overflow-y-auto"
              onMouseDown={() => { if (blurTimer.current) clearTimeout(blurTimer.current); }}
            >
              {suggestions.length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-400">No matches</p>
              ) : (
                suggestions.map(item => {
                  const pill = STATUS_PILL[item.status] ?? { label: String(item.status).replace(/_/g, ' '), cls: 'bg-gray-100 text-gray-500' };
                  return (
                    <button
                      key={item.key}
                      onClick={() => choose(item)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition"
                    >
                      <span className="text-base flex-shrink-0">{filter === 'truck' ? '🚛' : '📦'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-gray-900 text-sm truncate">{item.title}</p>
                          {item.alert && <span className="text-[10px] font-black text-red-600 bg-red-100 px-1 rounded-full animate-pulse">🚨</span>}
                        </div>
                        <p className="text-xs text-gray-400 truncate">{item.sub}</p>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${pill.cls}`}>{pill.label}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Quick count */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-400 px-2">{allItems.length} {filter === 'truck' ? 'trucks' : 'active'}</span>
        </div>
      </div>

      {/* ── CONTENT ── */}
      {hasFocus ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <TruckFocusPanel order={focusedOrder} truck={focusedTruck} />
        </div>
      ) : (
        <>
          {/* No multi-trip overview — both seller and TSP track one delivery at a
              time to avoid clutter when several trips run at once. Prompt to search. */}
          <section className="bg-white border border-gray-200 rounded-2xl shadow-sm">
            <div className="w-full h-[460px] flex flex-col items-center justify-center text-center px-6">
              <p className="text-3xl mb-2">🔍</p>
              <p className="text-sm font-semibold text-gray-600">
                Search {allowTruckFilter ? 'a delivery or truck' : 'a delivery'} to track it
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {allowTruckFilter
                  ? 'Pick an order ID or truck above to watch it fuel up, drive and offload'
                  : 'Enter an order ID above to watch its truck fuel up, drive and offload'}
              </p>
            </div>
          </section>

          {/* Theft alerts */}
          {openAnomalies.length > 0 && (
            <section className="bg-white border-2 border-red-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center gap-3 px-6 py-4 bg-red-50 border-b border-red-200">
                <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center text-lg flex-shrink-0">🚨</div>
                <div className="flex-1">
                  <h2 className="font-bold text-red-800">Fuel Anomaly Alerts</h2>
                  <p className="text-xs text-red-600 mt-0.5">Unexpected fuel drops detected outside delivery windows</p>
                </div>
                <span className="text-xs font-black text-red-700 bg-red-200 px-2.5 py-1 rounded-full">{openAnomalies.length} OPEN</span>
              </div>
              <div className="divide-y divide-gray-50">
                {visibleAnomalies.map(a => (
                  <div key={a.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      a.severity === 'HIGH' ? 'bg-red-500 animate-pulse' : a.severity === 'MEDIUM' ? 'bg-yellow-500' : 'bg-green-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className="font-bold text-gray-900 text-sm">{a.truckReg}</p>
                        <span className="text-xs text-gray-500">{a.compartment}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${SEVERITY_STYLE[a.severity]}`}>{a.severity}</span>
                      </div>
                      <p className="text-xs text-gray-500">{a.location}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-black text-red-600">−{a.fuelDropLiters}L</p>
                      <p className="text-xs text-gray-400">{new Date(a.detectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${ANOMALY_STATUS_STYLE[a.status]}`}>{a.status}</span>
                    {isSeller && a.status === 'OPEN' && (
                      <button
                        onClick={() => { updateFuelAnomaly(a.id, { status: 'REVIEWING' }); load(); }}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 px-3 py-1 border border-blue-200 rounded-lg hover:bg-blue-50 transition flex-shrink-0"
                      >
                        Review
                      </button>
                    )}
                    {isSeller && a.status === 'REVIEWING' && (
                      <button
                        onClick={() => { updateFuelAnomaly(a.id, { status: 'RESOLVED' }); load(); }}
                        className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 px-3 py-1 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition flex-shrink-0"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
