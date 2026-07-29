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
  getTrucks, getDrivers, getDeliveryLocations, getOrders, addOrder, updateOrder, updateTruck, addNotification, shortOrderId,
  addFuelAnomaly, FIXED_DEPOT, COMPARTMENT_CAPACITY, COMPARTMENTS_PER_TRUCK, setCurrentUser,
  advanceLoading, advanceJourneys, destinationCoords, destinationGeofenceRadiusM, orderFuelTelemetry,
} from '@/src/lib/demo-data';
import { dispatchTrip, updateTripStatus as updateErpTripStatus } from '@/src/lib/dispatch-client';
import { ingestTelemetry, getHistory } from '@/src/lib/telemetry-store';
import { evaluateTheftRisk } from '@/src/lib/theft-pipeline';
import { sendWebhook } from '@/src/lib/webhooks';
import type { FuelType } from '@/src/types';

const PRODUCTS: FuelType[] = ['DIESEL', 'PETROL', 'PREMIUM'];

// Two independent Monitoring-Only tenants share this one console — Client 1
// is the clean always-succeeds walkthrough, Client 2 is dedicated to
// demoing the fuel-theft / unauthorized-activity failure path. Each only
// ever sees and dispatches its own fleet (filtered by workspaceId), and each
// always delivers to its own paired client — Client Corp 1 for the standard
// walkthrough, Client Corp 2 for the theft-demo tenant.
const XYZ_COMPANIES = [
  { id: 'xyz-petroleum',   workspaceId: 'ws-xyz-petroleum',   name: 'Client 1', email: 'ops@client1.com', firstName: 'Client', lastName: '1' },
  { id: 'xyz-petroleum-2', workspaceId: 'ws-xyz-petroleum-2', name: 'Client 2', email: 'ops@client2.com', firstName: 'Client', lastName: '2' },
];
const COMPANY_CLIENT: Record<string, { id: string; name: string }> = {
  'xyz-petroleum':   { id: 'client-001', name: 'Client Corp 1' },
  'xyz-petroleum-2': { id: 'client-002', name: 'Client Corp 2' },
};
const COMPANY_KEY = 'xyz_console_company_id';

