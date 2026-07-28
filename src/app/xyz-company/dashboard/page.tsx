'use client';

// XYZ Petroleum — ERP Dispatch Console (demo stand-in for the external system)
//
// This page deliberately lives OUTSIDE the platform's own role/login system —
// it represents XYZ Petroleum's own ERP, a different company/system entirely
// (see xyz-petroleum-monitoring-plan.md). It only knows what an ERP would
// know: which truck, which driver, how much fuel, where to. Fill the form and
// "Send to Monitoring" does exactly what the plan's Step 3 describes — POSTs
// a real dispatch payload across the boundary — then creates the trip record
// this platform's Fleet Monitor needs to actually track it live.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getTrucks, getDrivers, getDeliveryLocations, getOrders, addOrder, updateOrder, updateTruck, addNotification,
  FIXED_DEPOT, COMPARTMENT_CAPACITY, COMPARTMENTS_PER_TRUCK, setCurrentUser,
  advanceLoading, advanceJourneys,
} from '@/src/lib/demo-data';
import { dispatchTrip } from '@/src/lib/dispatch-client';
import type { FuelType } from '@/src/types';

const PRODUCTS: FuelType[] = ['DIESEL', 'PETROL', 'PREMIUM'];
// Which seeded CLIENT user "owns" each delivery zone — needed so the order is
// visible to that client's own QR-scan/orders screens, same as any other order.
const ZONE_CLIENT: Record<string, { id: string; name: string }> = {
  'qurum-station':   { id: 'client-001', name: 'Client Corp 1' },
  'khuwair-station': { id: 'client-002', name: 'Client Corp 2' },
};

function newDispatchNo() {
  return `XYZ-${Date.now().toString(36).toUpperCase()}`;
}

const SENT_ORDERS_KEY = 'xyz_console_sent_order_ids';

function readSentOrderIds(): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(SENT_ORDERS_KEY) ?? '[]'); } catch { return []; }
}

function rememberSentOrderId(orderId: string) {
  const ids = [orderId, ...readSentOrderIds()].slice(0, 20);
  localStorage.setItem(SENT_ORDERS_KEY, JSON.stringify(ids));
}

