'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import { getCurrentUser, addOrder, addNotification, DELIVERY_ZONES } from '@/src/lib/demo-data';
import { logDemoEvent } from '@/src/app/client/dashboard/page';

const FUEL_TYPES = [
  {
    key: 'DIESEL',
    label: 'Diesel',
    desc: 'Standard diesel fuel for heavy vehicles',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    activeBorder: 'border-blue-500',
    activeBg: 'bg-blue-50',
    presets: [1000, 3000, 5000, 10000],
    svg: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="6" rx="8" ry="3" />
        <path d="M4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
        <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
      </svg>
    ),
  },
  {
    key: 'PETROL',
    label: 'Petrol',
    desc: 'Regular unleaded petrol',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
    activeBorder: 'border-orange-500',
    activeBg: 'bg-orange-50',
    presets: [500, 1000, 2000, 5000],
    svg: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <path d="M12 2C9.5 6.5 7 9.5 7 13.5a5 5 0 0010 0C17 9.5 14.5 6.5 12 2zm0 15.5a3 3 0 01-3-3c0-1.8 1.2-3.5 3-5.5 1.8 2 3 3.7 3 5.5a3 3 0 01-3 3z" />
      </svg>
    ),
  },
  {
    key: 'PREMIUM',
    label: 'Premium',
    desc: 'High-octane premium petrol',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
    activeBorder: 'border-purple-500',
    activeBg: 'bg-purple-50',
    presets: [500, 1000, 2000, 3000],
    svg: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
      </svg>
    ),
  },
];

type FuelSelection = { volume: number; custom: string; useCustom: boolean };

