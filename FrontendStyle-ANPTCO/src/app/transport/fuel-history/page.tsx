'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api, type ApiAssetEvent, type ApiFuelReading, type ApiTruck } from '@/src/lib/api';

const FuelChart = dynamic(() => import('@/src/components/FuelChart'), { ssr: false });

const LOG_TYPES = ['FUEL_FILL', 'FUEL_DRAIN', 'FUEL_THEFT'];

const EVENT_LABEL: Record<string, string> = {
  FUEL_FILL:  'Fuel Filled',
  FUEL_DRAIN: 'Fuel Drained',
  FUEL_THEFT: 'Fuel Theft',
  IGNITION_ON:  'Engine On',
  IGNITION_OFF: 'Engine Off',
};
const EVENT_COLOR: Record<string, string> = {
  FUEL_FILL:  '#16a34a',
  FUEL_DRAIN: '#ea580c',
  FUEL_THEFT: '#dc2626',
  IGNITION_ON:  '#ca8a04',
  IGNITION_OFF: '#78716c',
};

const RANGES = [
  { label: 'Today',   days: 1  },
  { label: '7 Days',  days: 7  },
  { label: '30 Days', days: 30 },
] as const;

// Same calculation as fleet monitor: sum compartments 1–4, fall back to total_fuel_liters
function truckFuelL(t: ApiTruck): number | null {
  if (t.compartment_fuel && Object.keys(t.compartment_fuel).length > 0) {
    return [1, 2, 3, 4].reduce((s, i) => s + (t.compartment_fuel![String(i)] ?? 0), 0);
  }
  return t.total_fuel_liters ?? null;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export default function FuelHistoryPage() {
  const router = useRouter();
  const user   = getCurrentUser();

  const [trucks,     setTrucks]     = useState<ApiTruck[]>([]);
  const [events,     setEvents]     = useState<ApiAssetEvent[]>([]);
  const [readings,   setReadings]   = useState<ApiFuelReading[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);
  const [rangeDays,        setRangeDays]        = useState<1 | 7 | 30>(7);
  const [selectedCompartment, setSelectedCompartment] = useState<number | null>(null);

  // Load trucks + asset events once on mount
  useEffect(() => {
    if (!user) { router.replace('/auth/login'); return; }
    Promise.all([api.trucks.list(), api.fleet.events()])
      .then(([tr, ev]) => {
        const trList = tr ?? [];
        setTrucks(trList);
        setEvents(ev ?? []);
        if (trList.length > 0) setSelectedTruckId(trList[0].id);
      })
      .finally(() => setLoading(false));
  }, [router, user]);

  // Memoized so cutoff doesn't change every render
  const cutoff = useMemo(() => Date.now() - rangeDays * 86_400_000, [rangeDays]);

  // Fetch calibrated fuel readings from truck_telemetry whenever truck or range changes
  useEffect(() => {
    if (!selectedTruckId) return;
    setChartLoading(true);
    const from = Math.floor(cutoff / 1000);
    const to   = Math.floor(Date.now() / 1000);
    api.trucks.fuelHistory(selectedTruckId, from, to)
      .then(r => setReadings(r ?? []))
      .catch(() => setReadings([]))
      .finally(() => setChartLoading(false));
  }, [selectedTruckId, cutoff]);

  // Asset events for the selected truck + range (for the event log table only)
  const truckEvents = useMemo(() =>
    events
      .filter(e =>
        e.truck_id === selectedTruckId &&
        new Date(e.occurred_at).getTime() >= cutoff
      )
      .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()),
  [events, selectedTruckId, cutoff]);

  // Summary stats from asset events (fill/drain/theft deltas)
  const stats = useMemo(() => {
    let filled = 0, drained = 0, theft = 0;
    for (const e of truckEvents) {
      if (e.value_before == null || e.value_after == null) continue;
      const delta = e.value_after - e.value_before;
      if (e.event_type === 'FUEL_FILL')  filled  += delta;
      if (e.event_type === 'FUEL_DRAIN') drained += Math.abs(delta);
      if (e.event_type === 'FUEL_THEFT') theft++;
    }
    return { filled, drained, theft };
  }, [truckEvents]);

  // Fuel event log — fill/drain/theft for the table
  const fuelLog = truckEvents.filter(e => LOG_TYPES.includes(e.event_type));

  const selectedTruck = trucks.find(t => t.id === selectedTruckId);

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar role="TRANSPORT_ADMIN" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Fuel History" user={user} />

        <div className="flex-1 flex overflow-hidden">

          {/* ── Truck list ─────────────────────────────────── */}
          <div className="w-56 shrink-0 flex flex-col bg-white border-r border-slate-200 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Trucks</p>
            </div>
            <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
              {loading ? (
                <div className="text-sm text-slate-400 text-center py-8">Loading…</div>
              ) : trucks.length === 0 ? (
                <div className="text-sm text-slate-400 text-center py-8">No trucks</div>
              ) : (() => {
                // Scale bars against the highest fuel level seen across all trucks,
                // so the bar is always visible and meaningful for comparison.
                const maxLevel = Math.max(1, ...trucks.map(t => truckFuelL(t) ?? 0));
                return trucks.map(t => {
                const active    = t.id === selectedTruckId;
                const level     = truckFuelL(t);
                const pct       = level != null ? Math.min(100, (level / maxLevel) * 100) : 0;
                // Absolute thresholds — independent of relative scaling
                const isCritical = level != null && level < 50;
                const isLow      = level != null && level < 500 && !isCritical;
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTruckId(t.id)}
                    className={`w-full text-left rounded-xl px-3 py-2.5 transition-all border ${
                      active
                        ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
                        : isCritical
                        ? 'bg-red-50 border-red-200 text-slate-700 hover:border-red-300'
                        : isLow
                        ? 'bg-amber-50 border-amber-200 text-slate-700 hover:border-amber-300'
                        : 'bg-white border-slate-100 text-slate-700 hover:border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between leading-none">
                      <p className="text-[12px] font-bold truncate">{t.device_id}</p>
                      {!active && isCritical && <span className="text-[9px] font-bold text-red-500 shrink-0 ml-1">CRITICAL</span>}
                      {!active && isLow      && <span className="text-[9px] font-bold text-amber-500 shrink-0 ml-1">LOW</span>}
                    </div>
                    {level != null && (
                      <>
                        <div className="flex items-center justify-between mt-1.5 mb-0.5">
                          <p className={`text-[10px] font-mono font-bold ${
                            active ? 'text-blue-200' : isCritical ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-slate-400'
                          }`}>
                            {level.toFixed(1)} L
                          </p>
                          <p className={`text-[9px] ${active ? 'text-blue-200' : 'text-slate-300'}`}>
                            vs fleet max
                          </p>
                        </div>
                        {/* Horizontal fuel bar */}
                        <div className={`w-full rounded-full overflow-hidden ${active ? 'bg-blue-800' : 'bg-slate-100'}`} style={{ height: 5 }}>
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.max(pct, 4)}%`,
                              background: active ? '#93c5fd' : isCritical ? '#dc2626' : isLow ? '#f59e0b' : '#0284c7',
                            }}
                          />
                        </div>
                      </>
                    )}
                  </button>
                );
              }); })()}
            </div>
          </div>

          {/* ── Main content ───────────────────────────────── */}
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Toolbar */}
            <div className="flex items-center px-5 py-3 bg-white border-b border-slate-200 shrink-0">
              <p className="text-sm font-bold text-slate-700">
                {selectedTruck ? selectedTruck.device_id : '—'}
              </p>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4 divide-x divide-slate-100 border-b border-slate-200 bg-white shrink-0">
              {[
                {
                  label: 'Current Level',
                  value: (() => {
                    const l = selectedTruck ? truckFuelL(selectedTruck) : null;
                    return l != null ? `${l.toFixed(1)} L` : '—';
                  })(),
                  color: '#0284c7',
                },
                { label: 'Total Filled',  value: stats.filled  > 0 ? `+${stats.filled.toFixed(0)} L`  : '—', color: '#16a34a' },
                { label: 'Total Drained', value: stats.drained > 0 ? `−${stats.drained.toFixed(0)} L` : '—', color: '#ea580c' },
                { label: 'Theft Alerts',  value: String(stats.theft), color: stats.theft > 0 ? '#dc2626' : '#94a3b8' },
              ].map(s => (
                <div key={s.label} className="px-5 py-3">
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mb-0.5">{s.label}</p>
                  <p className="text-xl font-bold font-mono" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Compartment bars — clickable, each expands to detail view */}
            <div className="bg-white border-b border-slate-200 shrink-0">
              {(() => {
                const CAP    = 9100;
                const COLORS = ['#3b82f6', '#22d3ee', '#14b8a6', '#38bdf8'];
                const cf     = selectedTruck?.compartment_fuel ?? {};
                const total  = [1,2,3,4].reduce((s, i) => s + (cf[String(i)] ?? 0), 0);
                const sel    = selectedCompartment;

                // C1 is the only compartment with a sensor currently installed
                const SENSOR_COMPARTMENT = 1;

                // Detail panel for the selected compartment
                const detail = sel != null ? (() => {
                  const hasSensor = sel === SENSOR_COMPARTMENT;
                  const liters    = cf[String(sel)] ?? 0;
                  const pct       = Math.min(100, (liters / CAP) * 100);
                  const color     = COLORS[sel - 1];
                  const status    = liters === 0 ? 'Empty'
                    : pct < 10  ? 'Critical'
                    : pct < 25  ? 'Low'
                    : pct < 75  ? 'Normal'
                    : 'Full';
                  const statusColor = liters === 0 ? '#94a3b8'
                    : pct < 10  ? '#dc2626'
                    : pct < 25  ? '#f59e0b'
                    : '#16a34a';
                  return (
                    <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-6">
                      {/* Large vertical bar */}
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <span className="text-[10px] font-bold text-slate-400">C{sel}</span>
                        {hasSensor
                          ? <span className="flex items-center gap-0.5 text-[8px] text-emerald-500 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />sensor</span>
                          : <span className="text-[8px] text-slate-300 font-medium italic">no sensor</span>
                        }
                        <div className="relative bg-slate-100 rounded overflow-hidden" style={{ width: 36, height: 80 }}>
                          <div
                            className="absolute bottom-0 w-full transition-all duration-700 rounded"
                            style={{ height: `${Math.max(pct, liters > 0 ? 3 : 0)}%`, background: color }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[9px] font-bold text-white drop-shadow-sm">
                              {pct < 1 && liters > 0 ? `<1%` : `${pct.toFixed(0)}%`}
                            </span>
                          </div>
                        </div>
                      </div>
                      {/* Stats */}
                      <div className="flex-1 grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Current</p>
                          <p className="text-lg font-bold font-mono" style={{ color }}>{liters.toLocaleString()} L</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Capacity</p>
                          <p className="text-lg font-bold font-mono text-slate-600">{CAP.toLocaleString()} L</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Status</p>
                          <p className="text-lg font-bold" style={{ color: statusColor }}>{status}</p>
                        </div>
                      </div>
                      {/* Horizontal fill bar + sensor hint */}
                      <div className="flex-1">
                        <div className="w-full bg-slate-100 rounded-full overflow-hidden" style={{ height: 10 }}>
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${Math.max(pct, liters > 0 ? 2 : 0)}%`, background: color }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 text-right font-mono">
                          {liters.toLocaleString()} / {CAP.toLocaleString()} L
                        </p>
                        {hasSensor
                          ? <p className="text-[9px] text-emerald-400 mt-0.5 text-right">Sensor active · history shown below</p>
                          : <p className="text-[9px] text-amber-400 mt-0.5 text-right">No sensor installed · level is a snapshot</p>
                        }
                      </div>
                    </div>
                  );
                })() : null;

                return (
                  <>
                    <div className="px-5 py-3 flex gap-3">
                      {[1,2,3,4].map((i, idx) => {
                        const liters  = cf[String(i)] ?? 0;
                        const pct     = Math.min(100, (liters / CAP) * 100);
                        const isEmpty = liters === 0;
                        const active  = sel === i;
                        const color   = COLORS[idx];
                        return (
                          <button
                            key={i}
                            onClick={() => setSelectedCompartment(sel === i ? null : i)}
                            className={`flex-1 flex flex-col items-center gap-0.5 rounded-xl p-2 transition-all border-2 ${
                              active
                                ? 'border-blue-400 bg-blue-50 shadow-md'
                                : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <span className={`text-[10px] font-bold ${active ? 'text-blue-600' : 'text-slate-400'}`}>C{i}</span>
                            <div className="relative w-full bg-slate-100 rounded overflow-hidden" style={{ height: 52 }}>
                              <div
                                className="absolute bottom-0 w-full transition-all duration-700"
                                style={{
                                  height: `${Math.max(pct, isEmpty ? 100 : 2)}%`,
                                  background: isEmpty ? '#e2e8f0' : color,
                                  opacity: isEmpty ? 0.35 : 1,
                                }}
                              />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className={`text-[9px] font-bold ${isEmpty ? 'text-slate-400' : 'text-white drop-shadow-sm'}`}>
                                  {isEmpty ? '—' : pct < 1 ? '<1%' : `${pct.toFixed(0)}%`}
                                </span>
                              </div>
                            </div>
                            <span className="text-[8px] font-semibold text-slate-600 font-mono">{liters.toLocaleString()}</span>
                            <span className="text-[7px] text-slate-400">/{CAP.toLocaleString()}L</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-[9px] px-5 pb-2 border-b border-slate-100">
                      <span className="text-slate-400">Total across all compartments</span>
                      <span className="font-semibold text-slate-600 font-mono">
                        {total.toLocaleString()} / {(CAP * 4).toLocaleString()} L
                      </span>
                    </div>
                    {detail}
                  </>
                );
              })()}
            </div>

            {/* Chart area */}
            <div className="shrink-0 bg-white border-b border-slate-200 px-4 pt-2 pb-1" style={{ height: 240 }}>
              {/* Chart header: label changes with selected compartment */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {selectedCompartment === 1 || selectedCompartment == null
                    ? selectedCompartment === 1 ? 'C1 Fuel Sensor History' : 'Fuel History'
                    : `C${selectedCompartment} · No sensor installed`}
                </span>
                {(selectedCompartment === 1 || selectedCompartment == null) && (
                  <div className="flex gap-1">
                    {RANGES.map(r => (
                      <button
                        key={r.days}
                        onClick={() => setRangeDays(r.days)}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                          rangeDays === r.days
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-400 hover:text-slate-600'
                        }`}
                      >{r.label}</button>
                    ))}
                  </div>
                )}
              </div>
              {selectedCompartment != null && selectedCompartment !== 1 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <span className="text-2xl">🔌</span>
                  <p className="text-sm font-semibold text-slate-500">No sensor installed for C{selectedCompartment}</p>
                  <p className="text-[11px] text-slate-400">Sensor will be added in a future installation</p>
                </div>
              ) : chartLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <FuelChart
                  key={`${selectedTruckId}-${rangeDays}`}
                  readings={readings}
                  compartment="1"
                  rangeStart={cutoff}
                  rangeEnd={cutoff + rangeDays * 86_400_000}
                  currentLevel={selectedTruck ? truckFuelL(selectedTruck) ?? undefined : undefined}
                />
              )}
            </div>

            {/* Fuel event log */}
            <div className="flex-1 overflow-y-auto bg-white">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-5 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-48">Time</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Event</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Before</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">After</th>
                    <th className="text-right px-5 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {fuelLog.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-slate-400 text-sm">
                        No fuel events in this period
                      </td>
                    </tr>
                  ) : fuelLog.slice().reverse().map(e => {
                    const delta = e.value_before != null && e.value_after != null
                      ? e.value_after - e.value_before : null;
                    const color = EVENT_COLOR[e.event_type] ?? '#94a3b8';
                    return (
                      <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                        <td className="px-5 py-2.5 text-[12px] text-slate-500 font-mono">
                          {fmtTime(e.occurred_at)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                            <span className="text-[12px] font-semibold" style={{ color }}>
                              {EVENT_LABEL[e.event_type] ?? e.event_type}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-[12px] font-mono text-slate-500">
                          {e.value_before != null ? `${e.value_before.toFixed(0)} L` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[12px] font-mono text-slate-500">
                          {e.value_after != null ? `${e.value_after.toFixed(0)} L` : '—'}
                        </td>
                        <td className="px-5 py-2.5 text-right text-[12px] font-bold font-mono">
                          {delta != null ? (
                            <span style={{ color: delta > 0 ? '#16a34a' : '#dc2626' }}>
                              {delta > 0 ? '+' : ''}{delta.toFixed(0)} L
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
