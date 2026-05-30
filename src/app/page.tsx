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
      setCurrentUser(PLATFORM_ADMIN);
      router.push(persona.route);
      return;
    }

    if (persona.role === 'DRIVER') {
      const driver = getDrivers().find(d => d.id === personaId);
      if (driver) {
        setCurrentUser({
          id: driver.id, email: driver.email,
          firstName: driver.firstName, lastName: driver.lastName,
          role: 'DRIVER', workspaceId: driver.workspaceId, verified: true,
        });
        router.push(persona.route);
      }
      return;
    }

    const user = getUsers().find(u => u.id === personaId);
    if (user) { setCurrentUser(user); router.push(persona.route); }
    setLoading(null);
  };

  const colorMap: Record<string, {
    border: string; badge: string; btnBg: string; btnHover: string; iconBg: string; iconText: string;
  }> = {
    purple: { border: 'border-purple-800 hover:border-purple-500', badge: 'bg-purple-900/60 text-purple-300', btnBg: 'bg-purple-600', btnHover: 'hover:bg-purple-500', iconBg: 'bg-purple-900/60', iconText: 'text-purple-300' },
    blue:   { border: 'border-blue-800   hover:border-blue-500',   badge: 'bg-blue-900/60   text-blue-300',   btnBg: 'bg-blue-600',   btnHover: 'hover:bg-blue-500',   iconBg: 'bg-blue-900/60',   iconText: 'text-blue-300'   },
    orange: { border: 'border-orange-800 hover:border-orange-500', badge: 'bg-orange-900/60 text-orange-300', btnBg: 'bg-orange-600', btnHover: 'hover:bg-orange-500', iconBg: 'bg-orange-900/60', iconText: 'text-orange-300' },
    green:  { border: 'border-emerald-800 hover:border-emerald-500', badge: 'bg-emerald-900/60 text-emerald-300', btnBg: 'bg-emerald-600', btnHover: 'hover:bg-emerald-500', iconBg: 'bg-emerald-900/60', iconText: 'text-emerald-300' },
    teal:   { border: 'border-teal-800   hover:border-teal-500',   badge: 'bg-teal-900/60   text-teal-300',   btnBg: 'bg-teal-600',   btnHover: 'hover:bg-teal-500',   iconBg: 'bg-teal-900/60',   iconText: 'text-teal-300'   },
  };

  const rows = [
    ['admin-platform', 'seller-001'],
    ['tsp-001', 'tsp-002'],
    ['client-001', 'client-002', 'driver-001'],
  ];

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">

      {/* Header */}
      <header className="border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-base">⛽</div>
            <span className="text-white font-bold tracking-tight">FuelFleet</span>
            <span className="text-slate-500 text-xs font-medium uppercase tracking-widest">ANPTCO</span>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-14 pb-10 text-center">
        <h1 className="text-4xl md:text-5xl font-black text-white mb-4 leading-tight tracking-tight">
          Detect. Monitor.
          <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
            Prevent Fuel Theft.
          </span>
        </h1>
        <p className="text-slate-400 text-base max-w-xl mx-auto leading-relaxed">
          Real-time IoT sensor tracking across every truck compartment. Geofenced delivery validation.
          QR-secured offloading.
        </p>
      </section>

      {/* User Selection */}
      <section className="max-w-5xl mx-auto px-6 pb-16 w-full">
        <p className="text-slate-500 text-sm text-center mb-6">Select a user to enter the platform</p>

        <div className="space-y-3">
          {rows.map((row, ri) => (
            <div key={ri} className={`grid gap-3 ${row.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
              {DEMO_PERSONAS.filter(p => row.includes(p.id)).map(persona => {
                const c = colorMap[persona.color] || colorMap.blue;
                const isLoading = loading === persona.id;
                return (
                  <button
                    key={persona.id}
                    onClick={() => quickLogin(persona.id)}
                    disabled={isLoading}
                    className={`group flex items-center gap-4 bg-slate-800/70 border ${c.border} rounded-xl px-5 py-4 text-left transition-all duration-150 hover:bg-slate-800 disabled:opacity-60`}
                  >
                    {/* Icon */}
                    <div className={`w-11 h-11 rounded-lg ${c.iconBg} flex items-center justify-center text-xl flex-shrink-0`}>
                      {persona.icon}
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-white font-semibold text-sm truncate">{persona.name}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${c.badge}`}>
                          {persona.label}
                        </span>
                      </div>
                      <p className="text-slate-500 text-xs truncate">{persona.description}</p>
                    </div>

                    {/* Arrow / spinner */}
                    <div className="flex-shrink-0 ml-1">
                      {isLoading ? (
                        <svg className="w-4 h-4 text-slate-400 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-800 py-5">
        <div className="max-w-5xl mx-auto px-6 text-center text-xs text-slate-600">
          © {new Date().getFullYear()} FuelFleet · ANPTCO
        </div>
      </footer>
    </div>
  );
}
