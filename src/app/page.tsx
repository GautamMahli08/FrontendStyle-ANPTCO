'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  setCurrentUser,
  PLATFORM_ADMIN,
  getDrivers,
  getUsers,
  DEMO_PERSONAS,
} from '@/src/lib/demo-data';
import NetworkMap from '@/src/components/maps/NetworkMap';

// ── Hero feature pills ────────────────────────────────────────
const FEATURE_PILLS = [
  { icon: '📡', label: 'Live Telemetry',       cls: 'bg-blue-50   border-blue-200   text-blue-700'   },
  { icon: '🚨', label: 'Theft Detection',      cls: 'bg-red-50    border-red-200    text-red-700'    },
  { icon: '📍', label: 'Geofence Alerts',      cls: 'bg-purple-50 border-purple-200 text-purple-700' },
  { icon: '🔒', label: 'QR Delivery Lock',     cls: 'bg-teal-50   border-teal-200   text-teal-700'   },
  { icon: '📊', label: 'Compartment Tracking', cls: 'bg-cyan-50   border-cyan-200   text-cyan-700'   },
  { icon: '🗺️', label: 'Route Monitoring',     cls: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
];

// ── Capability cards ──────────────────────────────────────────
const CAPABILITY_CARDS = [
  {
    cls:     'border-blue-200   bg-blue-50/70',
    iconCls: 'bg-blue-100   text-blue-600',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" /></svg>
    ),
    title: 'Per-Compartment Telemetry',
    desc:  'Galileosky sensors report fuel levels for every truck compartment every 10–30 seconds. Calibration tables convert raw sensor values to exact litres.',
    tags:  ['Galileosky IoT', 'AWS IoT Core', 'flespi MQTT'],
    tagCls:'bg-blue-100 text-blue-700',
  },
  {
    cls:     'border-red-200    bg-red-50/70',
    iconCls: 'bg-red-100    text-red-600',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
    ),
    title: 'Fuel Theft Detection',
    desc:  'Unexpected fuel drops outside active delivery windows trigger anomaly alerts classified HIGH / MEDIUM / LOW, routed to the seller manager instantly.',
    tags:  ['Anomaly Detection', 'Real-time Alerts', 'Event Log'],
    tagCls:'bg-red-100 text-red-700',
  },
  {
    cls:     'border-purple-200 bg-purple-50/70',
    iconCls: 'bg-purple-100 text-purple-600',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
    ),
    title: 'Geofence & QR Validation',
    desc:  "Delivery only unlocks when the truck enters the client's geofence and the client scans the truck's unique QR code. Return-to-depot completes the cycle.",
    tags:  ['Haversine Geofencing', 'QR Scan Lock', 'Journey Cycle'],
    tagCls:'bg-purple-100 text-purple-700',
  },
];

// ── Persona card colour themes ────────────────────────────────
const PERSONA_THEME: Record<string, { card: string; badge: string; iconBg: string }> = {
  purple: { card: 'border-purple-200 hover:border-purple-400 hover:bg-purple-50/50',    badge: 'bg-purple-100 text-purple-700',   iconBg: 'bg-purple-100 text-purple-600'   },
  blue:   { card: 'border-blue-200   hover:border-blue-400   hover:bg-blue-50/50',      badge: 'bg-blue-100   text-blue-700',     iconBg: 'bg-blue-100   text-blue-600'     },
  orange: { card: 'border-orange-200 hover:border-orange-400 hover:bg-orange-50/50',    badge: 'bg-orange-100 text-orange-700',   iconBg: 'bg-orange-100 text-orange-600'   },
  green:  { card: 'border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50/50', badge: 'bg-emerald-100 text-emerald-700', iconBg: 'bg-emerald-100 text-emerald-600' },
  teal:   { card: 'border-teal-200   hover:border-teal-400   hover:bg-teal-50/50',      badge: 'bg-teal-100   text-teal-700',     iconBg: 'bg-teal-100   text-teal-600'     },
};

