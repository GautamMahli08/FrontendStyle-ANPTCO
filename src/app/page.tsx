'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  setCurrentUser,
  findUserByEmail,
  PLATFORM_ADMIN,
  getDrivers,
  getUsers,
  resetDemoData,
  DEMO_PERSONAS,
} from '@/src/lib/demo-data';

export default function Home() {
  const router  = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(false);

  const quickLogin = (personaId: string) => {
    setLoading(personaId);

    const persona = DEMO_PERSONAS.find(p => p.id === personaId);
    if (!persona) { setLoading(null); return; }

    // Handle platform admin
    if (persona.role === 'PLATFORM_ADMIN') {
      setCurrentUser(PLATFORM_ADMIN);
      router.push(persona.route);
      return;
    }

    // Handle drivers
    if (persona.role === 'DRIVER') {
      const drivers = getDrivers();
      const driver  = drivers.find(d => d.id === personaId);
      if (driver) {
        setCurrentUser({
          id: driver.id,
          email: driver.email,
          firstName: driver.firstName,
          lastName: driver.lastName,
          role: 'DRIVER',
          workspaceId: driver.workspaceId,
          verified: true,
        });
        router.push(persona.route);
        return;
      }
    }

    // All other roles
    const user = getUsers().find(u => u.id === personaId);
    if (user) {
      setCurrentUser(user);
      router.push(persona.route);
    }
    setLoading(null);
  };

  const handleReset = () => {
    resetDemoData();
    setShowReset(false);
    window.location.reload();
  };

  const colorMap: Record<string, { bg: string; border: string; badge: string; btnBg: string; btnHover: string; iconBg: string }> = {
    purple: {
      bg: 'bg-purple-50',
      border: 'border-purple-200 hover:border-purple-400',
      badge: 'bg-purple-100 text-purple-700',
      btnBg: 'bg-purple-600',
      btnHover: 'hover:bg-purple-700',
      iconBg: 'bg-purple-100',
    },
    blue: {
      bg: 'bg-blue-50',
      border: 'border-blue-200 hover:border-blue-400',
      badge: 'bg-blue-100 text-blue-700',
      btnBg: 'bg-blue-600',
      btnHover: 'hover:bg-blue-700',
      iconBg: 'bg-blue-100',
    },
    orange: {
      bg: 'bg-orange-50',
      border: 'border-orange-200 hover:border-orange-400',
      badge: 'bg-orange-100 text-orange-700',
      btnBg: 'bg-orange-500',
      btnHover: 'hover:bg-orange-600',
      iconBg: 'bg-orange-100',
    },
    green: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-200 hover:border-emerald-400',
      badge: 'bg-emerald-100 text-emerald-700',
      btnBg: 'bg-emerald-600',
      btnHover: 'hover:bg-emerald-700',
      iconBg: 'bg-emerald-100',
    },
    teal: {
      bg: 'bg-teal-50',
      border: 'border-teal-200 hover:border-teal-400',
      badge: 'bg-teal-100 text-teal-700',
      btnBg: 'bg-teal-600',
      btnHover: 'hover:bg-teal-700',
      iconBg: 'bg-teal-100',
    },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">

      {/* Header */}
      <header className="border-b border-slate-700/60 backdrop-blur-sm sticky top-0 z-50 bg-slate-900/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-lg">⛽</div>
            <div>
              <span className="text-white font-bold text-lg tracking-tight">FuelFleet</span>
              <span className="ml-2 text-xs text-slate-400 font-medium uppercase tracking-widest">ANPTCO</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 bg-amber-500/20 text-amber-400 text-xs font-semibold px-3 py-1.5 rounded-full border border-amber-500/30">
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></span>
              DEMO MODE
            </span>
            <button
              onClick={() => setShowReset(true)}
              className="text-slate-400 hover:text-white text-xs px-3 py-1.5 rounded-lg border border-slate-600 hover:border-slate-400 transition-colors"
            >
              Reset Data
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 mb-6">
          <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>
          <span className="text-blue-300 text-sm font-medium">Fuel Ordering & Monitoring Platform</span>
        </div>

        <h1 className="text-5xl md:text-6xl font-black text-white mb-5 leading-tight tracking-tight">
          Detect. Monitor.
          <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
            Prevent Fuel Theft.
          </span>
        </h1>

        <p className="text-slate-400 text-lg max-w-2xl mx-auto mb-4 leading-relaxed">
          Real-time IoT sensor tracking across every truck compartment. Geofenced delivery validation.
          QR-secured offloading. Built for <span className="text-white font-semibold">ANPTCO</span>.
        </p>

        <div className="flex flex-wrap justify-center gap-6 text-sm text-slate-400 mb-4">
          {[
            { icon: '📡', label: 'Live Telemetry' },
            { icon: '🔒', label: 'QR Delivery Lock' },
            { icon: '📍', label: 'Geofence Alerts' },
            { icon: '🚨', label: 'Theft Detection' },
            { icon: '📊', label: 'Compartment Tracking' },
          ].map(f => (
            <span key={f.label} className="flex items-center gap-1.5">
              <span>{f.icon}</span>{f.label}
            </span>
          ))}
        </div>
      </section>

      {/* Demo Login Section */}
      <section className="max-w-7xl mx-auto px-6 pb-20">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">Select a Demo User to Explore</h2>
          <p className="text-slate-400 text-sm">Click any card below for instant one-click access — no password needed</p>
        </div>

        {/* Row 1: Admin + Seller */}
        <div className="grid md:grid-cols-2 gap-5 mb-5">
          {DEMO_PERSONAS.filter(p => ['admin-platform', 'seller-001'].includes(p.id)).map(persona => {
            const c = colorMap[persona.color] || colorMap.blue;
            const isLoading = loading === persona.id;
            return (
              <PersonaCard
                key={persona.id}
                persona={persona}
                c={c}
                isLoading={isLoading}
                onLogin={() => quickLogin(persona.id)}
              />
            );
          })}
        </div>

        {/* Row 2: Transporters */}
        <div className="grid md:grid-cols-2 gap-5 mb-5">
          {DEMO_PERSONAS.filter(p => ['tsp-001', 'tsp-002'].includes(p.id)).map(persona => {
            const c = colorMap[persona.color] || colorMap.blue;
            const isLoading = loading === persona.id;
            return (
              <PersonaCard
                key={persona.id}
                persona={persona}
                c={c}
                isLoading={isLoading}
                onLogin={() => quickLogin(persona.id)}
              />
            );
          })}
        </div>

        {/* Row 3: Clients + Driver */}
        <div className="grid md:grid-cols-3 gap-5">
          {DEMO_PERSONAS.filter(p => ['client-001', 'client-002', 'driver-001'].includes(p.id)).map(persona => {
            const c = colorMap[persona.color] || colorMap.blue;
            const isLoading = loading === persona.id;
            return (
              <PersonaCard
                key={persona.id}
                persona={persona}
                c={c}
                isLoading={isLoading}
                onLogin={() => quickLogin(persona.id)}
              />
            );
          })}
        </div>
      </section>

      {/* Workflow Overview */}
      <section className="border-t border-slate-700/60 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-white text-center mb-10">Platform Workflow</h2>
          <div className="grid md:grid-cols-5 gap-4">
            {[
              { step: '01', icon: '📦', title: 'Client Orders', desc: 'Client places fuel order specifying type, volume & delivery location' },
              { step: '02', icon: '✅', title: 'Seller Accepts', desc: 'Seller reviews, accepts & assigns order to a Transport Provider' },
              { step: '03', icon: '🚛', title: 'TSP Assigns Truck', desc: 'Transporter selects truck, assigns fuel type per compartment' },
              { step: '04', icon: '📡', title: 'Live Monitoring', desc: 'IoT sensors track fuel levels per compartment in real-time en route' },
              { step: '05', icon: '📱', title: 'QR Delivery', desc: 'Client scans QR to accept; system records pre/post fuel for each compartment' },
            ].map((s, i) => (
              <div key={s.step} className="relative">
                {i < 4 && (
                  <div className="hidden md:block absolute top-8 left-full w-full h-0.5 bg-gradient-to-r from-blue-500/50 to-transparent z-0" />
                )}
                <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 relative z-10">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">{s.step}</span>
                    <span className="text-xl">{s.icon}</span>
                  </div>
                  <h3 className="text-white font-semibold text-sm mb-1">{s.title}</h3>
                  <p className="text-slate-400 text-xs leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-700/60 py-6">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-sm text-slate-500">
          <span>© {new Date().getFullYear()} FuelFleet · ANPTCO</span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
            Demo environment — data resets on refresh
          </span>
        </div>
      </footer>

      {/* Reset Confirmation Modal */}
      {showReset && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <div className="text-4xl mb-4 text-center">🔄</div>
            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Reset Demo Data?</h3>
            <p className="text-gray-600 text-sm text-center mb-6">
              This will restore all users, trucks, and orders to the original demo state. Any changes you made will be lost.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowReset(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl font-medium hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl font-medium transition"
              >
                Reset Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PersonaCard({
  persona,
  c,
  isLoading,
  onLogin,
}: {
  persona: (typeof DEMO_PERSONAS)[number];
  c: { bg: string; border: string; badge: string; btnBg: string; btnHover: string; iconBg: string };
  isLoading: boolean;
  onLogin: () => void;
}) {
  return (
    <div
      className={`group bg-slate-800/50 border-2 ${c.border} rounded-2xl p-6 transition-all duration-200 hover:shadow-xl hover:shadow-black/20 cursor-pointer hover:-translate-y-0.5`}
      onClick={onLogin}
    >
      <div className="flex items-start gap-4">
        <div className={`w-14 h-14 rounded-xl ${c.iconBg} flex items-center justify-center text-2xl flex-shrink-0`}>
          {persona.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="text-white font-bold text-lg leading-tight">{persona.name}</h3>
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${c.badge}`}>{persona.label}</span>
          </div>
          <p className="text-slate-400 text-sm leading-relaxed mb-3">{persona.description}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-mono bg-slate-700/60 px-2 py-1 rounded-md truncate flex-1">
              {persona.email}
            </span>
          </div>
        </div>
      </div>

      <button
        onClick={e => { e.stopPropagation(); onLogin(); }}
        disabled={isLoading}
        className={`mt-4 w-full ${c.btnBg} ${c.btnHover} text-white font-semibold py-2.5 rounded-xl transition-all text-sm flex items-center justify-center gap-2 shadow-lg`}
      >
        {isLoading ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Logging in…
          </>
        ) : (
          <>
            Enter as {persona.label}
            <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </>
        )}
      </button>
    </div>
  );
}