// The ERP's own sales-order number — the one identifier this console asks
// for. It doubles as our dispatch/idempotency key under the hood (sent as
// erp_dispatch_no), so retrying a click with the same value replays the same
// trip instead of creating a duplicate — but the user only ever sees one field.
function newOrderRef() {
  return `SO-${Math.floor(10000 + Math.random() * 90000)}`;
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

  const [companyId, setCompanyId] = useState(XYZ_COMPANIES[0].id);
  const [orderRef, setOrderRef] = useState(newOrderRef());
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
    const savedCompany = typeof window !== 'undefined' ? localStorage.getItem(COMPANY_KEY) : null;
    if (savedCompany && XYZ_COMPANIES.some(c => c.id === savedCompany)) setCompanyId(savedCompany);
    load();
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, []);

  if (!mounted) return null;

  const company = XYZ_COMPANIES.find(c => c.id === companyId) ?? XYZ_COMPANIES[0];
  const switchCompany = (id: string) => {
    setCompanyId(id);
    setTruckId('');
    localStorage.setItem(COMPANY_KEY, id);
  };

  // Only the selected company's own registered fleet — an ERP can only
  // dispatch trucks that company actually owns and has onboarded onto the
  // platform, never another tenant's trucks.
  const idleTrucks = trucks.filter(t => t.workspaceId === company.workspaceId && ['IDLE', 'ACTIVE'].includes(t.status));
  const selectedTruck = trucks.find(t => t.id === truckId);
  const selectedDriver = selectedTruck ? drivers.find(d => d.id === selectedTruck.assignedDriverId) : null;
  const zone = zones.find(z => z.id === zoneId);
  const volume = compartments * COMPARTMENT_CAPACITY;

  // The exact payload that crosses the boundary when "Send to Monitoring" is
  // clicked — built live from the form above so the JSON preview is real,
  // not a canned example.
  const dispatchPayload = {
    orderRef,
    origin: { name: FIXED_DEPOT.name, lat: FIXED_DEPOT.lat, lng: FIXED_DEPOT.lng },
    ...(zone && { destination: { name: zone.name, lat: zone.lat, lng: zone.lng } }),
    compartments: Array.from({ length: compartments }, (_, i) => ({
      index: i + 1, fuelType: product, expectedVolume: COMPARTMENT_CAPACITY,
    })),
    ...(selectedDriver && { driver: `${selectedDriver.firstName} ${selectedDriver.lastName}` }),
  };

  const send = async () => {
    if (!selectedTruck || !zone) return;
    setSending(true);
    setError(null);
    try {
      const client = COMPANY_CLIENT[company.id] ?? COMPANY_CLIENT['xyz-petroleum'];
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
        erpDispatchNo: orderRef,
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
        workspaceId: company.workspaceId,
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
        erpDispatchNo: orderRef,
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
          type: 'TRUCK_EN_ROUTE', title: `📥 New dispatch from ${company.name}`,
          message: `${orderRef}: ${selectedTruck.registrationNumber} dispatched with ${volume.toLocaleString()}L ${product} → ${zone.name}.`,
          read: false, createdAt: now,
        });
      }

      setSent({ orderId, tripId: result.tripId, replay: result.replay, truckReg: selectedTruck.registrationNumber });
      rememberSentOrderId(orderId);
      setOrderRef(newOrderRef());
      load();
    } finally {
      setSending(false);
    }
  };

  // "Track it" means logging into whichever tenant actually owns that truck's
  // trip — not necessarily the currently-selected company in the form above
  // (you might switch companies after sending, or click Track on an older
  // entry from the other tenant).
  const trackInFleetMonitor = (orderId: string, tspId?: string) => {
    const owner = XYZ_COMPANIES.find(c => c.id === tspId) ?? company;
    setCurrentUser({
      id: owner.id,
      email: owner.email,
      firstName: owner.firstName,
      lastName: owner.lastName,
      role: 'SELLER_MANAGER',
      workspaceId: owner.workspaceId,
      companyName: owner.name,
      verified: true,
    } as any);
    router.push(`/seller/fleet-monitor?order=${orderId}`);
  };

  // Real BLE fuel data is noisy, so ambient sensor jitter alone won't cross
  // the theft-pipeline's threshold — this injects a realistic stationary,
  // off-geofence fuel-drop reading into the truck's actual telemetry stream,
  // then lets the real pipeline (src/lib/theft-pipeline.ts) decide whether it
  // counts as theft. When it does, the delivery is failed outright — not
  // just flagged — matching "unauthorized activity" as a security incident,
  // not a client-side rejection at the door.
  const reportUnauthorizedActivity = async (order: any) => {
    if (!order.assignedTruckId) return;
    const truck = trucks.find(t => t.id === order.assignedTruckId);
    const deviceId = truck?.galileoskyDeviceId ?? `IMEI-${order.assignedTruckId}`;
    const dest = destinationCoords(order);
    const offRoute = { lat: dest.lat + 0.15, lng: dest.lng + 0.12 }; // well outside any geofence
    const baseline = orderFuelTelemetry(order).totalVolume;
    const now = Date.now();
    const droppedVolume = Math.max(0, baseline - 320);

    // Inject a full 5-point window (3 baseline + 2 dropped) instead of relying
    // on ambient advanceJourneys() ticks to have already built up a "before"
    // history — clicking this within a few seconds of dispatch (before any
    // ambient tick has fired) previously meant the pipeline had nothing to
    // compare the drop against and correctly reported "no drop." Millisecond
    // (not multi-second) spacing matters too: with a multi-second spread, a
    // real ambient tick from the console's own self-ticking advanceJourneys()
    // could land in between and dilute the pattern; packed to the current
    // instant, nothing else can be interleaved.
    const point = (ts: number, volume: number) => ({
      truckId: order.assignedTruckId, deviceId, lat: offRoute.lat, lng: offRoute.lng,
      speed: 0, ignition: false, ts, compartmentVolumes: [volume],
    });
    ingestTelemetry(point(now - 4, baseline));
    ingestTelemetry(point(now - 3, baseline));
    ingestTelemetry(point(now - 2, baseline));
    ingestTelemetry(point(now - 1, droppedVolume));
    ingestTelemetry(point(now, droppedVolume));

    const evaluation = evaluateTheftRisk(getHistory(order.assignedTruckId).slice(-5), {
      depot: { center: FIXED_DEPOT, radiusM: FIXED_DEPOT.geofenceRadius },
      destination: { center: dest, radiusM: destinationGeofenceRadiusM(order) },
    });

    if (!evaluation.suspicious) {
      alert(`Pipeline evaluated the drop and did NOT flag it:\n${evaluation.reasoning.join('\n')}`);
      return;
    }

    const reasoning = evaluation.reasoning.join(' · ');
    addFuelAnomaly({
      id:             `anomaly-${now}`,
      orderId:        order.id,
      truckReg:       order.assignedTruckRegistration ?? 'TRK',
      compartment:    'All compartments',
      fuelDropLiters: Math.round(evaluation.dropLiters),
      location:       reasoning,
      detectedAt:     new Date(),
      severity:       'HIGH',
      status:         'OPEN',
    });
    if (order.assignedTSPId) {
      addNotification({
        id: `notif-theft-${now}`, userId: order.assignedTSPId,
        type: 'FUEL_ANOMALY', title: '🚨 Fuel theft detected',
        message: `${order.assignedTruckRegistration ?? 'Truck'} — ${Math.round(evaluation.dropLiters)}L drop while stopped. Delivery #${shortOrderId(order.id)} aborted.`,
        read: false, createdAt: new Date(),
      });
    }

    updateOrder(order.id, {
      status: 'DELIVERY_FAILED',
      failedAt: new Date(),
      failureReason: `Unauthorized activity detected — ${reasoning}`,
    });
    updateTruck(order.assignedTruckId, { status: 'RETURNING' });

    if (order.erpTripId) await updateErpTripStatus(order.erpTripId, 'CANCELLED');
    await sendWebhook({
      event: 'theft.alert',
      trip_id: order.erpTripId ?? order.id,
      erp_dispatch_no: order.erpDispatchNo ?? order.id,
      occurred_at: new Date().toISOString(),
      data: {
        drop_liters: Math.round(evaluation.dropLiters),
        reasoning: evaluation.reasoning,
        driver: order.assignedDriverName,
        driver_phone: order.assignedDriverPhone,
      },
    });
    await sendWebhook({
      event: 'trip.exception',
      trip_id: order.erpTripId ?? order.id,
      erp_dispatch_no: order.erpDispatchNo ?? order.id,
      occurred_at: new Date().toISOString(),
      data: { reason: 'unauthorized_activity', outcome: 'DELIVERY_FAILED' },
    });

    load();
  };

  // Plan §3's dispatch edge case: "GPS device offline / unassigned → accept
  // the trip, flag telemetry_status: NO_SIGNAL, alert." advanceJourneys()
  // stops updating this order's position/geofence entirely while flagged —
  // the platform genuinely has no idea where the truck is until it clears.
  const simulateNoSignal = async (order: any) => {
    updateOrder(order.id, { telemetryStatus: 'NO_SIGNAL', noSignalSince: new Date() });
    await sendWebhook({
      event: 'telemetry.no_signal',
      trip_id: order.erpTripId ?? order.id,
      erp_dispatch_no: order.erpDispatchNo ?? order.id,
      occurred_at: new Date().toISOString(),
      data: { truck_ref: order.assignedTruckRegistration, reason: 'gps_device_offline' },
    });
    load();
  };

  const restoreSignal = (order: any) => {
    updateOrder(order.id, { telemetryStatus: 'OK', noSignalSince: undefined });
    load();
  };

  // Plan's trip state machine: "exit geofence w/o QR = EXCEPTION." The truck
  // reached the destination but left again before delivery was confirmed —
  // a real, distinct failure mode from theft (nothing was necessarily
  // stolen; the delivery just never got confirmed) and from a client
  // rejection (nobody at the station made a decision at all).
  const simulateLeftWithoutConfirming = async (order: any) => {
    const reason = `${order.assignedTruckRegistration ?? 'Truck'} left the destination geofence before the delivery QR was scanned — delivery not confirmed.`;
    updateOrder(order.id, { status: 'TRIP_EXCEPTION', exceptionAt: new Date(), exceptionReason: reason });
    if (order.assignedTruckId) updateTruck(order.assignedTruckId, { status: 'RETURNING' });

    if (order.erpTripId) await updateErpTripStatus(order.erpTripId, 'CANCELLED');
    await sendWebhook({
      event: 'trip.exception',
      trip_id: order.erpTripId ?? order.id,
      erp_dispatch_no: order.erpDispatchNo ?? order.id,
      occurred_at: new Date().toISOString(),
      data: { reason: 'left_geofence_without_confirmation', outcome: 'TRIP_EXCEPTION' },
    });
    load();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">External System (demo)</p>
          <h1 className="text-xl font-black text-gray-900">{company.name} — Dispatch Console</h1>
        </div>
        <button onClick={() => router.push('/')} className="text-sm font-semibold text-gray-500 hover:text-gray-700">
          ← Back to platform
        </button>
      </header>

      <main className="max-w-3xl mx-auto p-6 space-y-6">
        <p className="text-sm text-gray-500">
          This represents an ERP dispatch system — a different company, outside this monitoring platform. Fill in
          what an ERP actually knows about a dispatch (truck, driver, cargo, destination) and send it across the
          boundary; the platform picks it up and starts monitoring the trip.
        </p>

        {/* Sending as which company — each only ever sees/dispatches its own fleet */}
        <div className="flex gap-2">
          {XYZ_COMPANIES.map(c => (
            <button
              key={c.id}
              onClick={() => switchCompany(c.id)}
              className={`flex-1 text-left px-4 py-2.5 rounded-xl border-2 transition-all text-sm font-semibold ${
                c.id === companyId ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {c.name}
              <span className="block text-[11px] font-normal text-gray-400">
                {c.id === 'xyz-petroleum-2' ? 'Theft / unauthorized activity demo' : 'Standard delivery walkthrough'}
              </span>
            </button>
          ))}
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Order Ref (their SO number)">
              <input value={orderRef} onChange={e => setOrderRef(e.target.value)} className="input" />
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

        {/* Live dispatch payload — exactly what "Send to Monitoring" POSTs across
            the boundary, built from the form above so it's never a canned example. */}
        <div className="bg-slate-900 rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Dispatch Payload</p>
          <pre className="text-[11px] leading-relaxed text-emerald-300 overflow-x-auto whitespace-pre">
{JSON.stringify(dispatchPayload, null, 2)}
          </pre>
        </div>

        {sent && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
            <p className="font-bold text-emerald-900">✓ Dispatched — {sent.truckReg} is now being monitored</p>
            <p className="text-xs text-emerald-700 mt-1">
              Trip {sent.tripId ?? '—'}{sent.replay ? ' (idempotent replay — same erp_dispatch_no was already sent)' : ''}
            </p>
            <button
              onClick={() => trackInFleetMonitor(sent.orderId, selectedTruck?.tspId)}
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
              {recent.map(r => {
                const noSignal = r.telemetryStatus === 'NO_SIGNAL';
                return (
                  <div key={r.id} className="border border-gray-100 rounded-lg px-3 py-2 text-xs space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800 truncate">{r.erpDispatchNo} · {r.assignedTruckRegistration}</p>
                        <p className="text-gray-400 truncate">{r.volume?.toLocaleString()}L → {r.destinationName}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {noSignal && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">📡 NO SIGNAL</span>}
                        <StatusPill status={r.status} />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {['EN_ROUTE', 'ARRIVED'].includes(r.status) && (
                        <button onClick={() => trackInFleetMonitor(r.id, r.assignedTSPId)} className="text-blue-600 font-semibold hover:underline">Track →</button>
                      )}
                      {r.status === 'ARRIVED' && (
                        <>
                          <button onClick={() => router.push(`/xyz-company/delivery?order=${r.id}`)} className="text-emerald-600 font-semibold hover:underline">
                            Confirm delivery →
                          </button>
                          <button
                            onClick={() => simulateLeftWithoutConfirming(r)}
                            title="Truck leaves the destination geofence before the delivery QR is scanned"
                            className="text-orange-600 font-semibold hover:underline"
                          >
                            🚪 Simulate left without confirming
                          </button>
                        </>
                      )}
                      {r.status === 'EN_ROUTE' && !noSignal && (
                        <>
                          <button
                            onClick={() => reportUnauthorizedActivity(r)}
                            title="Injects a real stationary, off-geofence fuel-drop reading and runs the theft pipeline against it"
                            className="text-red-600 font-semibold hover:underline"
                          >
                            🚨 Report unauthorized activity
                          </button>
                          <button
                            onClick={() => simulateNoSignal(r)}
                            title="GPS device goes offline mid-trip — position/geofence tracking freezes until signal is restored"
                            className="text-orange-600 font-semibold hover:underline"
                          >
                            📡 Simulate GPS signal loss
                          </button>
                        </>
                      )}
                      {r.status === 'EN_ROUTE' && noSignal && (
                        <button onClick={() => restoreSignal(r)} className="text-blue-600 font-semibold hover:underline">
                          Restore signal →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
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
  DELIVERY_FAILED:   'bg-red-100 text-red-700',
  TRIP_EXCEPTION:    'bg-orange-100 text-orange-700',
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
