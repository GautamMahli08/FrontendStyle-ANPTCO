'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import {
  getCurrentUser, getOrders, getTrucks, updateOrder, updateTruck, addNotification, shortOrderId,
  orderFuelTelemetry, destinationCoords,
} from '@/src/lib/demo-data';
import { verifyDeliveryQrToken } from '@/src/lib/qr-token';
import { haversineDistanceM } from '@/src/lib/geo';
import { getLiveState } from '@/src/lib/telemetry-store';
import { reconcileDelivery } from '@/src/lib/theft-pipeline';
import { sendWebhook } from '@/src/lib/webhooks';
import { updateTripStatus as updateErpTripStatus } from '@/src/lib/dispatch-client';
import { logDemoEvent } from '@/src/app/client/dashboard/page';
import CompartmentFuel from '@/src/components/fleet/CompartmentFuel';

type Stage = 'idle' | 'camera' | 'review' | 'processing' | 'confirmed' | 'rejected';

export default function ScanQRPage() {
  const router = useRouter();
  const [user,      setUser]      = useState<any>(null);
  const [order,     setOrder]     = useState<any>(null);
  const [truck,     setTruck]     = useState<any>(null);
  const [mounted,   setMounted]   = useState(false);
  const [stage,     setStage]     = useState<Stage>('idle');
  const [camError,  setCamError]  = useState<string | null>(null);
  const [scanHint,  setScanHint]  = useState('Point camera at the QR code on the truck');
  const [rejecting,    setRejecting]    = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [scannerPos,   setScannerPos]   = useState<{ lat: number; lng: number } | null>(null);
  const [verifying,    setVerifying]    = useState(false);
  const [confirmation, setConfirmation] = useState<{ deliveredVolumeL: number; shortfallL: number; distanceM: number | null } | null>(null);

  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const rafRef      = useRef<number | null>(null);

  const load = useCallback((u: any) => {
    const arrived = getOrders().find(o => o.clientId === u.id && o.status === 'ARRIVED');
    setOrder(arrived ?? null);
    if (arrived?.assignedTruckId) {
      setTruck(getTrucks().find(t => t.id === arrived.assignedTruckId) ?? null);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    const u = getCurrentUser();
    if (!u || u.role !== 'CLIENT') { router.push('/'); return; }
    setUser(u);
    load(u);
  }, [router, load]);

  // Stop camera when unmounting or leaving camera stage
  useEffect(() => {
    return () => stopCamera();
  }, []);

  function stopCamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  // ── Open camera ───────────────────────────────────────────────
  async function openCamera() {
    setCamError(null);
    // Browsers only allow camera access on a "secure context" — HTTPS, or
    // localhost. Opening this over plain http://<lan-ip>:3000 on a phone
    // fails here regardless of the OS-level camera permission granted to the
    // browser app, and the resulting error is otherwise indistinguishable
    // from a real permission denial — so check this first and say so.
    if (!window.isSecureContext) {
      setCamError('❌ Camera access needs a secure connection (HTTPS or localhost) — this page was opened over plain HTTP, so the browser blocks the camera regardless of app permissions. Run `npm run dev:https` and open the https:// address instead.');
      return;
    }
    setStage('camera');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        scanLoop();
      }
    } catch {
      setCamError('Camera permission denied. Please allow camera access and try again.');
      setStage('idle');
    }
  }

  // ── Continuous QR scan loop ───────────────────────────────────
  function scanLoop() {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Dynamically import jsQR to avoid SSR issues
    import('jsqr').then(({ default: jsQR }) => {
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code?.data) {
        handleQRFound(code.data);
      } else {
        rafRef.current = requestAnimationFrame(scanLoop);
      }
    }).catch(() => {
      rafRef.current = requestAnimationFrame(scanLoop);
    });
  }

  // ── QR code detected ─────────────────────────────────────────
  // The scanned code is a short-lived, HMAC-signed token bound to THIS trip
  // (src/lib/qr-token.ts) — not the truck's static printed ID. A photo of an
  // old/expired code, or a code from a different order, is rejected outright.
  async function handleQRFound(qrData: string) {
    if (verifying || !order) return;
    setVerifying(true);
    const result = await verifyDeliveryQrToken(qrData, order.id);
    setVerifying(false);

    if (!result.valid) {
      stopCamera();
      const messages: Record<string, string> = {
        MALFORMED:     'This QR code is not a valid delivery code.',
        BAD_SIGNATURE: 'This QR code failed signature verification — it may be forged.',
        EXPIRED:       'This QR code has expired — ask the transporter to show the current one.',
        WRONG_TRIP:    "This QR code doesn't match your delivery.",
      };
      setCamError(`❌ ${messages[result.reason ?? 'MALFORMED']}`);
      setStage('idle');
      return;
    }

    stopCamera();
    setScanHint('✓ Truck verified');
    // Capture the scanner's own GPS at the moment of a valid scan (plan §8) —
    // best-effort; a denied/unavailable location doesn't block the flow.
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setScannerPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setScannerPos(null),
        { timeout: 5000 },
      );
    }
    // Truck is verified — show the per-compartment fuel status so the client
    // can review what's being delivered before accepting or rejecting.
    setStage('review');
  }

  // ── Confirm delivery ──────────────────────────────────────────
  function confirmDelivery() {
    if (!order) return;
    setStage('processing');
    setTimeout(() => {
      // Reconcile expected_volume_l (dispatch) against the sensor-measured
      // delivered volume (plan §4/§8) — the shortfall is the money line.
      const deliveredVolumeL = orderFuelTelemetry(order).totalVolume;
      const expectedVolumeL = order.volume ?? 0;
      const reconciliation = reconcileDelivery(expectedVolumeL, deliveredVolumeL);

      const truckPos = order.assignedTruckId ? getLiveState(order.assignedTruckId) : undefined;
      const dest = destinationCoords(order);
      const truckLat = truckPos?.lat ?? dest.lat;
      const truckLng = truckPos?.lng ?? dest.lng;
      const distanceM = scannerPos ? Math.round(haversineDistanceM(scannerPos, { lat: truckLat, lng: truckLng })) : null;

      const deliveryConfirmation = {
        confirmedAt: new Date().toISOString(),
        scannerLat: scannerPos?.lat ?? null,
        scannerLng: scannerPos?.lng ?? null,
        truckLat, truckLng,
        distanceM,
        deliveredVolumeL,
        shortfallL: reconciliation.shortfallL,
      };

      updateOrder(order.id, { status: 'COMPLETED', completedAt: new Date(), deliveryConfirmation });
      setConfirmation({ deliveredVolumeL, shortfallL: reconciliation.shortfallL, distanceM });
      if (order.assignedTruckId) updateTruck(order.assignedTruckId, { status: 'IDLE' });

      if (order.erpTripId) {
        void updateErpTripStatus(order.erpTripId, 'DELIVERED');
        void updateErpTripStatus(order.erpTripId, 'CLOSED');
      }
      void sendWebhook({
        event: 'delivery.confirmed',
        trip_id: order.erpTripId ?? order.id,
        erp_dispatch_no: order.erpDispatchNo ?? order.id,
        occurred_at: new Date().toISOString(),
        data: {
          expected_volume_l: expectedVolumeL,
          delivered_volume_l: deliveredVolumeL,
          shortfall_l: reconciliation.shortfallL,
          confirmation: { distance_m: distanceM, method: 'qr_signed' },
        },
      });
      if (reconciliation.suspicious) {
        void sendWebhook({
          event: 'theft.alert',
          trip_id: order.erpTripId ?? order.id,
          erp_dispatch_no: order.erpDispatchNo ?? order.id,
          occurred_at: new Date().toISOString(),
          data: { reasoning: reconciliation.reasoning, driver: order.assignedDriverName, driver_phone: order.assignedDriverPhone },
        });
      }

      logDemoEvent(
        user?.id ?? 'client',
        'DELIVERY_CONFIRMED',
        `orderId=${order.id} | truck=${truck?.registrationNumber} | delivered=${deliveredVolumeL}L | shortfall=${reconciliation.shortfallL}L`
      );

      if (order.assignedDriverId) {
        addNotification({
          id: `notif-${Date.now()}-d`, userId: order.assignedDriverId,
          type: 'DELIVERY_COMPLETED', title: '✅ Delivery Accepted',
          message: `Client accepted delivery for order #${shortOrderId(order.id)}. Return to depot.`,
          read: false, createdAt: new Date(),
        });
      }
      addNotification({
        id: `notif-${Date.now()}-s`, userId: 'seller-001',
        type: 'DELIVERY_COMPLETED', title: '✅ Order Completed',
        message: `Order #${shortOrderId(order.id)} delivered to ${order.destinationName}.`,
        read: false, createdAt: new Date(),
      });
      if (order.assignedTSPId) {
        addNotification({
          id: `notif-${Date.now()}-t`, userId: order.assignedTSPId,
          type: 'DELIVERY_COMPLETED', title: '✅ Order Completed',
          message: `Order #${shortOrderId(order.id)} successfully delivered.`,
          read: false, createdAt: new Date(),
        });
      }
      setStage('confirmed');
    }, 800);
  }

  // ── Reject delivery ───────────────────────────────────────────
  function rejectDelivery() {
    if (!order) return;
    const reason = rejectReason.trim();

    updateOrder(order.id, {
      status: 'DELIVERY_REJECTED',
      rejectedAt: new Date(),
      rejectionReason: reason || undefined,
    });
    // Truck keeps its fuel and returns to the depot.
    if (order.assignedTruckId) updateTruck(order.assignedTruckId, { status: 'RETURNING' });

    logDemoEvent(
      user?.id ?? 'client',
      'DELIVERY_REJECTED',
      `orderId=${order.id} | truck=${truck?.registrationNumber} | reason=${reason || 'n/a'}`
    );

    const reasonLine = reason ? ` Reason: ${reason}` : '';
    if (order.assignedDriverId) {
      addNotification({
        id: `notif-${Date.now()}-d`, userId: order.assignedDriverId,
        type: 'DELIVERY_REJECTED', title: '⛔ Delivery Rejected',
        message: `Client rejected delivery for order #${shortOrderId(order.id)}.${reasonLine} Return fuel to depot.`,
        read: false, createdAt: new Date(),
      });
    }
    addNotification({
      id: `notif-${Date.now()}-s`, userId: 'seller-001',
      type: 'DELIVERY_REJECTED', title: '⛔ Delivery Rejected',
      message: `Order #${shortOrderId(order.id)} was rejected by ${order.destinationName ?? 'the client'}.${reasonLine}`,
      read: false, createdAt: new Date(),
    });
    if (order.assignedTSPId) {
      addNotification({
        id: `notif-${Date.now()}-t`, userId: order.assignedTSPId,
        type: 'DELIVERY_REJECTED', title: '⛔ Delivery Rejected',
        message: `Order #${shortOrderId(order.id)} was rejected on arrival.${reasonLine}`,
        read: false, createdAt: new Date(),
      });
    }
    setStage('rejected');
  }

  if (!mounted || !user) return null;

  // ── Confirmed ─────────────────────────────────────────────────
  if (stage === 'confirmed') {
    return (
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar userRole={user.role} />
        <div className="flex-1 min-w-0">
          <Header user={user} />
          <main className="p-6 flex items-center justify-center min-h-[70vh]">
            <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center max-w-md w-full shadow-lg">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <svg className="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-black text-gray-900 mb-2">Delivery Confirmed</h2>
              <p className="text-gray-500 text-sm mb-1">Order #{shortOrderId(order?.id)} completed.</p>
              <p className="text-gray-400 text-xs mb-1">
                {order?.volume?.toLocaleString()}L {order?.fuelType} expected · {confirmation?.deliveredVolumeL.toLocaleString()}L delivered
              </p>
              {confirmation && confirmation.shortfallL > 0 && (
                <p className="text-xs mb-1 font-semibold text-amber-600">
                  ⚠ {confirmation.shortfallL}L shortfall reconciled against expected volume
                </p>
              )}
              {confirmation?.distanceM != null && (
                <p className="text-gray-400 text-xs mb-1">Scanner was {confirmation.distanceM}m from the truck at scan time</p>
              )}
              <p className="text-gray-400 text-xs mb-8">
                📧 A delivery confirmation has been sent to <span className="font-semibold text-gray-500">{user.email}</span>
              </p>
              <button
                onClick={() => router.push('/client/orders')}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition"
              >
                Back to My Orders
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // ── Rejected ──────────────────────────────────────────────────
  if (stage === 'rejected') {
    return (
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar userRole={user.role} />
        <div className="flex-1 min-w-0">
          <Header user={user} />
          <main className="p-6 flex items-center justify-center min-h-[70vh]">
            <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center max-w-md w-full shadow-lg">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-2xl font-black text-gray-900 mb-2">Delivery Rejected</h2>
              <p className="text-gray-500 text-sm mb-1">Order #{shortOrderId(order?.id)} was rejected.</p>
              {rejectReason.trim() && (
                <p className="text-gray-400 text-xs mb-2">Reason: {rejectReason.trim()}</p>
              )}
              <p className="text-gray-400 text-xs mb-8">
                The transporter has been notified to return the fuel to the depot.
              </p>
              <button
                onClick={() => router.push('/client/orders')}
                className="w-full bg-gray-800 hover:bg-gray-900 text-white font-bold py-3 rounded-xl transition"
              >
                Back to My Orders
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // ── No order ──────────────────────────────────────────────────
  if (!order) {
    return (
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar userRole={user.role} />
        <div className="flex-1 min-w-0">
          <Header user={user} />
          <main className="p-6 flex items-center justify-center min-h-[70vh]">
            <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center max-w-md shadow-sm">
              <p className="text-4xl mb-3">📦</p>
              <p className="font-bold text-gray-900 mb-1">No delivery to scan</p>
              <p className="text-sm text-gray-500 mb-5">This page activates when your truck has arrived at your location.</p>
              <button onClick={() => router.push('/client/orders')} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition">
                View My Orders
              </button>
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
          <div className="max-w-lg mx-auto space-y-5">

            <div>
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Delivery Confirmation</p>
              <h1 className="text-2xl font-black text-gray-900">Scan QR Code</h1>
              <p className="text-sm text-gray-500 mt-0.5">Verify the truck and confirm receipt of fuel</p>
            </div>

            {/* Order details */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400">Order</p>
                  <p className="font-bold text-gray-900">#{shortOrderId(order.id)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Fuel</p>
                  <p className="font-bold text-gray-900">{order.volume?.toLocaleString()}L {order.fuelType}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Destination</p>
                  <p className="font-bold text-gray-900">{order.destinationName ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Status</p>
                  <p className="font-bold text-emerald-600">
                    {stage === 'review' ? 'Verified — review fuel' : 'Arrived — awaiting scan'}
                  </p>
                </div>
              </div>
            </div>

            {/* Camera / Scanner area */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">

              {/* Camera view */}
              {stage === 'camera' && (
                <div className="relative bg-black">
                  <video
                    ref={videoRef}
                    className="w-full max-h-72 object-cover"
                    playsInline
                    muted
                  />
                  {/* Scan overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    {/* Dimmed surround */}
                    <div className="absolute inset-0 bg-black/40" />
                    {/* Viewfinder box */}
                    <div className="relative w-52 h-52 z-10">
                      {/* Corner brackets */}
                      {[
                        'top-0 left-0 border-t-4 border-l-4 rounded-tl-lg',
                        'top-0 right-0 border-t-4 border-r-4 rounded-tr-lg',
                        'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg',
                        'bottom-0 right-0 border-b-4 border-r-4 rounded-br-lg',
                      ].map((cls, i) => (
                        <div key={i} className={`absolute w-8 h-8 border-white ${cls}`} />
                      ))}
                      {/* Scan line */}
                      <div className="absolute inset-x-0 h-0.5 bg-blue-400 opacity-90 animate-scanline" />
                    </div>
                  </div>
                  {/* Hint */}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-4 py-3 text-center">
                    <p className="text-white text-sm font-medium">{scanHint}</p>
                  </div>
                </div>
              )}

              {/* Processing state */}
              {stage === 'processing' && (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <div className="w-14 h-14 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                  <p className="text-sm font-semibold text-gray-700">Confirming delivery…</p>
                  <p className="text-xs text-gray-400">Updating order</p>
                </div>
              )}

              {/* Review state — verified truck, inspect fuel, accept or reject */}
              {stage === 'review' && (
                <div className="p-5 space-y-4">
                  {/* Verified banner */}
                  <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                    <span className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    <div>
                      <p className="text-sm font-bold text-emerald-800">Truck verified</p>
                      <p className="text-xs text-emerald-600">{truck?.registrationNumber} matched your order</p>
                    </div>
                  </div>

                  {/* Per-compartment fuel status (same readout as Fleet Monitoring) */}
                  <div className="border border-gray-200 rounded-xl p-3">
                    <CompartmentFuel order={order} />
                  </div>

                  <p className="text-xs text-gray-500 text-center">
                    Review the fuel delivered in each compartment, then accept or reject this delivery.
                  </p>

                  {/* Optional rejection reason */}
                  {rejecting && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
                      <label className="block text-xs font-semibold text-red-700">
                        Reason for rejection (optional)
                      </label>
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        rows={2}
                        placeholder="e.g. Volume short, wrong fuel type, contamination…"
                        className="w-full text-sm border border-red-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-300 focus:outline-none resize-none"
                      />
                    </div>
                  )}

                  {/* Actions */}
                  {!rejecting ? (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setRejecting(true)}
                        className="border border-red-300 text-red-700 font-bold py-3 rounded-xl text-sm hover:bg-red-50 transition"
                      >
                        Reject
                      </button>
                      <button
                        onClick={confirmDelivery}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm transition"
                      >
                        Accept Delivery
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => { setRejecting(false); setRejectReason(''); }}
                        className="border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl text-sm hover:bg-gray-50 transition"
                      >
                        Back
                      </button>
                      <button
                        onClick={rejectDelivery}
                        className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl text-sm transition"
                      >
                        Confirm Rejection
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Idle state — prompt to open camera */}
              {stage === 'idle' && (
                <div className="p-8 text-center">
                  {/* Scan icon */}
                  <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                    <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
                    </svg>
                  </div>

                  <p className="font-bold text-gray-900 mb-1 text-sm">Verify your delivery</p>
                  <p className="text-xs text-gray-400 mb-6 max-w-xs mx-auto">
                    Point your camera at the QR code on the arriving truck. We&apos;ll automatically check it matches your order before confirming receipt.
                  </p>

                  {camError && (
                    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 mb-4 text-sm text-red-700">
                      {camError}
                    </div>
                  )}

                  <button
                    onClick={openCamera}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition flex items-center justify-center gap-2.5"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Open Camera to Scan
                  </button>
                </div>
              )}

              {/* Cancel button while the camera scans continuously */}
              {stage === 'camera' && (
                <div className="p-4">
                  <button
                    onClick={() => { stopCamera(); setStage('idle'); }}
                    className="w-full border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl text-sm hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Hidden canvas for frame processing */}
            <canvas ref={canvasRef} className="hidden" />

          </div>
        </main>
      </div>
    </div>
  );
}
