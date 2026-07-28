'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser, FIXED_DEPOT, getDeliveryLocations } from '@/src/lib/demo-data';
import { getWebhookOutbox, WebhookLogEntry } from '@/src/lib/webhooks';

// This screen is the literal "missing half" from the plan doc — the ERP side
// of the integration. It lets you fire the real dispatch endpoint by hand
// (proving idempotency + the edge-case table) and watch signed webhooks land
// in the mock ERP receiver, instead of only reading about the contract.

interface InboxEntry {
  receivedAt: string;
  eventId: string;
  signatureValid: boolean;
  payload: any;
}

interface Trip {
  trip_id: string;
  truck_ref: string;
  erp_dispatch_no: string;
  status: string;
  expected_volume_l: number;
  destination: { name: string };
  created_at: string;
}

const zones = getDeliveryLocations();

export default function ErpIntegrationPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  const [truckRef, setTruckRef] = useState('TRK-001');
  const [erpDispatchNo, setErpDispatchNo] = useState('ERP-1001');
  const [expectedVolume, setExpectedVolume] = useState(15000);
  const [destinationZone, setDestinationZone] = useState(zones[0]?.id ?? '');

  const [lastResponse, setLastResponse] = useState<{ status: number; body: any } | null>(null);
  const [sending, setSending] = useState(false);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [inbox, setInbox] = useState<InboxEntry[]>([]);
  const [outbox, setOutbox] = useState<WebhookLogEntry[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [tripsRes, inboxRes] = await Promise.all([
        fetch('/api/v1/trips/dispatch').then(r => r.json()),
        fetch('/api/webhooks/mock-erp').then(r => r.json()),
      ]);
      setTrips(tripsRes.trips ?? []);
      setInbox((inboxRes.inbox ?? []).slice().reverse());
    } catch {
      // best-effort polling
    }
    setOutbox(getWebhookOutbox().slice().reverse());
  }, []);

  useEffect(() => {
    setMounted(true);
    const u = getCurrentUser();
    if (!u || u.role !== 'PLATFORM_ADMIN') { router.push('/'); return; }
    setUser(u);
    refresh();
    const iv = setInterval(refresh, 3000);
    return () => clearInterval(iv);
  }, [router, refresh]);

  if (!mounted || !user) return null;

  const zone = zones.find(z => z.id === destinationZone) ?? zones[0];

  const buildPayload = () => ({
    truck_ref: truckRef,
    erp_dispatch_no: erpDispatchNo,
    expected_volume_l: Number(expectedVolume) || 0,
    product: 'diesel',
    origin: { name: FIXED_DEPOT.name, latitude: FIXED_DEPOT.lat, longitude: FIXED_DEPOT.lng },
    destination: {
      name: zone?.name ?? 'Destination',
      latitude: zone?.lat ?? 0,
      longitude: zone?.lng ?? 0,
      geofence_radius_m: zone?.radius ?? FIXED_DEPOT.geofenceRadius,
    },
    stops: [],
  });

  const sendDispatch = async () => {
    setSending(true);
    try {
      const res = await fetch('/api/v1/trips/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `${erpDispatchNo}-${Date.now()}`,
          Authorization: 'Bearer demo-tenant',
        },
        body: JSON.stringify(buildPayload()),
      });
      const body = await res.json();
      setLastResponse({ status: res.status, body });
    } catch (err) {
      setLastResponse({ status: 0, body: { error: err instanceof Error ? err.message : 'network error' } });
    } finally {
      setSending(false);
      refresh();
    }
  };

  // A trip that never got confirmed to DELIVERED/CLOSED (abandoned mid-demo,
  // browser closed, etc.) stays "open" forever and keeps 409-blocking that
  // truck from any future dispatch. This is the manual escape hatch instead
  // of editing dispatch-log.json by hand.
  const forceClose = async (tripId: string) => {
    await fetch(`/api/v1/trips/${tripId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CLOSED' }),
    });
    refresh();
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar userRole={user.role} />
      <div className="flex-1 min-w-0">
        <Header user={user} />
        <main className="p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-black text-gray-900">ERP Integration</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Dispatch API (POST /api/v1/trips/dispatch) and outbound webhooks (POST /api/webhooks/mock-erp) — the two-way boundary between your ERP and this monitoring platform.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* ── Dispatch tester ── */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
              <h2 className="font-bold text-gray-900">Dispatch payload builder</h2>
              <p className="text-xs text-gray-500 -mt-2">
                Click "Send dispatch" twice with the same <code>erp_dispatch_no</code> — the second call returns
                <code> 200 replay: true</code> with the same trip, proving idempotency instead of creating a duplicate.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <Field label="truck_ref">
                  <input value={truckRef} onChange={e => setTruckRef(e.target.value)} className="input" placeholder="TRK-001 (unknown → 404)" />
                </Field>
                <Field label="erp_dispatch_no">
                  <input value={erpDispatchNo} onChange={e => setErpDispatchNo(e.target.value)} className="input" />
                </Field>
                <Field label="expected_volume_l">
                  <input type="number" value={expectedVolume} onChange={e => setExpectedVolume(Number(e.target.value))} className="input" />
                </Field>
                <Field label="destination">
                  <select value={destinationZone} onChange={e => setDestinationZone(e.target.value)} className="input">
                    {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                  </select>
                </Field>
              </div>

              <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] overflow-x-auto max-h-40">
                {JSON.stringify(buildPayload(), null, 2)}
              </pre>

              <div className="flex gap-2">
                <button
                  onClick={sendDispatch}
                  disabled={sending}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-2.5 rounded-xl text-sm transition"
                >
                  {sending ? 'Sending…' : 'Send dispatch'}
                </button>
                <button
                  onClick={() => setTruckRef('TRK-999')}
                  className="text-xs font-semibold text-gray-600 border border-gray-200 rounded-xl px-3 hover:bg-gray-50"
                  title="Sets an unrecognized truck_ref to demonstrate the 404 edge case"
                >
                  Use unknown truck
                </button>
              </div>

              {lastResponse && (
                <div className={`rounded-lg p-3 text-xs border ${lastResponse.status < 300 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                  <p className="font-bold mb-1">HTTP {lastResponse.status}{lastResponse.body?.replay ? ' — replay (idempotent)' : ''}</p>
                  <pre className="overflow-x-auto whitespace-pre-wrap">{JSON.stringify(lastResponse.body, null, 2)}</pre>
                </div>
              )}
            </div>

            {/* ── Trips (server-side system of record) ── */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <h2 className="font-bold text-gray-900 mb-3">Dispatched trips ({trips.length})</h2>
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {trips.length === 0 && <p className="text-xs text-gray-400">No trips dispatched yet.</p>}
                {trips.slice().reverse().map(t => (
                  <div key={t.trip_id} className="border border-gray-100 rounded-lg px-3 py-2 text-xs flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-800 truncate">{t.trip_id} · {t.truck_ref}</p>
                      <p className="text-gray-400 truncate">{t.erp_dispatch_no} → {t.destination?.name} · {t.expected_volume_l.toLocaleString()}L</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-semibold text-blue-600">{t.status}</span>
                      {!['CLOSED', 'CANCELLED'].includes(t.status) && (
                        <button
                          onClick={() => forceClose(t.trip_id)}
                          title="Stuck/abandoned trip? Force it closed so this truck can be dispatched again."
                          className="text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-200 rounded px-2 py-0.5 transition"
                        >
                          Force close
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* ── Webhook inbox (receiver side) ── */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <h2 className="font-bold text-gray-900 mb-3">Mock ERP webhook inbox ({inbox.length})</h2>
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {inbox.length === 0 && <p className="text-xs text-gray-400">No webhooks received yet — trigger an arrival, theft, or delivery in Fleet Monitor.</p>}
                {inbox.map(e => (
                  <div key={e.eventId} className="border border-gray-100 rounded-lg px-3 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-gray-800">{e.payload?.event ?? '—'}</p>
                      <span className={`font-semibold ${e.signatureValid ? 'text-emerald-600' : 'text-red-600'}`}>
                        {e.signatureValid ? '✓ signature verified' : '✗ invalid signature'}
                      </span>
                    </div>
                    <p className="text-gray-400">{e.payload?.trip_id} · {new Date(e.receivedAt).toLocaleTimeString()}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Sender outbox (retry/backoff/dead-letter) ── */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <h2 className="font-bold text-gray-900 mb-3">Outbound sender log ({outbox.length})</h2>
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {outbox.length === 0 && <p className="text-xs text-gray-400">Nothing sent yet.</p>}
                {outbox.map(e => (
                  <div key={e.eventId} className="border border-gray-100 rounded-lg px-3 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-gray-800">{e.payload.event}</p>
                      <span className={`font-semibold ${
                        e.status === 'DELIVERED' ? 'text-emerald-600' : e.status === 'DEAD_LETTER' ? 'text-red-600' : 'text-amber-600'
                      }`}>{e.status}</span>
                    </div>
                    <p className="text-gray-400">{e.payload.trip_id} · {e.attempts} attempt{e.attempts === 1 ? '' : 's'}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
      <style>{`.input { border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.4rem 0.6rem; font-size: 0.8rem; width: 100%; }`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}
