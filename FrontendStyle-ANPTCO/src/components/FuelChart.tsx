'use client';

import { useRef, useState, useCallback, useId } from 'react';
import type { ApiFuelReading } from '@/src/lib/api';

interface FuelPoint {
  t: number;
  v: number;
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
function fmtXLabel(ts: number, spanH: number) {
  if (spanH > 48) return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (spanH > 20) return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', hour12: true });
  return fmtTime(ts);
}

const PAD = { top: 20, right: 72, bottom: 36, left: 56 };
const VW  = 900;
const VH  = 170;

export default function FuelChart({
  readings,
  compartment = '1',
  rangeStart,
  rangeEnd,
  currentLevel,
}: {
  readings:      ApiFuelReading[];
  compartment?:  string;           // which compartment key to plot, default '1'
  rangeStart?:   number;
  rangeEnd?:     number;
  currentLevel?: number;
}) {
  // ── ALL hooks first, unconditionally ──────────────────────────────────────
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ svgX: number; pt: FuelPoint } | null>(null);
  const gradId = useId();
  const clipId = useId();

  // Extract the compartment value from each reading
  const rawPts: FuelPoint[] = readings
    .map(r => {
      const v = r.compartment_fuel?.[compartment] ?? r.total_fuel_liters ?? null;
      if (v == null) return null;
      return { t: new Date(r.timestamp).getTime(), v };
    })
    .filter((p): p is FuelPoint => p !== null)
    .sort((a, b) => a.t - b.t);

  // If only one reading, stretch across the full range so a flat line renders
  const pts: FuelPoint[] = rawPts.length === 1
    ? [
        { ...rawPts[0], t: rangeStart ?? rawPts[0].t - 1800_000 },
        { ...rawPts[0] },
        { ...rawPts[0], t: rangeEnd   ?? rawPts[0].t + 1800_000 },
      ]
    : rawPts;

  // Derived constants — computed before useCallback so deps are stable values, not functions
  const pw   = VW - PAD.left - PAD.right;
  const ph   = VH - PAD.top  - PAD.bottom;
  const minT = pts.length > 0 ? pts[0].t                  : 0;
  const maxT = pts.length > 0 ? pts[pts.length - 1].t     : 1;
  const spanH = (maxT - minT) / 3600000;
  const maxV  = (pts.length > 0 ? Math.max(...pts.map(p => p.v)) : 0) * 1.15 || 100;

  const sx = useCallback(
    (t: number) => PAD.left + ((t - minT) / (maxT - minT || 1)) * pw,
    [minT, maxT, pw],
  );
  const sy = useCallback(
    (v: number) => PAD.top + (1 - v / maxV) * ph,
    [maxV, ph],
  );

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const xRaw = (e.clientX - rect.left) * (VW / rect.width) - PAD.left;
    if (xRaw < 0 || xRaw > pw) { setHover(null); return; }
    const tHover = minT + (xRaw / pw) * (maxT - minT);
    let nearest = pts[0];
    for (const p of pts) { if (p.t <= tHover) nearest = p; }
    setHover({ svgX: sx(nearest.t), pt: nearest });
  }, [minT, maxT, pw, pts, sx]);

  // ── Early return AFTER all hooks ──────────────────────────────────────────
  if (rawPts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-slate-400">
        No fuel readings recorded for this period
      </div>
    );
  }

  // Step path
  let linePath = `M ${sx(pts[0].t).toFixed(1)} ${sy(pts[0].v).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    linePath += ` H ${sx(pts[i].t).toFixed(1)} V ${sy(pts[i].v).toFixed(1)}`;
  }
  linePath += ` H ${(PAD.left + pw).toFixed(1)}`;
  const areaPath = linePath + ` V ${(PAD.top + ph).toFixed(1)} H ${PAD.left} Z`;

  const YTICKS = 4;
  const yStep  = maxV / YTICKS;
  const XTICKS = 6;
  const xTicks = Array.from({ length: XTICKS + 1 }, (_, i) =>
    minT + (maxT - minT) * i / XTICKS
  );

  return (
    <div className="relative w-full h-full select-none">

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        className="w-full h-full"
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
        style={{ cursor: 'crosshair' }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#0284c7" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0.01" />
          </linearGradient>
          <clipPath id={clipId}>
            <rect x={PAD.left} y={PAD.top} width={pw} height={ph} />
          </clipPath>
        </defs>

        {/* Gridlines + Y labels */}
        {Array.from({ length: YTICKS + 1 }, (_, i) => {
          const v = i * yStep;
          const y = sy(v);
          return (
            <g key={i}>
              <line x1={PAD.left} x2={PAD.left + pw} y1={y} y2={y}
                stroke="#f1f5f9" strokeWidth={i === 0 ? 1.5 : 1} />
              <text x={PAD.left - 8} y={y + 4} textAnchor="end"
                fontSize="11" fill="#94a3b8" fontFamily="ui-monospace,monospace">
                {v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v)}
              </text>
            </g>
          );
        })}

        {/* Current live level reference line — uses compartment_fuel, not last event */}
        {currentLevel != null && (() => {
          const v     = currentLevel;
          const y     = sy(v);
          const label = v >= 1000 ? `${(v / 1000).toFixed(2)}k L` : `${v.toFixed(1)} L`;
          const color = v < 50 ? '#dc2626' : v < 500 ? '#f59e0b' : '#16a34a';
          return (
            <g>
              <line x1={PAD.left} x2={PAD.left + pw} y1={y} y2={y}
                stroke={color} strokeWidth={1.5} strokeDasharray="5 3" opacity={0.6} />
              <rect x={PAD.left + pw + 2} y={y - 9} width={label.length * 6.5 + 8} height={16}
                fill={color} rx={3} opacity={0.92} />
              <text x={PAD.left + pw + 6} y={y + 3.5} textAnchor="start"
                fontSize="11" fill="white" fontFamily="ui-monospace,monospace" fontWeight="700">
                {label}
              </text>
            </g>
          );
        })()}

        <text x={12} y={PAD.top + ph / 2} textAnchor="middle"
          fontSize="11" fill="#94a3b8"
          transform={`rotate(-90,12,${PAD.top + ph / 2})`}>L</text>

        <path d={areaPath} fill={`url(#${gradId})`} clipPath={`url(#${clipId})`} />
        <path d={linePath} fill="none" stroke="#0284c7" strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${clipId})`} />


        {xTicks.map((t, i) => (
          <text key={i} x={sx(t)} y={PAD.top + ph + 24}
            textAnchor="middle" fontSize="10" fill="#94a3b8"
            fontFamily="ui-monospace,monospace">
            {fmtXLabel(t, spanH)}
          </text>
        ))}

        {hover && (
          <>
            <line x1={hover.svgX} x2={hover.svgX} y1={PAD.top} y2={PAD.top + ph}
              stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 3" />
            <circle cx={hover.svgX} cy={sy(hover.pt.v)} r="5.5"
              fill="#0284c7" stroke="white" strokeWidth="2" />
          </>
        )}
      </svg>

      {hover && (
        <div
          className="absolute top-6 pointer-events-none z-20 bg-slate-800 text-white rounded-lg shadow-xl px-3 py-2 text-[11px] leading-relaxed"
          style={{ left: `clamp(4px, calc(${(hover.svgX / VW * 100).toFixed(1)}% - 65px), calc(100% - 136px))` }}
        >
          <div className="font-mono font-bold text-[13px]">{hover.pt.v.toFixed(1)} L</div>
          <div className="text-slate-300">{fmtTime(hover.pt.t)}</div>
        </div>
      )}
    </div>
  );
}