export default function XyzCompanyDashboard() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [trucks, setTrucks] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const zones = getDeliveryLocations();

  const [erpDispatchNo, setErpDispatchNo] = useState(newDispatchNo());
  const [truckId, setTruckId] = useState('');
  const [product, setProduct] = useState<FuelType>('DIESEL');
  const [compartments, setCompartments] = useState(1);
  const [zoneId, setZoneId] = useState(zones[0]?.id ?? '');

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ orderId: string; tripId?: string; replay?: boolean; truckReg: string } | null>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    // This console is often the only screen open after sending a dispatch, so
    // it has to tick the journey/geofence simulation itself — otherwise a
    // truck just sits at EN_ROUTE forever unless someone separately opens
    // Fleet Monitor or Orders (the only other places that call these).
    advanceLoading();
    advanceJourneys();
    setTrucks(getTrucks());
    setDrivers(getDrivers());
    // Live status for everything sent from this console — not a static
    // snapshot — so "Confirm delivery" appears the moment a truck arrives.
    const orders = getOrders();
    setRecent(readSentOrderIds().map(id => orders.find(o => o.id === id)).filter(Boolean));
  };

  useEffect(() => {
    setMounted(true);
    load();
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, []);

  if (!mounted) return null;

  // Only XYZ Petroleum's own registered fleet — an ERP can only dispatch
  // trucks that company actually owns and has onboarded onto the platform,
  // not any other tenant's trucks.
  const idleTrucks = trucks.filter(t => t.workspaceId === 'ws-xyz-petroleum' && ['IDLE', 'ACTIVE'].includes(t.status));
  const selectedTruck = trucks.find(t => t.id === truckId);
  const selectedDriver = selectedTruck ? drivers.find(d => d.id === selectedTruck.assignedDriverId) : null;
  const zone = zones.find(z => z.id === zoneId);
  const volume = compartments * COMPARTMENT_CAPACITY;

  const send = async () => {
    if (!selectedTruck || !zone) return;
    setSending(true);
    setError(null);
    try {
      const client = ZONE_CLIENT[zone.id] ?? ZONE_CLIENT['qurum-station'];
      const orderId = `order-xyz-${Date.now()}`;
      const now = new Date();

      // Call the real dispatch API FIRST and only touch local order/truck
      // state on success. A truck must never look busy in this demo for a
      // dispatch the platform actually rejected (e.g. 409 — that truck is
      // already on an active trip server-side) — a truck can't go out on a
      // second delivery until its current one is complete, full stop.
      const result = await dispatchTrip({
        truckRef: selectedTruck.registrationNumber,
        driverRef: selectedDriver?.id,
        erpDispatchNo,
        expectedVolumeL: volume,
        product: product.toLowerCase(),
        origin: { name: FIXED_DEPOT.name, latitude: FIXED_DEPOT.lat, longitude: FIXED_DEPOT.lng },
        destination: { name: zone.name, latitude: zone.lat, longitude: zone.lng, geofenceRadiusM: zone.radius },
      });

      if (!result.ok) {
        setError(`Monitoring platform rejected the dispatch: HTTP ${result.status} — ${result.error ?? 'unknown error'}`);
        return;
      }

      addOrder({
        id: orderId,
        clientId: client.id,
        clientName: client.name,
        workspaceId: 'ws-anptco',
        fuelType: product,
        volume,
        status: 'EN_ROUTE',
        assignedTSPId: selectedTruck.tspId,
        assignedTruckId: selectedTruck.id,
        assignedTruckRegistration: selectedTruck.registrationNumber,
        assignedDriverId: selectedDriver?.id,
        assignedDriverName: selectedDriver ? `${selectedDriver.firstName} ${selectedDriver.lastName}` : 'Driver TBD',
        assignedDriverPhone: selectedDriver?.phone,
        destination: zone.id,
        destinationName: zone.name,
        destinationAddress: zone.address,
        destinationLat: zone.lat,
        destinationLng: zone.lng,
        geofenceRadiusM: zone.radius,
        erpDispatchNo,
        erpTripId: result.tripId,
        createdAt: now,
        truckAssignedAt: now,
        loadedAt: now,
        tripStartedAt: now,
      } as any);
      updateTruck(selectedTruck.id, { status: 'EN_ROUTE' });

      if (selectedTruck.tspId) {
        addNotification({
          id: `notif-xyz-${Date.now()}`, userId: selectedTruck.tspId,
          type: 'TRUCK_EN_ROUTE', title: '📥 New dispatch from XYZ Petroleum',
          message: `${erpDispatchNo}: ${selectedTruck.registrationNumber} dispatched with ${volume.toLocaleString()}L ${product} → ${zone.name}.`,
          read: false, createdAt: now,
        });
      }

      setSent({ orderId, tripId: result.tripId, replay: result.replay, truckReg: selectedTruck.registrationNumber });
      rememberSentOrderId(orderId);
      setErpDispatchNo(newDispatchNo());
      load();
    } finally {
      setSending(false);
    }
  };

  // Every truck dispatchable from this console belongs to XYZ Petroleum's own
  // tenant, so "track it" always means logging into that same tenant's Fleet
  // Monitor — this is the platform account XYZ itself would use.
  const trackInFleetMonitor = (orderId: string) => {
    setCurrentUser({
      id: 'xyz-petroleum',
      email: 'ops@xyzpetroleum.com',
      firstName: 'XYZ',
      lastName: 'Petroleum',
      role: 'TRANSPORT_ADMIN',
      workspaceId: 'ws-xyz-petroleum',
      companyName: 'XYZ Petroleum LLC',
      verified: true,
    } as any);
    router.push(`/transport/fleet-monitor?order=${orderId}`);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">External System (demo)</p>
          <h1 className="text-xl font-black text-gray-900">XYZ Petroleum — Dispatch Console</h1>
        </div>
        <button onClick={() => router.push('/')} className="text-sm font-semibold text-gray-500 hover:text-gray-700">
          ← Back to platform
        </button>
      </header>

      <main className="max-w-3xl mx-auto p-6 space-y-6">
        <p className="text-sm text-gray-500">
          This represents XYZ Petroleum's own dispatch system — a different company, outside this monitoring
          platform. Fill in what an ERP actually knows about a dispatch (truck, driver, cargo, destination) and
          send it across the boundary; the platform picks it up and starts monitoring the trip.
        </p>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="ERP Dispatch No.">
              <input value={erpDispatchNo} onChange={e => setErpDispatchNo(e.target.value)} className="input" />
            </Field>
            <Field label="Truck">
              <select value={truckId} onChange={e => setTruckId(e.target.value)} className="input">
                <option value="">Select an idle truck…</option>
                {idleTrucks.map(t => (
                  <option key={t.id} value={t.id}>{t.registrationNumber} · {t.tspName}</option>
                ))}
              </select>
            </Field>
            <Field label="Driver">
              <input value={selectedDriver ? `${selectedDriver.firstName} ${selectedDriver.lastName} · ${selectedDriver.phone}` : '—'} disabled className="input bg-gray-50 text-gray-500" />
            </Field>
            <Field label="Product">
              <select value={product} onChange={e => setProduct(e.target.value as FuelType)} className="input">
                {PRODUCTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label={`Amount (compartments of ${COMPARTMENT_CAPACITY.toLocaleString()}L)`}>
              <select value={compartments} onChange={e => setCompartments(Number(e.target.value))} className="input">
                {Array.from({ length: COMPARTMENTS_PER_TRUCK }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>{n} × {COMPARTMENT_CAPACITY.toLocaleString()}L = {(n * COMPARTMENT_CAPACITY).toLocaleString()}L</option>
                ))}
              </select>
            </Field>
            <Field label="Destination">
              <select value={zoneId} onChange={e => setZoneId(e.target.value)} className="input">
                {zones.map(z => <option key={z.id} value={z.id}>{z.name} — {z.address}</option>)}
              </select>
            </Field>
          </div>

          {idleTrucks.length === 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              No idle trucks right now — every truck is already on a trip.
            </p>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <button
            onClick={send}
            disabled={!truckId || !zone || sending}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition"
          >
            {sending ? 'Sending…' : 'Send to Monitoring'}
          </button>
        </div>

        {sent && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
            <p className="font-bold text-emerald-900">✓ Dispatched — {sent.truckReg} is now being monitored</p>
            <p className="text-xs text-emerald-700 mt-1">
              Trip {sent.tripId ?? '—'}{sent.replay ? ' (idempotent replay — same erp_dispatch_no was already sent)' : ''}
            </p>
            <button
              onClick={() => trackInFleetMonitor(sent.orderId)}
              className="mt-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg transition"
            >
              Watch it live in Fleet Monitor →
            </button>
          </div>
        )}

        {recent.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Sent from this console</p>
            <div className="space-y-2">
              {recent.map(r => (
                <div key={r.id} className="flex items-center justify-between gap-3 text-xs border border-gray-100 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800 truncate">{r.erpDispatchNo} · {r.assignedTruckRegistration}</p>
                    <p className="text-gray-400 truncate">{r.volume?.toLocaleString()}L → {r.destinationName}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <StatusPill status={r.status} />
                    {['EN_ROUTE', 'ARRIVED'].includes(r.status) && (
                      <button onClick={() => trackInFleetMonitor(r.id)} className="text-blue-600 font-semibold hover:underline">Track →</button>
                    )}
                    {r.status === 'ARRIVED' && (
                      <button onClick={() => router.push(`/xyz-company/delivery?order=${r.id}`)} className="text-emerald-600 font-semibold hover:underline">
                        Confirm delivery →
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      <style>{`.input { border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.5rem 0.7rem; font-size: 0.85rem; width: 100%; }`}</style>
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  EN_ROUTE:          'bg-blue-100 text-blue-700',
  ARRIVED:           'bg-teal-100 text-teal-700',
  COMPLETED:         'bg-emerald-100 text-emerald-700',
  DELIVERY_REJECTED: 'bg-red-100 text-red-700',
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {String(status).replace(/_/g, ' ')}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
