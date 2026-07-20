'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api, type ApiTruck } from '@/src/lib/api';

type GeoState  = 'idle' | 'locating' | 'done' | 'error';
type FuelEntry = { c: [string, string, string, string] };

export default function TransportTrucksPage() {
  const router = useRouter();
  const user = getCurrentUser();
  const [trucks,      setTrucks]      = useState<ApiTruck[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [qrMap,       setQrMap]       = useState<Record<string, string>>({});
  const [qrLoading,   setQrLoading]   = useState<Record<string, boolean>>({});
  const [geoState,    setGeoState]    = useState<Record<string, GeoState>>({});
  const [geoMsg,      setGeoMsg]      = useState<Record<string, string>>({});
  const [fuelEntry,   setFuelEntry]   = useState<Record<string, FuelEntry>>({});
  const [fuelSaving,  setFuelSaving]  = useState<Record<string, boolean>>({});
  const [fuelMsg,     setFuelMsg]     = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setTrucks((await api.trucks.list()) ?? []);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load trucks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) { router.replace('/auth/login'); return; }
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load, router, user]);

  const showQR = async (truck: ApiTruck) => {
    if (qrMap[truck.id]) {
      setQrMap(m => { const next = { ...m }; delete next[truck.id]; return next; });
      return;
    }
    setQrLoading(m => ({ ...m, [truck.id]: true }));
    try {
      const { qr_url } = await api.trucks.getQR(truck.id);
      setQrMap(m => ({ ...m, [truck.id]: qr_url }));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load QR code');
    } finally {
      setQrLoading(m => ({ ...m, [truck.id]: false }));
    }
  };

  const captureLocation = (truck: ApiTruck) => {
    if (!navigator.geolocation) {
      setGeoState(s => ({ ...s, [truck.id]: 'error' }));
      setGeoMsg(m => ({ ...m, [truck.id]: 'Geolocation not supported by this browser.' }));
      return;
    }
    setGeoState(s => ({ ...s, [truck.id]: 'locating' }));
    setGeoMsg(m => ({ ...m, [truck.id]: 'Getting location…' }));
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude, longitude } = pos.coords;
        try {
          await api.trucks.seedPosition(truck.id, latitude, longitude);
          setGeoState(s => ({ ...s, [truck.id]: 'done' }));
          setGeoMsg(m => ({ ...m, [truck.id]: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` }));
          load();
        } catch (e: any) {
          setGeoState(s => ({ ...s, [truck.id]: 'error' }));
          setGeoMsg(m => ({ ...m, [truck.id]: e.message ?? 'Failed to save location' }));
        }
      },
      err => {
        setGeoState(s => ({ ...s, [truck.id]: 'error' }));
        setGeoMsg(m => ({ ...m, [truck.id]: err.message ?? 'Location access denied' }));
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  };

  const openFuelForm = (truckId: string) => {
    const existing = trucks.find(t => t.id === truckId);
    setFuelEntry(m => ({
      ...m,
      [truckId]: {
        c: [
          String(existing?.compartment_fuel?.['1'] ?? ''),
          String(existing?.compartment_fuel?.['2'] ?? ''),
          String(existing?.compartment_fuel?.['3'] ?? ''),
          String(existing?.compartment_fuel?.['4'] ?? ''),
        ] as [string, string, string, string],
      },
    }));
  };

  const saveFuel = async (truckId: string) => {
    const entry = fuelEntry[truckId];
    if (!entry) return;
    const compartmentFuel: Record<string, number> = {};
    entry.c.forEach((v, i) => {
      const n = parseFloat(v);
      if (!isNaN(n) && n >= 0) compartmentFuel[String(i + 1)] = n;
    });
    setFuelSaving(m => ({ ...m, [truckId]: true }));
    setFuelMsg(m => ({ ...m, [truckId]: '' }));
    try {
      await api.trucks.setFuel(truckId, compartmentFuel);
      setFuelEntry(m => { const next = { ...m }; delete next[truckId]; return next; });
      setFuelMsg(m => ({ ...m, [truckId]: '✓ Saved' }));
      await load();
    } catch (e: any) {
      setFuelMsg(m => ({ ...m, [truckId]: `✗ ${e.message ?? 'Failed'}` }));
    } finally {
      setFuelSaving(m => ({ ...m, [truckId]: false }));
    }
  };

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="TRANSPORT_ADMIN" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Fleet" user={user} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-gray-500">{trucks.length} truck{trucks.length !== 1 ? 's' : ''} in fleet</p>
            <button
              onClick={() => router.push('/transport/trucks/register')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
            >
              + Register Truck
            </button>
          </div>

          {loading && <p className="text-gray-500">Loading...</p>}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {!loading && !error && (
            trucks.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <p className="text-gray-500 mb-4">No trucks registered yet.</p>
                <button
                  onClick={() => router.push('/transport/trucks/register')}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
                >
                  Register your first truck
                </button>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {trucks.map((truck) => (
                  <div key={truck.id} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">

                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs text-slate-400 mb-0.5">Device ID</p>
                        <h3 className="font-bold text-gray-900 font-mono text-sm">{truck.device_id}</h3>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        truck.status === 'IDLE'     ? 'bg-green-100 text-green-700' :
                        truck.status === 'EN_ROUTE' ? 'bg-blue-100 text-blue-700'  :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {truck.status}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 font-mono break-all">ID: {truck.id}</p>

                    {/* Location status */}
                    {truck.latitude != null ? (
                      <div className="flex items-center gap-1.5 text-[11px] text-teal-700 bg-teal-50 rounded-lg px-2.5 py-1.5">
                        <span>📍</span>
                        <span className="font-mono">{truck.latitude.toFixed(5)}, {truck.longitude!.toFixed(5)}</span>
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 bg-slate-50 rounded-lg px-2.5 py-1.5">
                        No location yet
                      </div>
                    )}

                    {/* Compartment fuel — vertical bars, 9100 L capacity each */}
                    {(() => {
                      const CAP = 9100;
                      const totalLoaded = [1,2,3,4].reduce((s,i) => s + (truck.compartment_fuel?.[String(i)] ?? 0), 0);
                      const colors = ['bg-blue-500','bg-cyan-400','bg-teal-500','bg-sky-500'];
                      const rings  = ['ring-blue-300','ring-cyan-300','ring-teal-300','ring-sky-300'];
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Fuel Compartments</p>
                            {!fuelEntry[truck.id] && (
                              <button onClick={() => openFuelForm(truck.id)} className="text-[10px] text-blue-600 hover:underline font-medium">Update</button>
                            )}
                          </div>

                          {fuelEntry[truck.id] ? (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                              <div className="grid grid-cols-4 gap-1.5">
                                {(['C1','C2','C3','C4'] as const).map((label, i) => (
                                  <div key={label} className="space-y-0.5">
                                    <label className="text-[9px] font-semibold text-slate-500 uppercase">{label}</label>
                                    <input
                                      type="number" min="0" max={CAP} step="100" placeholder="0"
                                      value={fuelEntry[truck.id].c[i]}
                                      onChange={e => {
                                        const next: [string,string,string,string] = [...fuelEntry[truck.id].c] as [string,string,string,string];
                                        next[i] = e.target.value;
                                        setFuelEntry(m => ({ ...m, [truck.id]: { c: next } }));
                                      }}
                                      className="w-full text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                    />
                                  </div>
                                ))}
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-500">
                                  Total: <strong>{fuelEntry[truck.id].c.reduce((s,v) => s + (parseFloat(v)||0), 0).toLocaleString()} L</strong>
                                  <span className="text-slate-400"> / {(CAP*4).toLocaleString()} L</span>
                                </span>
                                <div className="flex gap-1.5">
                                  <button onClick={() => setFuelEntry(m => { const n={...m}; delete n[truck.id]; return n; })} className="text-[10px] px-2 py-1 rounded border border-slate-200 text-slate-500 hover:bg-slate-50">Cancel</button>
                                  <button onClick={() => saveFuel(truck.id)} disabled={fuelSaving[truck.id]} className="text-[10px] font-semibold px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                                    {fuelSaving[truck.id] ? 'Saving…' : 'Save'}
                                  </button>
                                </div>
                              </div>
                              {fuelMsg[truck.id] && <p className={`text-[10px] ${fuelMsg[truck.id].startsWith('✓') ? 'text-teal-600' : 'text-red-500'}`}>{fuelMsg[truck.id]}</p>}
                            </div>
                          ) : (
                            <>
                              {/* Vertical bars */}
                              <div className="flex gap-2">
                                {[1,2,3,4].map(i => {
                                  const liters = truck.compartment_fuel?.[String(i)] ?? 0;
                                  const pct    = Math.min(100, (liters / CAP) * 100);
                                  const isEmpty = liters === 0;
                                  return (
                                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                      <span className="text-[9px] font-bold text-slate-500">C{i}</span>
                                      <div className={`relative w-full rounded-md overflow-hidden ring-1 ${rings[i-1]} bg-slate-100`} style={{height: 80}}>
                                        <div
                                          className={`absolute bottom-0 w-full transition-all duration-700 ${isEmpty ? 'bg-slate-200' : colors[i-1]}`}
                                          style={{height: `${Math.max(pct, isEmpty ? 100 : 2)}%`, opacity: isEmpty ? 0.4 : 1}}
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                          <span className={`text-[10px] font-bold drop-shadow-sm ${isEmpty ? 'text-slate-400' : 'text-white'}`}>
                                            {isEmpty ? '—' : pct < 1 ? `${pct.toFixed(1)}%` : `${pct.toFixed(0)}%`}
                                          </span>
                                        </div>
                                      </div>
                                      <span className="text-[9px] font-semibold text-slate-700 font-mono">{liters.toLocaleString()} L</span>
                                      <span className="text-[8px] text-slate-400">/ {CAP.toLocaleString()} L</span>
                                    </div>
                                  );
                                })}
                              </div>
                              {/* Summary row */}
                              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                                <span className="text-[10px] text-slate-500">Total loaded</span>
                                <span className="text-[10px] font-bold text-slate-700">
                                  {totalLoaded.toLocaleString()} L
                                  <span className="font-normal text-slate-400"> / {(CAP*4).toLocaleString()} L</span>
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}

                    {/* Capture Location */}
                    <button
                      onClick={() => captureLocation(truck)}
                      disabled={geoState[truck.id] === 'locating'}
                      className={`w-full text-xs font-semibold py-2 rounded-lg border transition-colors disabled:opacity-50 ${
                        geoState[truck.id] === 'done'    ? 'border-teal-300 bg-teal-50 text-teal-700' :
                        geoState[truck.id] === 'error'   ? 'border-red-300 bg-red-50 text-red-600'    :
                        'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {geoState[truck.id] === 'locating' ? '⏳ Locating…'           :
                       geoState[truck.id] === 'done'     ? `✓ ${geoMsg[truck.id]}` :
                       geoState[truck.id] === 'error'    ? `✗ ${geoMsg[truck.id]}` :
                       '📍 Capture Current Location'}
                    </button>

                    {/* QR */}
                    <button
                      onClick={() => showQR(truck)}
                      disabled={qrLoading[truck.id]}
                      className="w-full text-xs font-semibold py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {qrLoading[truck.id] ? 'Loading QR…' : qrMap[truck.id] ? 'Hide QR' : 'Show QR Code'}
                    </button>

                    {qrMap[truck.id] && (
                      <div className="text-center space-y-2">
                        <img
                          src={qrMap[truck.id]}
                          alt={`QR code for truck ${truck.device_id}`}
                          className="w-40 h-40 mx-auto border border-slate-200 rounded-lg"
                        />
                        <p className="text-[10px] text-slate-400">Show this QR to the client at delivery</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </main>
      </div>
    </div>
  );
}
