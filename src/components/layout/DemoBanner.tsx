'use client';

import { useRouter } from 'next/navigation';
import {
  setCurrentUser, getUsers, getDrivers, PLATFORM_ADMIN, DEMO_PERSONAS, clearAllData,
  getProductMode, personaLandingRoute, MONITORING_PERSONA_IDS,
} from '@/src/lib/demo-data';
import type { ProductMode } from '@/src/types';
import { useEffect, useState } from 'react';

const colorDot: Record<string, string> = {
  purple: 'bg-purple-400',
  blue:   'bg-blue-400',
  orange: 'bg-orange-400',
  green:  'bg-emerald-400',
  teal:   'bg-teal-400',
};

// Personas offered in the switcher — kept in sync with the login screen (hides
// Platform Admin, the second client and the Driver). Monitoring-Only is seller-facing
// for now, so it offers that persona alone.
const SWITCHABLE_IDS_BY_MODE: Record<ProductMode, string[]> = {
  full:       ['client-001', 'seller-001', 'tsp-001', 'tsp-002'],
  monitoring: MONITORING_PERSONA_IDS,
};

export default function DemoBanner({ currentUserId }: { currentUserId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Hydrate the active product mode after mount (localStorage is client-only).
  const [mode, setMode] = useState<ProductMode>('full');
  useEffect(() => { setMode(getProductMode()); }, []);

  const switchablePersonas = DEMO_PERSONAS.filter(p => SWITCHABLE_IDS_BY_MODE[mode].includes(p.id));

  const switchTo = (personaId: string) => {
    setOpen(false);
    const persona = DEMO_PERSONAS.find(p => p.id === personaId);
    if (!persona) return;
    // Monitoring-Only has no dashboard — land on Fleet Monitor instead.
    const route = personaLandingRoute(persona, mode);

    if (persona.role === 'PLATFORM_ADMIN') {
      setCurrentUser(PLATFORM_ADMIN);
      router.push(route);
      return;
    }
    if (persona.role === 'DRIVER') {
      const drivers = getDrivers();
      const driver  = drivers.find(d => d.id === personaId);
      if (driver) {
        setCurrentUser({ id: driver.id, email: driver.email, firstName: driver.firstName, lastName: driver.lastName, role: 'DRIVER', workspaceId: driver.workspaceId, verified: true });
        router.push(route);
      }
      return;
    }
    const user = getUsers().find(u => u.id === personaId);
    if (user) {
      setCurrentUser(user);
      router.push(route);
    }
  };

  const resetDemo = () => {
    if (!confirm(
      'Reset all demo data?\n\nThis clears every order, truck assignment, alert and tank back to the original demo state and returns to the home screen.'
    )) return;
    setOpen(false);
    clearAllData();
    // Hard reload so all in-memory React state is rebuilt from the fresh seed.
    window.location.href = '/';
  };

  const current = DEMO_PERSONAS.find(p => p.id === currentUserId);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25 text-amber-300 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
      >
        <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
        DEMO
        {current && <span className="text-amber-200 hidden sm:inline">· {current.name}</span>}
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 overflow-hidden">
            <div className="p-3 border-b border-gray-100 bg-amber-50">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">Switch Demo User</p>
              <p className="text-xs text-amber-600 mt-0.5">
                {mode === 'monitoring' ? 'Monitoring-Only — seller access' : 'Click to instantly switch role'}
              </p>
            </div>
            <div className="py-1 max-h-80 overflow-y-auto">
              {switchablePersonas.map(persona => {
                const isCurrent = persona.id === currentUserId;
                return (
                  <button
                    key={persona.id}
                    onClick={() => switchTo(persona.id)}
                    disabled={isCurrent}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      isCurrent
                        ? 'bg-blue-50 cursor-default'
                        : 'hover:bg-gray-50 cursor-pointer'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colorDot[persona.color] || 'bg-gray-400'}`} />
                    <span className="text-base leading-none">{persona.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${isCurrent ? 'text-blue-700' : 'text-gray-900'}`}>
                        {persona.name}
                        {isCurrent && <span className="ml-1.5 text-xs text-blue-500 font-normal">← current</span>}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{persona.label}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="p-3 border-t border-gray-100 bg-gray-50 space-y-2">
              <button
                onClick={resetDemo}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg py-2 transition-colors"
              >
                🔄 Reset Demo Data
              </button>
              <button
                onClick={() => { setOpen(false); router.push('/'); }}
                className="w-full text-center text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                ← Back to Demo Home
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
