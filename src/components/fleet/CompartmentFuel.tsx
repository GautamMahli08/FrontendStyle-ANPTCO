'use client';

import { useEffect, useState } from 'react';
import {
  orderFuelTelemetry,
  TELEMETRY_INTERVAL_MS,
  type FuelPhase,
} from '@/src/lib/demo-data';

// Per-fuel colour theme for the tank fills.
const FUEL_COLOR: Record<string, { bar: string; text: string; surface: string }> = {
  DIESEL:  { bar: 'bg-blue-500',   text: 'text-blue-700',   surface: 'bg-blue-300'   },
  PETROL:  { bar: 'bg-amber-500',  text: 'text-amber-700',  surface: 'bg-amber-300'  },
  PREMIUM: { bar: 'bg-purple-500', text: 'text-purple-700', surface: 'bg-purple-300' },
  CNG:     { bar: 'bg-teal-500',   text: 'text-teal-700',   surface: 'bg-teal-300'   },
};

const PHASE_META: Record<FuelPhase, { label: string; cls: string; dot: string; pulse: boolean }> = {
  EMPTY:      { label: 'Empty',      cls: 'bg-gray-100 text-gray-500',       dot: 'bg-gray-400',    pulse: false },
  LOADING:    { label: 'Loading',    cls: 'bg-cyan-100 text-cyan-700',       dot: 'bg-cyan-500',    pulse: true  },
  LOADED:     { label: 'Loaded',     cls: 'bg-sky-100 text-sky-700',         dot: 'bg-sky-500',     pulse: false },
  IN_TRANSIT: { label: 'In transit', cls: 'bg-indigo-100 text-indigo-700',   dot: 'bg-indigo-500',  pulse: false },
  OFFLOADING: { label: 'Offloading', cls: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500',   pulse: true  },
  DELIVERED:  { label: 'Delivered',  cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', pulse: false },
};

/**
 * Live per-compartment fuel readout for a truck's current order. Samples derived
 * telemetry every TELEMETRY_INTERVAL_MS (mirroring the flespi push cadence) and
 * lets CSS animate the tank levels smoothly between readings.
 */
export default function CompartmentFuel({ order, compact = false }: { order: any; compact?: boolean }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), TELEMETRY_INTERVAL_MS);
    return () => clearInterval(iv);
  }, []);

  const { phase, readings, totalVolume, totalCapacity } = orderFuelTelemetry(order, now);
  const meta = PHASE_META[phase] ?? PHASE_META.EMPTY;
  const tankH = compact ? 'h-12' : 'h-24';

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Compartment Fuel</p>
        <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${meta.cls}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} ${meta.pulse ? 'animate-pulse' : ''}`} />
          {meta.label}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {readings.map(r => {
          const pct   = r.capacity ? Math.round((r.volume / r.capacity) * 100) : 0;
          const color = r.fuelType ? (FUEL_COLOR[r.fuelType] ?? FUEL_COLOR.DIESEL) : null;
          return (
            <div key={r.index} className={`rounded-xl border border-gray-200 bg-white ${compact ? 'p-1.5' : 'p-2'}`}>
              {/* Tank — fills from the bottom; height transitions over the sample interval */}
              <div className={`relative mx-auto w-full ${tankH} rounded-lg bg-gray-100 border border-gray-200 overflow-hidden`}>
                {color && (
                  <div
                    className={`absolute bottom-0 inset-x-0 ${color.bar} transition-[height] ease-linear`}
                    style={{ height: `${pct}%`, transitionDuration: `${TELEMETRY_INTERVAL_MS}ms` }}
                  >
                    <span className={`absolute top-0 inset-x-0 h-1 ${color.surface}`} />
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-xs font-black ${pct > 45 && color ? 'text-white drop-shadow' : 'text-gray-600'}`}>
                    {pct}%
                  </span>
                </div>
              </div>

              {/* Label */}
              <div className={`${compact ? 'mt-1 flex items-center justify-center gap-1' : 'mt-1.5 text-center leading-tight'}`}>
                <p className="text-[11px] font-bold text-gray-700">C{r.index}</p>
                <p className={`text-[10px] font-semibold ${color ? color.text : 'text-gray-400'}`}>
                  {r.fuelType ?? 'Empty'}
                </p>
                {!compact && <p className="text-[10px] text-gray-400">{r.volume.toLocaleString()}L</p>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1.5 text-gray-400 font-medium">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          Live sensor feed · ~{TELEMETRY_INTERVAL_MS / 1000}s
        </span>
        <span className="font-black text-gray-900">
          {totalVolume.toLocaleString()} / {totalCapacity.toLocaleString()} L
        </span>
      </div>
    </div>
  );
}
