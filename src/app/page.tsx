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

export default function Home() {
  const router  = useRouter();
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

  const cm: Record<string, { card: string; badge: string; iconBg: string }> = {
    purple: { card: 'border-purple-200 hover:border-purple-400 hover:bg-purple-50/50', badge: 'bg-purple-100 text-purple-700', iconBg: 'bg-purple-100 text-purple-600' },
    blue:   { card: 'border-blue-200   hover:border-blue-400   hover:bg-blue-50/50',   badge: 'bg-blue-100   text-blue-700',   iconBg: 'bg-blue-100   text-blue-600'   },
    orange: { card: 'border-orange-200 hover:border-orange-400 hover:bg-orange-50/50', badge: 'bg-orange-100 text-orange-700', iconBg: 'bg-orange-100 text-orange-600' },
    green:  { card: 'border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50/50', badge: 'bg-emerald-100 text-emerald-700', iconBg: 'bg-emerald-100 text-emerald-600' },
    teal:   { card: 'border-teal-200   hover:border-teal-400   hover:bg-teal-50/50',   badge: 'bg-teal-100   text-teal-700',   iconBg: 'bg-teal-100   text-teal-600'   },
  };

  const rows = [
    ['admin-platform', 'seller-001'],
    ['tsp-001', 'tsp-002'],
    ['client-001', 'client-002', 'driver-001'],
  ];

  return (
    <div className="h-screen overflow-hidden bg-white flex flex-col">

      {/* ── OMAN MAP BACKGROUND ── */}
      <div className="fixed inset-0 pointer-events-none z-0" aria-hidden>
        <svg className="absolute inset-0 w-full h-full"
          viewBox="0 0 900 900" preserveAspectRatio="xMidYMid slice"
          xmlns="http://www.w3.org/2000/svg">
          <defs>
            {/* Route paths — defined in un-shifted coords, shift applied by wrapper group */}
            <path id="rt1" d="M 348 185 C 385 182, 415 178, 448 182 C 490 187, 536 205, 573 230" />
            <path id="rt2" d="M 573 230 C 598 248, 624 270, 648 295 C 655 308, 658 318, 655 330" />
            <path id="rt3" d="M 573 230 C 552 250, 526 268, 502 278 C 478 290, 462 330, 450 375
               C 438 420, 430 455, 422 480 C 408 516, 385 550, 358 580 C 335 605, 308 630, 278 652" />
            <path id="rt3r" d="M 278 652 C 308 630, 335 605, 358 580 C 385 550, 408 516, 422 480
               C 430 455, 438 420, 450 375 C 462 330, 478 290, 502 278 C 526 268, 552 250, 573 230" />
            {/* Drop-shadow for popup cards */}
            <filter id="pshadow" x="-30%" y="-50%" width="160%" height="200%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#00000022" />
            </filter>
          </defs>

          {/* Full sea tint */}
          <rect width="900" height="900" fill="#bae6fd" opacity="0.18" />

          {/* ── All map content shifted 85 units down so Muscat clears the header ── */}
          <g transform="translate(0, 85)">

            {/* Neighbouring land: Saudi / UAE */}
            <path d="M 0 0 L 250 0 L 280 40 L 340 60 L 340 185 L 250 220 L 200 300 L 150 450 L 100 600 L 0 680 Z"
              fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="0.7" />
            <path d="M 340 60 L 380 35 L 430 20 L 460 30 L 448 80 L 420 100 L 380 110 L 348 185"
              fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="0.7" />
            <text x="130" y="120" fontSize="9" fill="#94a3b8" fontFamily="sans-serif" opacity="0.6" transform="rotate(-5,130,120)">UAE</text>
            <text x="60" y="300" fontSize="9" fill="#94a3b8" fontFamily="sans-serif" opacity="0.55" transform="rotate(-8,60,300)">Saudi Arabia</text>

            {/* Musandam exclave */}
            <path d="M 390 28 C 406 12, 432 8, 450 16 C 466 24, 472 44, 465 60
               C 458 75, 440 84, 422 82 C 404 78, 392 64, 388 48 Z"
              fill="#93c5fd" opacity="0.6" stroke="#60a5fa" strokeWidth="1.2" />
            <text x="428" y="100" textAnchor="middle" fontSize="7.5" fill="#3b82f6" fontFamily="sans-serif" opacity="0.65">Musandam</text>

            {/* Oman main body */}
            <path d="M 348 185
               C 388 180, 422 176, 452 180 C 492 185, 538 204, 573 230
               C 592 244, 614 260, 632 275 C 647 288, 658 302, 658 320
               C 657 338, 647 358, 636 378 C 622 402, 604 424, 584 446
               C 562 470, 537 492, 512 514 C 489 534, 465 554, 442 572
               C 416 592, 389 614, 362 636 C 340 654, 312 667, 276 654
               C 254 646, 232 652, 208 662 C 190 670, 172 670, 158 660
               C 144 648, 140 630, 144 612 C 148 592, 157 568, 166 544
               C 176 516, 187 486, 196 457 C 206 425, 212 395, 220 365
               C 230 332, 246 302, 266 276 C 284 252, 305 234, 328 217
               C 337 210, 344 198, 348 185 Z"
              fill="#bfdbfe" opacity="0.6" stroke="#60a5fa" strokeWidth="1.2" />

            {/* Hajar Mountains range hint */}
            <path d="M 370 165 L 382 155 L 394 163 L 408 152 L 422 162 L 436 150
               L 450 160 L 464 148 L 478 158 L 492 168 L 508 156 L 522 168 L 536 178"
              fill="none" stroke="#60a5fa" strokeWidth="1" opacity="0.28" strokeLinejoin="round" />

            {/* Sea labels */}
            <text x="668" y="185" fontSize="9.5" fill="#38bdf8" fontFamily="sans-serif" opacity="0.7" transform="rotate(14,668,185)">Gulf of Oman</text>
            <text x="78" y="390" fontSize="9" fill="#94a3b8" fontFamily="sans-serif" opacity="0.5" transform="rotate(-17,78,390)">Empty Quarter</text>
            <text x="118" y="690" fontSize="9" fill="#38bdf8" fontFamily="sans-serif" opacity="0.6">Arabian Sea</text>

            {/* Road network */}
            <use href="#rt1" fill="none" stroke="#2563eb" strokeWidth="1.5" strokeDasharray="5,4" opacity="0.22" />
            <use href="#rt2" fill="none" stroke="#2563eb" strokeWidth="1.5" strokeDasharray="5,4" opacity="0.22" />
            <use href="#rt3" fill="none" stroke="#2563eb" strokeWidth="1.5" strokeDasharray="5,4" opacity="0.22" />
            <path d="M 348 185 C 400 185, 460 195, 510 210 C 540 220, 560 226, 573 230"
              fill="none" stroke="#2563eb" strokeWidth="1" strokeDasharray="4,5" opacity="0.15" />

            {/* ── City markers ── */}

            {/* Muscat — pulsing depot */}
            <circle cx="573" cy="230" r="8" fill="none" stroke="#059669" strokeWidth="1">
              <animate attributeName="r" values="8;22;8" dur="3s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.3;0;0.3" dur="3s" repeatCount="indefinite" />
            </circle>
            <circle cx="573" cy="230" r="6" fill="#10b981" stroke="white" strokeWidth="2" opacity="0.9" />
            <text x="583" y="225" fontSize="9" fontWeight="bold" fill="#065f46" fontFamily="sans-serif" opacity="0.85">Muscat</text>
            <text x="583" y="237" fontSize="7" fill="#64748b" fontFamily="sans-serif" opacity="0.7">ANPTCO Depot</text>

            <circle cx="448" cy="182" r="4" fill="#3b82f6" stroke="white" strokeWidth="1.5" opacity="0.65" />
            <text x="454" y="177" fontSize="8" fill="#1e40af" fontFamily="sans-serif" opacity="0.7">Sohar</text>
            <circle cx="502" cy="278" r="3.5" fill="#3b82f6" stroke="white" strokeWidth="1.5" opacity="0.6" />
            <text x="510" y="273" fontSize="8" fill="#1e40af" fontFamily="sans-serif" opacity="0.65">Nizwa</text>
            <circle cx="655" cy="320" r="3.5" fill="#3b82f6" stroke="white" strokeWidth="1.5" opacity="0.55" />
            <text x="643" y="315" fontSize="8" fill="#1e40af" fontFamily="sans-serif" textAnchor="end" opacity="0.6">Sur</text>
            <circle cx="276" cy="654" r="4" fill="#3b82f6" stroke="white" strokeWidth="1.5" opacity="0.6" />
            <text x="284" y="649" fontSize="8" fill="#1e40af" fontFamily="sans-serif" opacity="0.65">Salalah</text>
            <circle cx="348" cy="185" r="3.5" fill="#3b82f6" stroke="white" strokeWidth="1.5" opacity="0.5" />
            <text x="338" y="180" fontSize="8" fill="#1e40af" fontFamily="sans-serif" textAnchor="end" opacity="0.55">Buraimi</text>

            {/* Station A geofence ring */}
            <circle cx="568" cy="240" r="22" fill="rgba(124,58,237,0.05)" stroke="#7c3aed" strokeWidth="1" strokeDasharray="3,3" opacity="0.35" />
            <text x="568" y="268" textAnchor="middle" fontSize="7" fill="#7c3aed" opacity="0.45" fontFamily="sans-serif">Station A</text>

            {/* ══════════════════════════════════
                TRUCK ANIMATIONS
            ══════════════════════════════════ */}

            {/* Truck 1: Buraimi → Muscat (emerald, 12s) */}
            <circle cx="573" cy="230" r="0" fill="none" stroke="#10b981" strokeWidth="2" opacity="0">
              <animate attributeName="r" values="0;26;0" dur="12s" begin="0s" repeatCount="indefinite" keyTimes="0;0.83;1" />
              <animate attributeName="opacity" values="0;0.5;0" dur="12s" begin="0s" repeatCount="indefinite" keyTimes="0;0.83;1" />
            </circle>
            <g>
              <circle r="5" fill="#10b981" stroke="white" strokeWidth="1.5" />
              <circle r="9" fill="none" stroke="#10b981" strokeWidth="1" opacity="0.4">
                <animate attributeName="r" values="5;13;5" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite" />
              </circle>
              <animateMotion dur="12s" repeatCount="indefinite" rotate="auto" keyPoints="0;1;1;1" keyTimes="0;0.75;0.92;1" calcMode="linear">
                <mpath href="#rt1" />
              </animateMotion>
            </g>

            {/* Truck 2: Muscat → Sur (cyan, 10s, begin 2s) */}
            <circle cx="655" cy="320" r="0" fill="none" stroke="#06b6d4" strokeWidth="2" opacity="0">
              <animate attributeName="r" values="0;22;0" dur="10s" begin="2s" repeatCount="indefinite" keyTimes="0;0.85;1" />
              <animate attributeName="opacity" values="0;0.5;0" dur="10s" begin="2s" repeatCount="indefinite" keyTimes="0;0.85;1" />
            </circle>
            <g>
              <circle r="5" fill="#06b6d4" stroke="white" strokeWidth="1.5" />
              <circle r="9" fill="none" stroke="#06b6d4" strokeWidth="1" opacity="0.4">
                <animate attributeName="r" values="5;13;5" dur="2.2s" repeatCount="indefinite" begin="0.5s" />
                <animate attributeName="opacity" values="0.5;0;0.5" dur="2.2s" repeatCount="indefinite" begin="0.5s" />
              </circle>
              <animateMotion dur="10s" repeatCount="indefinite" rotate="auto" begin="2s" keyPoints="0;1;1;1" keyTimes="0;0.75;0.9;1" calcMode="linear">
                <mpath href="#rt2" />
              </animateMotion>
            </g>

            {/* Truck 3: Muscat → Salalah (amber, 20s, begin 4s) */}
            <circle cx="276" cy="654" r="0" fill="none" stroke="#f97316" strokeWidth="2" opacity="0">
              <animate attributeName="r" values="0;24;0" dur="20s" begin="4s" repeatCount="indefinite" keyTimes="0;0.85;1" />
              <animate attributeName="opacity" values="0;0.5;0" dur="20s" begin="4s" repeatCount="indefinite" keyTimes="0;0.85;1" />
            </circle>
            <g>
              <circle r="5" fill="#f97316" stroke="white" strokeWidth="1.5" />
              <circle r="9" fill="none" stroke="#f97316" strokeWidth="1" opacity="0.35">
                <animate attributeName="r" values="5;13;5" dur="2.5s" repeatCount="indefinite" begin="1s" />
                <animate attributeName="opacity" values="0.4;0;0.4" dur="2.5s" repeatCount="indefinite" begin="1s" />
              </circle>
              <animateMotion dur="20s" repeatCount="indefinite" rotate="auto" begin="4s" keyPoints="0;1;1;1" keyTimes="0;0.75;0.90;1" calcMode="linear">
                <mpath href="#rt3" />
              </animateMotion>
            </g>

            {/* Return truck: Salalah → Muscat (purple, dimmer) */}
            <g opacity="0.5">
              <circle r="4" fill="#8b5cf6" stroke="white" strokeWidth="1" />
              <animateMotion dur="18s" repeatCount="indefinite" rotate="auto" begin="12s" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
                <mpath href="#rt3r" />
              </animateMotion>
            </g>

            {/* ══════════════════════════════════
                EVENT POPUP CARDS
                Each: static position wrapper → inner group animates opacity+rise
            ══════════════════════════════════ */}

            {/* 1. "✓ Delivered — Station A" at Muscat, synced with Truck 1 arrival (t≈9s in 12s cycle) */}
            <g transform="translate(573, 208)">
              <g opacity="0">
                <rect x="-56" y="-14" width="112" height="24" rx="12" fill="white" stroke="#10b981" strokeWidth="1.5" filter="url(#pshadow)" />
                <circle cx="-38" cy="-2" r="6.5" fill="#10b981" />
                <text x="-38" y="2" textAnchor="middle" fontSize="8" fontWeight="bold" fill="white" fontFamily="sans-serif">✓</text>
                <text x="6" y="2" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#065f46" fontFamily="sans-serif">Delivered — Station A</text>
                <animate attributeName="opacity" values="0;0;1;1;1;0" dur="12s" begin="0s" repeatCount="indefinite" keyTimes="0;0.72;0.78;0.86;0.93;1" />
                <animateTransform attributeName="transform" type="translate" values="0 6;0 6;0 0;0 0;0 -4;0 -8" dur="12s" begin="0s" repeatCount="indefinite" keyTimes="0;0.72;0.78;0.86;0.93;1" />
              </g>
            </g>

            {/* 2. "✓ Delivered — Sur" synced with Truck 2 arrival (t≈9.5s: begin=2s, 10s cycle, 75%=7.5s → 2+7.5=9.5s) */}
            <g transform="translate(655, 298)">
              <g opacity="0">
                <rect x="-52" y="-14" width="104" height="24" rx="12" fill="white" stroke="#0891b2" strokeWidth="1.5" filter="url(#pshadow)" />
                <circle cx="-35" cy="-2" r="6.5" fill="#0891b2" />
                <text x="-35" y="2" textAnchor="middle" fontSize="8" fontWeight="bold" fill="white" fontFamily="sans-serif">✓</text>
                <text x="5" y="2" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#0c4a6e" fontFamily="sans-serif">Delivered — Sur</text>
                <animate attributeName="opacity" values="0;0;1;1;1;0" dur="10s" begin="2s" repeatCount="indefinite" keyTimes="0;0.72;0.79;0.87;0.94;1" />
                <animateTransform attributeName="transform" type="translate" values="0 6;0 6;0 0;0 0;0 -4;0 -8" dur="10s" begin="2s" repeatCount="indefinite" keyTimes="0;0.72;0.79;0.87;0.94;1" />
              </g>
            </g>

            {/* 3. "✓ Delivered — Salalah" synced with Truck 3 arrival (begin=4s, 20s cycle, 75%=15s → t=19s) */}
            <g transform="translate(276, 632)">
              <g opacity="0">
                <rect x="-52" y="-14" width="104" height="24" rx="12" fill="white" stroke="#ea580c" strokeWidth="1.5" filter="url(#pshadow)" />
                <circle cx="-35" cy="-2" r="6.5" fill="#ea580c" />
                <text x="-35" y="2" textAnchor="middle" fontSize="8" fontWeight="bold" fill="white" fontFamily="sans-serif">✓</text>
                <text x="5" y="2" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#7c2d12" fontFamily="sans-serif">Delivered — Salalah</text>
                <animate attributeName="opacity" values="0;0;1;1;1;0" dur="20s" begin="4s" repeatCount="indefinite" keyTimes="0;0.72;0.77;0.85;0.93;1" />
                <animateTransform attributeName="transform" type="translate" values="0 6;0 6;0 0;0 0;0 -4;0 -8" dur="20s" begin="4s" repeatCount="indefinite" keyTimes="0;0.72;0.77;0.85;0.93;1" />
              </g>
            </g>

            {/* 4. "📍 Geofence Entered" near Station A — slightly before Truck 1 delivery (t≈8s) */}
            <g transform="translate(615, 230)">
              <g opacity="0">
                <rect x="-55" y="-14" width="110" height="24" rx="12" fill="white" stroke="#7c3aed" strokeWidth="1.5" filter="url(#pshadow)" />
                <circle cx="-37" cy="-2" r="6.5" fill="#7c3aed" />
                <text x="-37" y="2" textAnchor="middle" fontSize="9" fill="white" fontFamily="sans-serif">📍</text>
                <text x="5" y="2" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#4c1d95" fontFamily="sans-serif">Geofence Entered</text>
                <animate attributeName="opacity" values="0;0;1;1;1;0" dur="12s" begin="0s" repeatCount="indefinite" keyTimes="0;0.62;0.68;0.76;0.84;1" />
                <animateTransform attributeName="transform" type="translate" values="0 6;0 6;0 0;0 0;0 -4;0 -8" dur="12s" begin="0s" repeatCount="indefinite" keyTimes="0;0.62;0.68;0.76;0.84;1" />
              </g>
            </g>

            {/* 5. "🚨 Fuel Anomaly Detected" mid-route on Salalah highway (t≈50% = 4+10=14s) */}
            <g transform="translate(455, 420)">
              <g opacity="0">
                <rect x="-60" y="-14" width="120" height="24" rx="12" fill="white" stroke="#dc2626" strokeWidth="1.5" filter="url(#pshadow)" />
                <circle cx="-42" cy="-2" r="6.5" fill="#dc2626" />
                <text x="-42" y="2" textAnchor="middle" fontSize="9" fill="white" fontFamily="sans-serif">🚨</text>
                <text x="4" y="2" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#7f1d1d" fontFamily="sans-serif">Fuel Anomaly Detected</text>
                <animate attributeName="opacity" values="0;0;1;1;1;0" dur="20s" begin="4s" repeatCount="indefinite" keyTimes="0;0.48;0.54;0.62;0.70;1" />
                <animateTransform attributeName="transform" type="translate" values="0 6;0 6;0 0;0 0;0 -4;0 -8" dur="20s" begin="4s" repeatCount="indefinite" keyTimes="0;0.48;0.54;0.62;0.70;1" />
              </g>
            </g>

          </g>{/* end translate(0, 85) */}
        </svg>

        {/* Vignette — softens edges, keeps centre map visible */}
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 72% 62% at 58% 44%, transparent 12%, rgba(255,255,255,0.42) 100%)' }} />
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

        {/* Main — flex col, push hero to top & login to bottom */}
        <main className="flex-1 min-h-0 flex flex-col justify-center gap-5 py-5 px-6">

          {/* ── HERO — top ── */}
          <section className="text-center">
            <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-full px-3.5 py-1 mb-4">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-blue-600 text-[11px] font-bold uppercase tracking-widest">Fuel Ordering & Monitoring Platform</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-black leading-tight tracking-tight text-slate-900 mb-2">
              Detect. Monitor.
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500">
                Prevent Fuel Theft.
              </span>
            </h1>

            <p className="text-slate-500 text-sm md:text-base max-w-xl mx-auto mb-4">
              Real-time IoT tracking · Geofenced delivery · QR-secured offloading · Built for <span className="text-slate-700 font-semibold">ANPTCO</span>
            </p>

            {/* Feature pills */}
            <div className="flex flex-wrap justify-center gap-2">
              {[
                { icon: '📡', label: 'Live Telemetry',       cls: 'bg-blue-50   border-blue-200   text-blue-700'   },
                { icon: '🚨', label: 'Theft Detection',      cls: 'bg-red-50    border-red-200    text-red-700'    },
                { icon: '📍', label: 'Geofence Alerts',      cls: 'bg-purple-50 border-purple-200 text-purple-700' },
                { icon: '🔒', label: 'QR Delivery Lock',     cls: 'bg-teal-50   border-teal-200   text-teal-700'   },
                { icon: '📊', label: 'Compartment Tracking', cls: 'bg-cyan-50   border-cyan-200   text-cyan-700'   },
                { icon: '🗺️', label: 'Route Monitoring',     cls: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
              ].map(f => (
                <span key={f.label} className={`inline-flex items-center gap-1.5 border rounded-full px-3 py-1 text-xs font-semibold bg-white/80 backdrop-blur-sm ${f.cls}`}>
                  <span className="text-sm leading-none">{f.icon}</span>
                  {f.label}
                </span>
              ))}
            </div>
          </section>

          {/* ── FEATURE CARDS — middle ── */}
          <section className="grid grid-cols-3 gap-3 max-w-3xl mx-auto w-full">
            {[
              {
                cls:    'border-blue-200   bg-blue-50/70',
                iconCls:'bg-blue-100   text-blue-600',
                icon:   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" /></svg>,
                title:  'Per-Compartment Telemetry',
                desc:   'Galileosky sensors report fuel levels for every truck compartment every 10–30 seconds. Calibration tables convert raw sensor values to exact litres.',
                tags:   ['Galileosky IoT', 'AWS IoT Core', 'flespi MQTT'],
                tagCls: 'bg-blue-100 text-blue-700',
              },
              {
                cls:    'border-red-200    bg-red-50/70',
                iconCls:'bg-red-100    text-red-600',
                icon:   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
                title:  'Fuel Theft Detection',
                desc:   'Unexpected fuel drops outside active delivery windows trigger anomaly alerts classified HIGH / MEDIUM / LOW, routed to the seller manager instantly.',
                tags:   ['Anomaly Detection', 'Real-time Alerts', 'Event Log'],
                tagCls: 'bg-red-100 text-red-700',
              },
              {
                cls:    'border-purple-200 bg-purple-50/70',
                iconCls:'bg-purple-100 text-purple-600',
                icon:   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
                title:  'Geofence & QR Validation',
                desc:   'Delivery only unlocks when the truck enters the client\'s geofence and the client scans the truck\'s unique QR code. Return-to-depot completes the cycle.',
                tags:   ['Haversine Geofencing', 'QR Scan Lock', 'Journey Cycle'],
                tagCls: 'bg-purple-100 text-purple-700',
              },
            ].map(card => (
              <div key={card.title} className={`border rounded-xl p-4 bg-white/80 backdrop-blur-sm shadow-sm ${card.cls}`}>
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

          {/* ── USER SELECTOR — bottom ── */}
          <section>
            <div className="text-center mb-3">
              <h2 className="text-base font-bold text-slate-700">Enter the Platform</h2>
              <p className="text-slate-400 text-xs mt-0.5">Select a role to explore its dashboard — no login required</p>
            </div>

            <div className="space-y-2 max-w-3xl mx-auto">
              {rows.map((row, ri) => (
                <div key={ri} className={`grid gap-2 ${row.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
                  {DEMO_PERSONAS.filter(p => row.includes(p.id)).map(persona => {
                    const c = cm[persona.color] || cm.blue;
                    const isLoading = loading === persona.id;
                    return (
                      <button
                        key={persona.id}
                        onClick={() => quickLogin(persona.id)}
                        disabled={isLoading}
                        className={`group flex items-center gap-3 bg-white/90 border ${c.card} rounded-xl px-4 py-2.5 text-left transition-all duration-150 shadow-sm hover:shadow-md disabled:opacity-50 backdrop-blur-sm`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0 ${c.iconBg}`}>
                          {persona.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-800 font-semibold text-sm truncate">{persona.name}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${c.badge}`}>{persona.label}</span>
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
