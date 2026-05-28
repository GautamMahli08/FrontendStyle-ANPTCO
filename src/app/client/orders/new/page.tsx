// src/app/client/orders/new/page.tsx
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser, getDeliveryLocations, addOrder } from '@/src/lib/demo-data';

// ── Types ─────────────────────────────────────────────────────
interface Tank {
  id: string;
  clientId: string;
  name: string;
  fuelType: string;
  capacity: number;
  currentLevel: number;
  minLevel: number;
  reorderAlert: boolean;
  lastRefilled: Date;
  createdAt: Date;
}

interface DeliveryLocation {
  id: string;
  name: string;
  address: string;
}

// ── localStorage tank reader (mirrors tanks page) ─────────────
const TANKS_KEY = 'fuelfleet_tanks';

function getTanksForClient(clientId: string): Tank[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TANKS_KEY);
    if (!raw) return [];
    return JSON.parse(raw)
      .filter((t: any) => t.clientId === clientId)
      .map((t: any) => ({
        ...t,
        lastRefilled: new Date(t.lastRefilled),
        createdAt:    new Date(t.createdAt),
        reorderAlert: t.currentLevel <= t.minLevel,
      }));
  } catch {
    return [];
  }
}

// ── Inner component ───────────────────────────────────────────
function NewOrderForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [user,       setUser]       = useState<any>(null);
  const [mounted,    setMounted]    = useState(false);
  const [tanks,      setTanks]      = useState<Tank[]>([]);
  const [locations,  setLocations]  = useState<DeliveryLocation[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);

  // Form fields
  const [selectedTankId,      setSelectedTankId]      = useState('');
  const [fuelType,             setFuelType]            = useState('DIESEL');
  const [volume,               setVolume]              = useState('');
  const [locationId,           setLocationId]          = useState('');
  const [customLocation,       setCustomLocation]      = useState('');
  const [useCustomLocation,    setUseCustomLocation]   = useState(false);
  const [notes,                setNotes]               = useState('');
  const [urgency,              setUrgency]             = useState<'NORMAL' | 'URGENT'>('NORMAL');

  // Derived
  const selectedTank    = tanks.find(t => t.id === selectedTankId) ?? null;
  const suggestedVolume = selectedTank ? selectedTank.capacity - selectedTank.currentLevel : null;
  const fillPercentage  = selectedTank ? Math.round((selectedTank.currentLevel / selectedTank.capacity) * 100) : null;

  // ── Init ──────────────────────────────────────────────────
  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== 'CLIENT') {
      router.push('/');
      return;
    }
    setUser(currentUser);

    // ── Load tanks from localStorage (live data) ──────────
    const clientTanks = getTanksForClient(currentUser.id);
    setTanks(clientTanks);

    // Load delivery locations
    const locs = getDeliveryLocations?.() ?? [];
    setLocations(locs);

    // ── Handle preFill from tanks page quick-order ────────
    const preFillParam = searchParams.get('preFill');
    if (preFillParam) {
      try {
        const pre = JSON.parse(decodeURIComponent(preFillParam));
        if (pre.fuelType) setFuelType(pre.fuelType);
        if (pre.volume)   setVolume(String(pre.volume));
        // Match by tankId first (exact), fall back to name
        if (pre.tankId) {
          const match = clientTanks.find(t => t.id === pre.tankId);
          if (match) setSelectedTankId(match.id);
        } else if (pre.tankName) {
          const match = clientTanks.find(t => t.name === pre.tankName);
          if (match) setSelectedTankId(match.id);
        }
      } catch (_) {}
    }
  }, [router, searchParams]);

  // ── Sync fuelType when tank changes ──────────────────────
  useEffect(() => {
    if (selectedTank) setFuelType(selectedTank.fuelType);
  }, [selectedTankId]);

  // ── Submit ────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!volume || parseInt(volume) <= 0) {
      alert('Please enter a valid volume.');
      return;
    }
    if (!locationId && !customLocation) {
      alert('Please select or enter a delivery location.');
      return;
    }

    setSubmitting(true);

    const destination = useCustomLocation
      ? customLocation
      : locations.find(l => l.id === locationId)?.name ?? '';

    const newOrder = {
      id:          `order-${Date.now()}`,
      clientId:    user.id,
      clientName:  user.name,
      fuelType,
      volume:      parseInt(volume),
      destination,
      status:      'PENDING',
      urgency,
      notes,
      tankId:      selectedTank?.id   ?? null,
      tankName:    selectedTank?.name ?? null,
      createdAt:   new Date(),
    };

    addOrder(newOrder);

    await new Promise(r => setTimeout(r, 700));
    setSubmitting(false);
    setSubmitted(true);
  };

  if (!mounted || !user) return null;

  // ── Success Screen ────────────────────────────────────────
  if (submitted) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar userRole={user.role} />
        <div className="flex-1">
          <Header user={user} /> 
          <main className="p-8 flex items-center justify-center min-h-[80vh]">
            <div className="bg-white rounded-2xl shadow-lg p-12 text-center max-w-md w-full">
              <div className="text-6xl mb-4">✅</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Order Placed!</h2>
              <p className="text-gray-500 mb-4">
                Your order for{' '}
                <span className="font-semibold">{parseInt(volume).toLocaleString()} L of {fuelType}</span>{' '}
                has been submitted.
              </p>
              {selectedTank && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-6">
                  <p className="text-sm text-blue-600">
                    🛢️ Filling: <span className="font-semibold">{selectedTank.name}</span>
                  </p>
                  <p className="text-xs text-blue-400 mt-0.5">
                    Tank will update once delivery is completed
                  </p>
                </div>
              )}
              {urgency === 'URGENT' && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 mb-4 text-sm text-red-600 font-semibold">
                  🚨 Marked as URGENT
                </div>
              )}
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => router.push('/client/orders')}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
                >
                  View My Orders
                </button>
                <button
                  onClick={() => router.push('/client/tanks')}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-6 py-2 rounded-lg transition-colors"
                >
                  Back to Tanks
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // ── Main Form ─────────────────────────────────────────────
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />
      <div className="flex-1">
        <Header user={user} /> 

        <main className="p-8 max-w-3xl">
          <div className="mb-8 flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="text-blue-600 hover:text-blue-800 font-medium text-sm"
            >
              ← Back
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Place Fuel Order ⛽</h1>
              <p className="text-gray-500 text-sm">Fill in the details below to request a delivery.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">

            {/* ── STEP 1: Tank Selection ── */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-1">
                🛢️ Step 1 — Select Tank{' '}
                <span className="text-gray-400 text-sm font-normal">(optional)</span>
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Link this order to one of your tanks. Fuel type and suggested volume will auto-fill.
              </p>

              {tanks.length === 0 ? (
                <div className="text-center py-6 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                  <p className="text-gray-400 text-sm mb-2">No tanks registered yet.</p>
                  <button
                    type="button"
                    onClick={() => router.push('/client/tanks')}
                    className="text-blue-600 hover:underline text-sm font-medium"
                  >
                    + Add a Tank →
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                    {tanks.map(tank => {
                      const p          = Math.round((tank.currentLevel / tank.capacity) * 100);
                      const isSelected = selectedTankId === tank.id;
                      return (
                        <button
                          key={tank.id}
                          type="button"
                          onClick={() => setSelectedTankId(prev => prev === tank.id ? '' : tank.id)}
                          className={`text-left p-4 rounded-xl border-2 transition-all ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50'
                              : tank.reorderAlert
                              ? 'border-orange-200 bg-orange-50 hover:border-orange-400'
                              : 'border-gray-200 bg-white hover:border-blue-300'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-gray-800 truncate pr-1">
                              {tank.name}
                            </span>
                            {isSelected && <span className="text-blue-600 font-bold">✓</span>}
                          </div>

                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full mb-2 inline-block ${
                            tank.fuelType === 'DIESEL'  ? 'bg-blue-100 text-blue-700'    :
                            tank.fuelType === 'PETROL'  ? 'bg-green-100 text-green-700'  :
                            tank.fuelType === 'PREMIUM' ? 'bg-purple-100 text-purple-700':
                                                          'bg-gray-100 text-gray-600'
                          }`}>
                            {tank.fuelType}
                          </span>

                          <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1">
                            <div
                              className={`h-1.5 rounded-full ${
                                tank.reorderAlert ? 'bg-red-500' : p < 50 ? 'bg-yellow-400' : 'bg-green-500'
                              }`}
                              style={{ width: `${p}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500">
                            {tank.currentLevel.toLocaleString()} / {tank.capacity.toLocaleString()} L ({p}%)
                          </p>
                          {tank.reorderAlert && (
                            <p className="text-xs text-orange-600 font-semibold mt-1">⚠️ Low Stock</p>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Selected tank banner */}
                  {selectedTank && (
                    <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-blue-800">
                          🛢️ Ordering for: {selectedTank.name}
                        </p>
                        <p className="text-xs text-blue-600 mt-0.5">
                          Current: {selectedTank.currentLevel.toLocaleString()} L &nbsp;|&nbsp;
                          Capacity: {selectedTank.capacity.toLocaleString()} L &nbsp;|&nbsp;
                          Fill: {fillPercentage}%
                        </p>
                      </div>
                      {suggestedVolume && suggestedVolume > 0 && (
                        <button
                          type="button"
                          onClick={() => setVolume(String(suggestedVolume))}
                          className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap ml-4"
                        >
                          Use {suggestedVolume.toLocaleString()} L
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── STEP 2: Fuel Details ── */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">⛽ Step 2 — Fuel Details</h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fuel Type</label>
                  <select
                    value={fuelType}
                    onChange={e => setFuelType(e.target.value)}
                    disabled={!!selectedTank}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500"
                  >
                    <option value="DIESEL">Diesel</option>
                    <option value="PETROL">Petrol</option>
                    <option value="PREMIUM">Premium</option>
                  </select>
                  {selectedTank && (
                    <p className="text-xs text-gray-400 mt-1">Auto-set from selected tank</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Volume (Litres)</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={volume}
                      onChange={e => setVolume(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none pr-28"
                      placeholder="e.g. 5000"
                      min={1}
                      required
                    />
                    {suggestedVolume && suggestedVolume > 0 && volume !== String(suggestedVolume) && (
                      <button
                        type="button"
                        onClick={() => setVolume(String(suggestedVolume))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-600 hover:underline whitespace-nowrap"
                      >
                        Use {suggestedVolume.toLocaleString()} L
                      </button>
                    )}
                  </div>
                  {selectedTank && suggestedVolume && suggestedVolume > 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      Suggested: {suggestedVolume.toLocaleString()} L to fill tank
                    </p>
                  )}
                  {selectedTank && suggestedVolume !== null && suggestedVolume <= 0 && (
                    <p className="text-xs text-green-600 mt-1">✅ Tank is already full</p>
                  )}
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Urgency</label>
                  <div className="flex gap-3">
                    {(['NORMAL', 'URGENT'] as const).map(u => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setUrgency(u)}
                        className={`flex-1 py-2.5 rounded-lg border-2 font-semibold text-sm transition-all ${
                          urgency === u
                            ? u === 'URGENT'
                              ? 'border-red-500 bg-red-50 text-red-700'
                              : 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        {u === 'URGENT' ? '🚨 Urgent' : '📅 Normal'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── STEP 3: Delivery Location ── */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">📍 Step 3 — Delivery Location</h2>

              {!useCustomLocation && locations.length > 0 && (
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select Location</label>
                  <select
                    value={locationId}
                    onChange={e => setLocationId(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    required={!useCustomLocation}
                  >
                    <option value="">-- Choose a delivery point --</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} — {loc.address}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(useCustomLocation || locations.length === 0) && (
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {locations.length === 0 ? 'Delivery Location' : 'Custom Location'}
                  </label>
                  <input
                    value={customLocation}
                    onChange={e => setCustomLocation(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Enter address or location name"
                    required={useCustomLocation || locations.length === 0}
                  />
                </div>
              )}

              {locations.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setUseCustomLocation(p => !p);
                    setLocationId('');
                    setCustomLocation('');
                  }}
                  className="text-sm text-blue-600 hover:underline"
                >
                  {useCustomLocation ? '← Use saved location' : '+ Enter custom location'}
                </button>
              )}
            </div>

            {/* ── STEP 4: Notes ── */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-3">📝 Step 4 — Notes (Optional)</h2>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                placeholder="Any special instructions for the driver or seller..."
              />
            </div>

            {/* ── Order Summary ── */}
            <div className="bg-gray-900 text-white rounded-2xl p-6 shadow-xl">
              <h2 className="text-lg font-bold mb-4">🧾 Order Summary</h2>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Tank</span>
                  {selectedTank
                    ? <span className="font-semibold text-blue-300">🛢️ {selectedTank.name}</span>
                    : <span className="text-gray-500 italic">Not linked</span>
                  }
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Fuel Type</span>
                  <span className="font-semibold">{fuelType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Volume</span>
                  <span className="font-semibold">
                    {volume ? `${parseInt(volume).toLocaleString()} L` : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Destination</span>
                  <span className="font-semibold truncate max-w-[200px] text-right">
                    {useCustomLocation
                      ? customLocation || '—'
                      : locations.find(l => l.id === locationId)?.name || '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Urgency</span>
                  <span className={`font-semibold ${urgency === 'URGENT' ? 'text-red-400' : 'text-green-400'}`}>
                    {urgency === 'URGENT' ? '🚨 Urgent' : '📅 Normal'}
                  </span>
                </div>
                {notes && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Notes</span>
                    <span className="font-medium text-gray-300 truncate max-w-[200px] text-right">{notes}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-700 mt-4 pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-3.5 rounded-xl transition-colors text-base"
                >
                  {submitting ? '⏳ Placing Order...' : '🚀 Place Order'}
                </button>
              </div>
            </div>

          </form>
        </main>
      </div>
    </div>
  );
}

// ── Page export (Suspense required for useSearchParams) ───────
export default function NewOrderPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-4xl mb-3">⛽</div>
          <p className="text-gray-500">Loading order form...</p>
        </div>
      </div>
    }>
      <NewOrderForm />
    </Suspense>
  );
}
