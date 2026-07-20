'use client';

import { useRouter } from 'next/navigation';
import OomcoLogo from '@/src/components/assets/OomcoLogo';
import AnptcoLogo from '@/src/components/assets/AnptcoLogo';

const FEATURES = [
  { icon: '📡', label: 'Live Telemetry',       cls: 'bg-blue-50   border-blue-200   text-blue-700'   },
  { icon: '🚨', label: 'Theft Detection',      cls: 'bg-red-50    border-red-200    text-red-700'    },
  { icon: '📍', label: 'Geofence Alerts',      cls: 'bg-purple-50 border-purple-200 text-purple-700' },
  { icon: '🔒', label: 'QR Delivery Lock',     cls: 'bg-teal-50   border-teal-200   text-teal-700'   },
  { icon: '📊', label: 'Compartment Tracking', cls: 'bg-cyan-50   border-cyan-200   text-cyan-700'   },
  { icon: '🗺️', label: 'Route Monitoring',     cls: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
];

export default function Home() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 flex flex-col">

      {/* Header */}
      <header className="border-b border-slate-200/70 bg-white/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <OomcoLogo className="w-13 h-8 shrink-0" />
          </div>
          <span className="hidden md:inline text-blue-600 text-[11px] font-bold uppercase tracking-widest">
            Fuel Ordering &amp; Monitoring Platform
          </span>
          <AnptcoLogo className="w-7 h-9 shrink-0" />
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 gap-10">

        {/* Hero */}
        <section className="text-center max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-black leading-tight tracking-tight text-slate-900 mb-3">
            Detect. Monitor.
            <span className="block bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600">
              Prevent Fuel Theft.
            </span>
          </h1>
          <p className="text-slate-500 text-base max-w-xl mx-auto mb-6">
            Real-time IoT tracking · Geofenced delivery · QR-secured offloading
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {FEATURES.map(f => (
              <span key={f.label} className={`inline-flex items-center gap-1.5 border rounded-full px-3 py-1 text-xs font-semibold bg-white/80 ${f.cls}`}>
                <span className="text-sm leading-none">{f.icon}</span>
                {f.label}
              </span>
            ))}
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => router.push('/auth/login')}
              className="px-8 py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
            >
              Sign In
            </button>
            <button
              onClick={() => router.push('/auth/signup/client')}
              className="px-8 py-3 rounded-xl border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-white hover:border-blue-300 hover:text-blue-700 transition-colors"
            >
              Create Account
            </button>
          </div>
        </section>

        {/* Role cards */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-3xl">
          {[
            { icon: '🏪', role: 'Client',      desc: 'Place fuel orders and track deliveries in real time',         color: 'border-emerald-200 bg-emerald-50/60 text-emerald-700' },
            { icon: '🏢', role: 'Seller',      desc: 'Manage inventory, accept orders and oversee your fleet',      color: 'border-blue-200   bg-blue-50/60   text-blue-700'    },
            { icon: '🚛', role: 'Transporter', desc: 'Dispatch trucks, assign drivers and monitor deliveries',       color: 'border-orange-200 bg-orange-50/60 text-orange-700' },
          ].map(c => (
            <div key={c.role} className={`rounded-xl border p-5 ${c.color}`}>
              <div className="text-2xl mb-2">{c.icon}</div>
              <p className="font-bold text-sm mb-1">{c.role}</p>
              <p className="text-xs opacity-80 leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-slate-200/70 bg-white/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between py-3">
          <p className="text-[11px] text-slate-400">© {new Date().getFullYear()} OOMCO · ANPTCO</p>
          <span className="flex items-center gap-1 text-[11px] text-emerald-500 font-medium">
            <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
            All systems operational
          </span>
        </div>
      </footer>
    </div>
  );
}
