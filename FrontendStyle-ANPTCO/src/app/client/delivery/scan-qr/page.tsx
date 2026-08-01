'use client';

import { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import jsQR from 'jsqr';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api, type ApiOrder, type ApiTruckPosition } from '@/src/lib/api';

const TruckMap = dynamic(() => import('@/src/components/TruckMap'), { ssr: false });

function ScanQRContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const paramOrderId = searchParams.get('orderId') ?? '';
  const user         = getCurrentUser();

  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef    = useRef<number>(0);

  const [arrivedOrders,  setArrivedOrders]  = useState<ApiOrder[]>([]);
  const [order,          setOrder]          = useState<ApiOrder | null>(null);
  const [scanning,       setScanning]       = useState(false);
  const [cameraError,    setCameraError]    = useState<string | null>(null);
  const [scannedTruckId, setScannedTruckId] = useState<string | null>(null);
  const [truckPosition,  setTruckPosition]  = useState<ApiTruckPosition | null>(null);
  const [manualTruckId,  setManualTruckId]  = useState('');
  const [confirming,     setConfirming]     = useState(false);
  const [done,           setDone]           = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [loading,        setLoading]        = useState(true);

  // Load orders on mount
  useEffect(() => {
    if (!user) { router.replace('/auth/login'); return; }

    if (paramOrderId) {
      api.orders.get(paramOrderId)
        .then(o => { setOrder(o); setLoading(false); })
        .catch(e => { setError(e.message ?? 'Failed to load order'); setLoading(false); });
    } else {
      api.orders.list()
        .then(orders => {
          const arrived = orders.filter(o => o.status === 'ARRIVED');
          setArrivedOrders(arrived);
          if (arrived.length === 1) setOrder(arrived[0]);
          setLoading(false);
        })
        .catch(e => { setError(e.message ?? 'Failed to load orders'); setLoading(false); });
    }
  }, [paramOrderId, router, user]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  const handleScannedValue = useCallback(async (raw: string) => {
    // Keep the full token — the backend verifies the HMAC and extracts the truck ID.
    // Also extract the UUID portion to fetch live position for display.
    const token     = raw.trim();
    const uuidMatch = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    const truckId   = uuidMatch ? uuidMatch[0] : '';
    setScannedTruckId(token);
    if (truckId) {
      try {
        const pos = await api.trucks.getPosition(truckId);
        setTruckPosition(pos);
      } catch {
        setTruckPosition(null);
      }
    }
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);

      const tick = () => {
        const video  = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { rafRef.current = requestAnimationFrame(tick); return; }
        ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code      = jsQR(imageData.data, imageData.width, imageData.height);
        if (code?.data) {
          stopCamera();
          handleScannedValue(code.data);
        } else {
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      tick();
    } catch {
      setCameraError('Camera not available — use manual entry below.');
    }
  }, [handleScannedValue, stopCamera]);

  const confirm = async (token: string) => {
    if (!order) return;
    setConfirming(true);
    setError(null);
    try {
      await api.orders.acceptDelivery(order.id, token);
      stopCamera();
      setDone(true);
    } catch (e: any) {
      setError(e.message ?? 'Failed to confirm delivery');
    } finally {
      setConfirming(false);
    }
  };

  const resetScan = () => {
    setScannedTruckId(null);
    setTruckPosition(null);
    setManualTruckId('');
  };

  if (!user) return null;

  // ── Done screen ──────────────────────────────────────────────
  if (done) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar role="CLIENT" />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header title="Delivery Confirmed" user={user} />
          <main className="flex-1 flex items-center justify-center p-6">
            <div className="text-center max-w-sm">
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Delivery Complete!</h2>
              <p className="text-slate-500 text-sm mb-6">Your fuel has been delivered and confirmed.</p>
              <button onClick={() => router.push('/client/orders')}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
                View Orders
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // ── Main page ────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="CLIENT" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Confirm Delivery" user={user} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-md mx-auto space-y-4">

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
            )}

            {loading && (
              <div className="text-center py-12 text-slate-400 text-sm">Loading…</div>
            )}

            {/* Empty state */}
            {!loading && !order && arrivedOrders.length === 0 && (
              <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
                <div className="text-3xl mb-3">📦</div>
                <p className="text-slate-600 font-semibold mb-1">No deliveries in progress</p>
                <p className="text-slate-400 text-sm">Orders appear here once the truck arrives at your station.</p>
              </div>
            )}

            {/* Order picker */}
            {!loading && !order && arrivedOrders.length > 1 && (
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
                <h3 className="font-semibold text-slate-800">Select order to confirm</h3>
                <div className="space-y-2">
                  {arrivedOrders.map(o => (
                    <button key={o.id} onClick={() => setOrder(o)}
                      className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
                      <p className="font-semibold text-sm text-slate-800">#{o.id.slice(-6).toUpperCase()}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {o.volume_liters?.toLocaleString()} L · {o.fuel_type}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Order selected */}
            {order && (
              <>
                {/* Order summary card */}
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <p className="text-xs text-slate-500 mb-1">Confirming delivery for</p>
                  <p className="font-bold text-slate-800">#{order.id.slice(-6).toUpperCase()}</p>
                  {order.volume_liters != null && (
                    <p className="text-sm text-slate-600 mt-1">{order.volume_liters.toLocaleString()} L · {order.fuel_type}</p>
                  )}
                  {arrivedOrders.length > 1 && (
                    <button onClick={() => { setOrder(null); resetScan(); }}
                      className="text-xs text-blue-600 mt-2 hover:underline">
                      ← Choose different order
                    </button>
                  )}
                </div>

                {/* Camera scanner (shown before scan) */}
                {!scannedTruckId && (
                  <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                    <p className="text-sm font-semibold text-slate-700">Scan QR Code on the Truck</p>

                    {/* Viewfinder */}
                    <div className="relative bg-black rounded-xl overflow-hidden" style={{ aspectRatio: '1' }}>
                      <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                      <canvas ref={canvasRef} className="hidden" />

                      {/* Idle overlay */}
                      {!scanning && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
                          <span className="text-4xl">📷</span>
                          <button onClick={startCamera}
                            className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700">
                            Start Camera
                          </button>
                        </div>
                      )}

                      {/* Scanning reticle */}
                      {scanning && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="relative w-52 h-52">
                            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-teal-400 rounded-tl-lg" />
                            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-teal-400 rounded-tr-lg" />
                            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-teal-400 rounded-bl-lg" />
                            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-teal-400 rounded-br-lg" />
                          </div>
                        </div>
                      )}
                    </div>

                    {scanning && (
                      <button onClick={stopCamera}
                        className="w-full py-2 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">
                        Cancel Scan
                      </button>
                    )}

                    {cameraError && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        {cameraError}
                      </p>
                    )}

                    {/* Divider */}
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-slate-100" />
                      </div>
                      <div className="relative flex justify-center">
                        <span className="text-xs text-slate-400 bg-white px-2">or enter manually</span>
                      </div>
                    </div>

                    {/* Manual entry */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={manualTruckId}
                        onChange={e => setManualTruckId(e.target.value)}
                        placeholder="Paste truck UUID…"
                        className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                      <button
                        onClick={() => handleScannedValue(manualTruckId)}
                        disabled={!manualTruckId.trim()}
                        className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-200 disabled:opacity-40"
                      >
                        Use
                      </button>
                    </div>
                  </div>
                )}

                {/* Scanned result + fuel info */}
                {scannedTruckId && (
                  <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="text-green-600 text-xl">✓</span>
                      <p className="text-sm font-semibold text-slate-700">Truck Identified</p>
                    </div>
                    <p className="text-[11px] font-mono text-slate-500 break-all bg-slate-50 rounded-lg px-3 py-2">
                      {scannedTruckId}
                    </p>

                    {/* Fuel summary */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-blue-50 rounded-xl p-3">
                        <p className="text-xs text-blue-600 font-semibold mb-1">Your Order</p>
                        <p className="text-xl font-bold text-blue-800">
                          {order.volume_liters != null ? order.volume_liters.toLocaleString() : '—'} L
                        </p>
                        <p className="text-xs text-blue-500 mt-0.5">{order.fuel_type ?? 'Fuel'}</p>
                      </div>
                      <div className="bg-teal-50 rounded-xl p-3">
                        <p className="text-xs text-teal-600 font-semibold mb-1">Truck On Board</p>
                        <p className="text-xl font-bold text-teal-800">
                          {truckPosition?.total_fuel_liters != null
                            ? Number(truckPosition.total_fuel_liters).toLocaleString()
                            : 'N/A'} L
                        </p>
                        <p className="text-xs text-teal-500 mt-0.5">Total fuel</p>
                      </div>
                    </div>

                    {/* Compartment breakdown */}
                    {truckPosition?.compartment_fuel &&
                      Object.keys(truckPosition.compartment_fuel).length > 0 && (
                      <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
                        <p className="text-xs font-semibold text-slate-600 mb-2">Compartments</p>
                        {Object.entries(truckPosition.compartment_fuel).map(([k, v]) => (
                          <div key={k} className="flex justify-between text-xs text-slate-600">
                            <span>{k}</span>
                            <span className="font-mono font-semibold">{Number(v).toLocaleString()} L</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Truck location map */}
                    {truckPosition?.latitude != null && truckPosition?.longitude != null ? (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-slate-600">Truck Location</p>
                        <TruckMap
                          lat={truckPosition.latitude}
                          lng={truckPosition.longitude}
                          label={`Truck · ${truckPosition.latitude.toFixed(5)}, ${truckPosition.longitude.toFixed(5)}`}
                        />
                        <p className="text-[11px] text-slate-400 text-center">
                          {truckPosition.latitude.toFixed(5)}, {truckPosition.longitude.toFixed(5)}
                          {truckPosition.speed != null && ` · ${truckPosition.speed} km/h`}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 text-center py-1">Truck location not available</p>
                    )}

                    <button
                      onClick={() => confirm(scannedTruckId)}
                      disabled={confirming}
                      className="w-full py-3 rounded-lg bg-teal-600 text-white font-semibold text-sm hover:bg-teal-700 disabled:opacity-50"
                    >
                      {confirming ? 'Confirming…' : 'Confirm Delivery'}
                    </button>

                    <button onClick={resetScan}
                      className="w-full py-2 text-sm text-slate-400 hover:text-slate-600 hover:underline">
                      Scan again
                    </button>
                  </div>
                )}

                {!scannedTruckId && (
                  <button onClick={() => router.back()}
                    className="w-full py-2.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                    Cancel
                  </button>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function ScanQRPage() {
  return (
    <Suspense>
      <ScanQRContent />
    </Suspense>
  );
}