// Persona layout — hide platform admin, client 2 and driver from the selector
const PERSONA_ROWS = [
  ['client-001', 'seller-001'],
  ['tsp-001', 'tsp-002'],
];

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const quickLogin = (personaId: string) => {
    setLoading(personaId);
    const persona = DEMO_PERSONAS.find(p => p.id === personaId);
    if (!persona) { setLoading(null); return; }
    if (persona.role === 'PLATFORM_ADMIN') {
      setCurrentUser(PLATFORM_ADMIN); router.push(persona.route); return;
    }
    if (persona.role === 'DRIVER') {
      const driver = getDrivers().find(d => d.id === personaId);
      if (driver) {
        setCurrentUser({ id: driver.id, email: driver.email, firstName: driver.firstName,
          lastName: driver.lastName, role: 'DRIVER', workspaceId: driver.workspaceId, verified: true });
        router.push(persona.route);
      }
      return;
    }
    const user = getUsers().find(u => u.id === personaId);
    if (user) { setCurrentUser(user); router.push(persona.route); }
    setLoading(null);
  };

  return (
    <div className="h-screen overflow-hidden bg-white flex flex-col">

      {/* ── NETWORK GRID BACKGROUND ── */}
      <div className="fixed inset-0 pointer-events-none z-0" aria-hidden>
        <NetworkMap className="absolute inset-0 w-full h-full" />
        {/* Soft vignette — keeps the centre content readable while the grid shows through */}
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 72% 64% at 50% 46%, rgba(255,255,255,0.45) 25%, rgba(255,255,255,0.72) 100%)' }} />
      </div>

      {/* ── CONTENT ── */}
      <div className="relative z-10 h-full flex flex-col">

        {/* Header */}
        <header className="flex-shrink-0 border-b border-slate-200/70 bg-white/80 backdrop-blur-sm">
          <div className="max-w-5xl mx-auto px-6 h-13 flex items-center justify-between py-3.5">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-xs shadow-sm">⛽</div>
              <span className="font-black text-base text-slate-900 tracking-tight">FuelFleet</span>
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest border border-slate-200 rounded px-1.5 py-0.5 ml-1">ANPTCO</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              Live System
            </div>
          </div>
        </header>

        {/* Main — stack from the top; any leftover space sits at the bottom */}
        <main className="flex-1 min-h-0 flex flex-col justify-start gap-6 py-6 px-6">

          {/* ── HERO ── */}
          <section className="text-center">
            <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-full px-3.5 py-1 mb-4">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-blue-600 text-[11px] font-bold uppercase tracking-widest">Fuel Ordering &amp; Monitoring Platform</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-black leading-tight tracking-tight text-slate-900 mb-2">
              Detect. Monitor.
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500">
                Prevent Fuel Theft.
              </span>
            </h1>

            <p className="text-slate-500 text-sm md:text-base max-w-xl mx-auto mb-4">
              Real-time IoT tracking · Geofenced delivery · QR-secured offloading · Built for{' '}
              <span className="text-slate-700 font-semibold">ANPTCO</span>
            </p>

            {/* Feature pills */}
            <div className="flex flex-wrap justify-center gap-2">
              {FEATURE_PILLS.map(f => (
                <span key={f.label} className={`inline-flex items-center gap-1.5 border rounded-full px-3 py-1 text-xs font-semibold bg-white/80 backdrop-blur-sm ${f.cls}`}>
                  <span className="text-sm leading-none">{f.icon}</span>
                  {f.label}
                </span>
              ))}
            </div>
          </section>

          {/* ── CAPABILITY CARDS ── */}
          <section className="grid grid-cols-3 gap-3 max-w-3xl mx-auto w-full">
            {CAPABILITY_CARDS.map(card => (
              <div key={card.title} className={`border rounded-xl p-4 bg-white/85 backdrop-blur-sm shadow-sm ${card.cls}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2.5 ${card.iconCls}`}>
                  {card.icon}
                </div>
                <p className="text-xs font-bold text-slate-800 mb-1.5 leading-tight">{card.title}</p>
                <p className="text-[11px] text-slate-500 leading-relaxed mb-2.5">{card.desc}</p>
                <div className="flex flex-wrap gap-1">
                  {card.tags.map(t => (
                    <span key={t} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${card.tagCls}`}>{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </section>

          {/* ── ROLE SELECTOR ── */}
          <section>
            <div className="text-center mb-3">
              <h2 className="text-base font-bold text-slate-700">Enter the Platform</h2>
              <p className="text-slate-400 text-xs mt-0.5">Select a role to explore its dashboard — no login required</p>
            </div>

            <div className="space-y-2 max-w-3xl mx-auto">
              {PERSONA_ROWS.map((row, ri) => (
                <div key={ri} className={`grid gap-2 ${row.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
                  {row
                    .map(id => DEMO_PERSONAS.find(p => p.id === id))
                    .filter((persona): persona is typeof DEMO_PERSONAS[number] => Boolean(persona))
                    .map(persona => {
                      const theme = PERSONA_THEME[persona.color] || PERSONA_THEME.blue;
                      const isLoading = loading === persona.id;
                      return (
                      <button
                        key={persona.id}
                        onClick={() => quickLogin(persona.id)}
                        disabled={isLoading}
                        className={`group flex items-center gap-3 bg-white/90 border ${theme.card} rounded-xl px-4 py-2.5 text-left transition-all duration-150 shadow-sm hover:shadow-md disabled:opacity-50 backdrop-blur-sm`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0 ${theme.iconBg}`}>
                          {persona.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-800 font-semibold text-sm truncate">{persona.name}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${theme.badge}`}>{persona.label}</span>
                          </div>
                          <p className="text-slate-400 text-xs truncate mt-0.5">{persona.description}</p>
                        </div>
                        {isLoading
                          ? <svg className="w-4 h-4 text-slate-400 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                          : <svg className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                        }
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Compact footer strip */}
            <div className="flex items-center justify-between mt-3 max-w-3xl mx-auto">
              <p className="text-[11px] text-slate-300">© {new Date().getFullYear()} FuelFleet · ANPTCO</p>
              <span className="flex items-center gap-1 text-[11px] text-emerald-500 font-medium">
                <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                All systems operational
              </span>
            </div>
          </section>

        </main>
      </div>
    </div>
  );
}