export default function NewOrderPage() {
  const router = useRouter();
  const [user,    setUser]    = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [step,    setStep]    = useState<1 | 2>(1);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  // Multi-fuel selection: key → { volume, custom, useCustom }
  const [selected, setSelected] = useState<Record<string, FuelSelection>>({});
  const [locationId, setLocationId] = useState('');
  const [notes,      setNotes]      = useState('');

  useEffect(() => {
    setMounted(true);
    const u = getCurrentUser();
    if (!u || u.role !== 'CLIENT') { router.push('/'); return; }
    setUser(u);
  }, [router]);

  if (!mounted || !user) return null;

  const selectedKeys = Object.keys(selected);
  const canProceed   = selectedKeys.length > 0 && selectedKeys.every(k => {
    const s = selected[k];
    return (s.useCustom ? parseInt(s.custom) || 0 : s.volume) >= 100;
  });
  const canSubmit = canProceed && locationId;
  const location  = DELIVERY_ZONES.find(z => z.id === locationId);

  function getFinalVolume(s: FuelSelection) {
    return s.useCustom ? (parseInt(s.custom) || 0) : s.volume;
  }

  function toggleFuel(key: string) {
    setSelected(prev => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: { volume: FUEL_TYPES.find(f => f.key === key)!.presets[1], custom: '', useCustom: false } };
    });
  }

  function updateSelection(key: string, patch: Partial<FuelSelection>) {
    setSelected(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  const handleSubmit = () => {
    if (!canSubmit) return;
    setLoading(true);
    setTimeout(() => {
      const orderId   = `order-${Date.now()}`;
      const fuelItems = selectedKeys.map(k => ({ fuelType: k, volume: getFinalVolume(selected[k]) }));
      const isMixed   = fuelItems.length > 1;

      logDemoEvent(user.id, 'ORDER_PLACED',
        `${fuelItems.map(f => `${f.volume}L ${f.fuelType}`).join(' + ')} → ${location!.name} | orderId=${orderId}`
      );

      addOrder({
        id:                 orderId,
        clientId:           user.id,
        clientName:         user.companyName ?? `${user.firstName} ${user.lastName}`,
        workspaceId:        'ws-anptco',
        fuelType:           isMixed ? 'MIXED' : fuelItems[0].fuelType as any,
        volume:             totalLitres,
        fuelItems:          fuelItems as any,
        status:             'PLACED',
        destination:        location!.id,
        destinationName:    location!.name,
        destinationAddress: location!.address,
        destinationLat:     location!.lat,
        destinationLng:     location!.lng,
        notes:              notes || undefined,
        createdAt:          new Date(),
      });

      const summary = fuelItems.map(f => `${f.volume.toLocaleString()}L ${f.fuelType}`).join(' + ');
      addNotification({
        id:        `notif-${Date.now()}`,
        userId:    'seller-001',
        type:      'ORDER_PLACED',
        title:     `📦 New Order — ${user.companyName ?? user.firstName}`,
        message:   `${summary} → ${location!.name}`,
        read:      false,
        createdAt: new Date(),
      });

      setLoading(false);
      setSuccess(true);
    }, 700);
  };

  const totalLitres = selectedKeys.reduce((sum, k) => sum + getFinalVolume(selected[k]), 0);

  // ── Success ───────────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar userRole={user.role} />
        <div className="flex-1 min-w-0">
          <Header user={user} />
          <main className="p-6 flex items-center justify-center min-h-[70vh]">
            <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center max-w-md w-full shadow-lg">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center text-4xl mx-auto mb-5">✅</div>
              <h2 className="text-2xl font-black text-gray-900 mb-2">Order Placed!</h2>
              <div className="space-y-1 mb-2">
                {selectedKeys.map(k => (
                  <p key={k} className="text-gray-600 text-sm">
                    {getFinalVolume(selected[k]).toLocaleString()}L {k}
                  </p>
                ))}
                <p className="text-gray-500 text-xs mt-1">→ {location?.name}</p>
              </div>
              <p className="text-gray-400 text-xs mb-8">Seller has been notified. Track status in My Orders.</p>
              <div className="flex gap-3">
                <button onClick={() => router.push('/client/orders')} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition text-sm">
                  Track Orders
                </button>
                <button
                  onClick={() => { setSuccess(false); setStep(1); setSelected({}); setLocationId(''); setNotes(''); }}
                  className="flex-1 border border-gray-200 text-gray-700 font-medium py-3 rounded-xl hover:bg-gray-50 transition text-sm"
                >
                  New Order
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar userRole={user.role} />
      <div className="flex-1 min-w-0">
        <Header user={user} />
        <main className="p-6">
          <div className="max-w-2xl mx-auto">

            {/* Step indicator */}
            <div className="flex items-center gap-0 mb-8">
              {(['Fuel & Volume', 'Delivery Location'] as const).map((label, i) => {
                const n = (i + 1) as 1 | 2;
                const done = step > n;
                const cur  = step === n;
                return (
                  <div key={label} className="flex items-center flex-1">
                    <div className="flex flex-col items-center">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm transition-all ${
                        done ? 'bg-emerald-500 text-white' : cur ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-gray-200 text-gray-400'
                      }`}>
                        {done ? '✓' : n}
                      </div>
                      <p className={`text-xs mt-1 font-medium ${cur ? 'text-blue-600' : done ? 'text-emerald-600' : 'text-gray-400'}`}>{label}</p>
                    </div>
                    {i < 1 && <div className={`flex-1 h-0.5 mx-2 -mt-5 ${done ? 'bg-emerald-400' : 'bg-gray-200'}`} />}
                  </div>
                );
              })}
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-7 shadow-sm">

              {/* ── STEP 1: Fuel & Volume ── */}
              {step === 1 && (
                <div>
                  <h2 className="text-xl font-black text-gray-900 mb-1">Select Fuel & Quantities</h2>
                  <p className="text-sm text-gray-500 mb-6">Choose one or more fuel types. Set the volume for each.</p>

                  <div className="space-y-3 mb-6">
                    {FUEL_TYPES.map(f => {
                      const sel = selected[f.key];
                      const isSelected = !!sel;
                      return (
                        <div
                          key={f.key}
                          className={`border-2 rounded-2xl transition-all overflow-hidden ${
                            isSelected ? `${f.activeBorder} ${f.activeBg}` : 'border-gray-200 bg-white'
                          }`}
                        >
                          {/* Fuel type header — click to toggle */}
                          <button
                            onClick={() => toggleFuel(f.key)}
                            className="w-full flex items-center gap-4 p-4 text-left"
                          >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${f.iconBg} ${f.iconColor}`}>
                              {f.svg}
                            </div>
                            <div className="flex-1">
                              <p className={`font-bold ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>{f.label}</p>
                              <p className="text-xs text-gray-400">{f.desc}</p>
                            </div>
                            {/* Checkbox */}
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                              isSelected ? `${f.activeBorder} bg-white` : 'border-gray-300'
                            }`}>
                              {isSelected && (
                                <svg className={`w-3.5 h-3.5 ${f.iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                          </button>

                          {/* Volume selector — only when selected */}
                          {isSelected && (
                            <div className="px-4 pb-4 pt-0 border-t border-gray-100/80">
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2.5 mt-3">Volume</p>
                              <div className="flex flex-wrap gap-2 mb-3">
                                {f.presets.map(v => (
                                  <button
                                    key={v}
                                    onClick={() => updateSelection(f.key, { volume: v, useCustom: false })}
                                    className={`px-3 py-1.5 rounded-lg border text-sm font-semibold transition-all ${
                                      !sel.useCustom && sel.volume === v
                                        ? `${f.activeBorder} bg-white ${f.iconColor}`
                                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                                    }`}
                                  >
                                    {v.toLocaleString()}L
                                  </button>
                                ))}
                                {/* Custom input */}
                                <div className="relative">
                                  <input
                                    type="number"
                                    min={100}
                                    max={50000}
                                    value={sel.custom}
                                    onClick={e => e.stopPropagation()}
                                    onChange={e => updateSelection(f.key, { custom: e.target.value, useCustom: true })}
                                    placeholder="Custom"
                                    className={`w-24 px-2.5 py-1.5 rounded-lg border text-sm font-semibold focus:outline-none transition ${
                                      sel.useCustom ? `${f.activeBorder} ${f.activeBg}` : 'border-gray-200 focus:border-gray-400'
                                    }`}
                                  />
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">L</span>
                                </div>
                              </div>
                              {/* Confirmed volume display */}
                              <p className={`text-xs font-bold ${f.iconColor}`}>
                                {getFinalVolume(sel).toLocaleString()}L {f.label} selected
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Summary pill */}
                  {selectedKeys.length > 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-5 flex items-center justify-between">
                      <div className="flex flex-wrap gap-2">
                        {selectedKeys.map(k => {
                          const f = FUEL_TYPES.find(f => f.key === k)!;
                          return (
                            <span key={k} className={`text-xs font-bold px-2.5 py-1 rounded-full ${f.iconBg} ${f.iconColor}`}>
                              {getFinalVolume(selected[k]).toLocaleString()}L {f.label}
                            </span>
                          );
                        })}
                      </div>
                      <span className="text-xs text-gray-500 font-semibold ml-3 flex-shrink-0">
                        {totalLitres.toLocaleString()}L total
                      </span>
                    </div>
                  )}

                  <button
                    onClick={() => setStep(2)}
                    disabled={!canProceed}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-3.5 rounded-xl transition text-sm"
                  >
                    Continue →
                  </button>
                </div>
              )}

              {/* ── STEP 2: Location + Confirm ── */}
              {step === 2 && (
                <div>
                  <h2 className="text-xl font-black text-gray-900 mb-1">Delivery Location</h2>
                  <p className="text-sm text-gray-500 mb-6">Where should we deliver to?</p>

                  <div className="space-y-2 mb-5">
                    {DELIVERY_ZONES.map(zone => (
                      <button
                        key={zone.id}
                        onClick={() => setLocationId(zone.id)}
                        className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                          locationId === zone.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <span className="text-2xl flex-shrink-0">⛽</span>
                        <div className="flex-1 min-w-0">
                          <p className={`font-bold text-sm ${locationId === zone.id ? 'text-blue-800' : 'text-gray-900'}`}>{zone.name}</p>
                          <p className="text-xs text-gray-500 truncate">{zone.address}</p>
                        </div>
                        {locationId === zone.id && (
                          <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="mb-5">
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-2">Notes (optional)</label>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Any special instructions for the driver…"
                      rows={2}
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-blue-500 focus:outline-none transition resize-none"
                    />
                  </div>

                  {/* Order summary */}
                  {canSubmit && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-5">
                      <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-3">Order Summary</p>
                      <div className="space-y-1.5 mb-3">
                        {selectedKeys.map(k => {
                          const f = FUEL_TYPES.find(f => f.key === k)!;
                          return (
                            <div key={k} className="flex items-center justify-between text-sm">
                              <div className={`flex items-center gap-1.5 ${f.iconColor}`}>
                                <div className={`w-5 h-5 rounded-md flex items-center justify-center ${f.iconBg}`}>{f.svg}</div>
                                <span className="font-semibold text-gray-700">{f.label}</span>
                              </div>
                              <span className="font-bold text-gray-900">{getFinalVolume(selected[k]).toLocaleString()}L</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="border-t border-emerald-200 pt-2.5 flex items-center justify-between text-sm">
                        <span className="text-emerald-700 font-semibold">📍 {location?.name}</span>
                        <span className="font-black text-gray-900">{totalLitres.toLocaleString()}L total</span>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button onClick={() => setStep(1)} className="flex-1 border border-gray-200 text-gray-700 font-medium py-3 rounded-xl hover:bg-gray-50 transition text-sm">
                      ← Back
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={!canSubmit || loading}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black py-3 rounded-xl transition text-sm flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Placing…</>
                      ) : '✅ Place Order'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
