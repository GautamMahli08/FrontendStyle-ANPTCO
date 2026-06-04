'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import {
  getCurrentUser, addOrder, addNotification, DELIVERY_ZONES, checkOrderFitsStation,
  COMPARTMENT_CAPACITY, MAX_ORDER_COMPARTMENTS,
} from '@/src/lib/demo-data';
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
    svg: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
      </svg>
    ),
  },
];

export default function NewOrderPage() {
  const router = useRouter();
  const [user,    setUser]    = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [step,    setStep]    = useState<1 | 2>(1);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  // Compartment-based selection: fuel key → number of full 9,100 L compartments.
  // Fuel is ordered in whole compartments only — no partial volumes.
  const [counts,     setCounts]     = useState<Record<string, number>>({});
  const [locationId, setLocationId] = useState('');
  const [notes,      setNotes]      = useState('');

  useEffect(() => {
    setMounted(true);
    const u = getCurrentUser();
    if (!u || u.role !== 'CLIENT') { router.push('/'); return; }
    setUser(u);
  }, [router]);

  if (!mounted || !user) return null;

  const selectedKeys      = Object.keys(counts).filter(k => counts[k] > 0);
  const totalCompartments = selectedKeys.reduce((sum, k) => sum + counts[k], 0);
  const totalLitres       = totalCompartments * COMPARTMENT_CAPACITY;
  const atMax             = totalCompartments >= MAX_ORDER_COMPARTMENTS;
  const canProceed        = totalCompartments >= 1;
  const location          = DELIVERY_ZONES.find(z => z.id === locationId);

  // Station capacity check — block ordering more than the station can still hold.
  const orderFuelItems = selectedKeys.map(k => ({ fuelType: k, volume: counts[k] * COMPARTMENT_CAPACITY }));
  const stationCheck   = locationId ? checkOrderFitsStation(locationId, orderFuelItems) : { ok: true, exceeded: [] };
  const canSubmit      = canProceed && !!locationId && stationCheck.ok;

  function toggleFuel(key: string) {
    setCounts(prev => {
      if (prev[key] > 0) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      if (totalCompartments >= MAX_ORDER_COMPARTMENTS) return prev; // truck is already full
      return { ...prev, [key]: 1 };
    });
  }

  // Book exactly `n` compartments for a fuel (0 removes it). The 4 compartments
  // are a shared pool, so a selection that would push the order over the limit
  // is ignored (those blocks are rendered non-selectable anyway).
  function setFuelCompartments(key: string, n: number) {
    setCounts(prev => {
      if (n <= 0) {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      }
      const others = Object.entries(prev).reduce((s, [k, v]) => k === key ? s : s + v, 0);
      if (others + n > MAX_ORDER_COMPARTMENTS) return prev;
      return { ...prev, [key]: n };
    });
  }

  const handleSubmit = () => {
    if (!canSubmit) return;
    setLoading(true);
    setTimeout(() => {
      const orderId   = `order-${Date.now()}`;
      const fuelItems = selectedKeys.map(k => ({ fuelType: k, volume: counts[k] * COMPARTMENT_CAPACITY }));
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
                    {counts[k]} × compartment · {(counts[k] * COMPARTMENT_CAPACITY).toLocaleString()}L {k}
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
                  onClick={() => { setSuccess(false); setStep(1); setCounts({}); setLocationId(''); setNotes(''); }}
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
              {(['Fuel & Compartments', 'Delivery Location'] as const).map((label, i) => {
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

              {/* ── STEP 1: Fuel & Compartments ── */}
              {step === 1 && (
                <div>
                  <h2 className="text-xl font-black text-gray-900 mb-6">Select Fuel & Quantities</h2>

                  <div className="space-y-3 mb-6">
                    {FUEL_TYPES.map(f => {
                      const count      = counts[f.key] ?? 0;
                      const isSelected = count > 0;
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
                            disabled={!isSelected && atMax}
                            className="w-full flex items-center gap-4 p-4 text-left disabled:opacity-50 disabled:cursor-not-allowed"
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

                          {/* Compartment cards — fill progressively, drawn from the shared pool of 4 */}
                          {isSelected && (
                            <div className="px-4 pb-4 pt-0 border-t border-gray-100/80">
                              <div className="flex items-center justify-between mb-2.5 mt-3">
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Volume</p>
                                <p className={`text-xs font-bold ${f.iconColor}`}>{(count * COMPARTMENT_CAPACITY).toLocaleString()}L</p>
                              </div>
                              <div className="grid grid-cols-4 gap-2">
                                {Array.from({ length: MAX_ORDER_COMPARTMENTS }, (_, i) => {
                                  const filled       = i < count;
                                  const othersBooked = totalCompartments - count;
                                  const disabled     = !filled && othersBooked + (i + 1) > MAX_ORDER_COMPARTMENTS;
                                  return (
                                    <button
                                      key={i}
                                      onClick={() => setFuelCompartments(f.key, count === i + 1 ? i : i + 1)}
                                      disabled={disabled}
                                      className={`relative rounded-xl border-2 py-3 flex flex-col items-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                                        filled ? `${f.activeBorder} ${f.activeBg}` : 'border-gray-200 bg-white hover:border-gray-300'
                                      }`}
                                    >
                                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${filled ? `${f.iconBg} ${f.iconColor}` : 'bg-gray-100 text-gray-300'}`}>
                                        {f.svg}
                                      </div>
                                      <span className={`text-[11px] font-bold leading-none ${filled ? f.iconColor : 'text-gray-400'}`}>
                                        {COMPARTMENT_CAPACITY.toLocaleString()}L
                                      </span>
                                      {filled && (
                                        <span className={`absolute top-1.5 right-1.5 w-4 h-4 rounded-full ${f.activeBorder} border-2 bg-white flex items-center justify-center`}>
                                          <svg className={`w-2.5 h-2.5 ${f.iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                                          </svg>
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Summary pill */}
                  {selectedKeys.length > 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-2 flex items-center justify-between">
                      <div className="flex flex-wrap gap-2">
                        {selectedKeys.map(k => {
                          const f = FUEL_TYPES.find(f => f.key === k)!;
                          return (
                            <span key={k} className={`text-xs font-bold px-2.5 py-1 rounded-full ${f.iconBg} ${f.iconColor}`}>
                              {counts[k]} × {(counts[k] * COMPARTMENT_CAPACITY).toLocaleString()}L {f.label}
                            </span>
                          );
                        })}
                      </div>
                      <span className="text-xs text-gray-500 font-semibold ml-3 flex-shrink-0">
                        {totalLitres.toLocaleString()}L total
                      </span>
                    </div>
                  )}

                  {/* Compartment usage indicator */}
                  <p className={`text-xs font-semibold mb-5 ${atMax ? 'text-amber-600' : 'text-gray-400'}`}>
                    {totalCompartments} / {MAX_ORDER_COMPARTMENTS} compartments used{atMax ? ' — truck full' : ''}
                  </p>

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

                  {/* Station capacity warning */}
                  {locationId && !stationCheck.ok && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5">
                      <p className="text-sm font-bold text-red-700 mb-2">🚫 {location?.name} can't hold this order</p>
                      <div className="space-y-1">
                        {stationCheck.exceeded.map(e => (
                          <p key={e.fuelType} className="text-xs text-red-600">
                            <span className="font-semibold">{e.fuelType}</span>: ordering {e.requested.toLocaleString()}L but only{' '}
                            {e.headroom.toLocaleString()}L of free capacity remains
                            {e.headroom === 0 ? ' (tank full)' : ''}.
                          </p>
                        ))}
                      </div>
                      <p className="text-[11px] text-red-500 mt-2">Reduce the compartments or choose another station to continue.</p>
                    </div>
                  )}

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
                                <span className="text-xs text-gray-400">({counts[k]} × {COMPARTMENT_CAPACITY.toLocaleString()}L)</span>
                              </div>
                              <span className="font-bold text-gray-900">{(counts[k] * COMPARTMENT_CAPACITY).toLocaleString()}L</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="border-t border-emerald-200 pt-2.5 flex items-center justify-between text-sm">
                        <span className="text-emerald-700 font-semibold">📍 {location?.name}</span>
                        <span className="font-black text-gray-900">{totalCompartments} compartments · {totalLitres.toLocaleString()}L</span>
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
