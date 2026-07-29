'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import CompartmentFuel from '@/src/components/fleet/CompartmentFuel';
import OrderTimeline from '@/src/components/orders/OrderTimeline';
import CopyId from '@/src/components/ui/CopyId';
import {
  destinationCoords, FIXED_DEPOT, JOURNEY_DURATION_MS, shortOrderId,
  destinationGeofenceRadiusM, getGeofenceDebounceState, getFuelAnomalies, updateFuelAnomaly,
  STOP_ALERT_MS,
} from '@/src/lib/demo-data';
import { GEOFENCE_DEBOUNCE_TICKS } from '@/src/lib/geo';
import { getLiveState } from '@/src/lib/telemetry-store';
import DeliveryQrPanel from '@/src/components/qr/DeliveryQrPanel';

// Leaflet touches `window`, so load the map only on the client.
const LiveTrackingMap = dynamic(() => import('@/src/components/maps/LiveTrackingMap'), {
  ssr: false,
  loading: () => <div className="w-full h-[560px] flex items-center justify-center text-sm text-gray-400">Loading map…</div>,
});

const STATUS_BADGE: Record<string, string> = {
  IDLE:      'bg-emerald-100 text-emerald-700',
  ASSIGNED:  'bg-indigo-100  text-indigo-700',
  LOADING:   'bg-cyan-100    text-cyan-700',
  LOADED:    'bg-sky-100     text-sky-700',
  EN_ROUTE:  'bg-blue-100    text-blue-700',
  ARRIVED:   'bg-teal-100    text-teal-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  DELIVERY_FAILED: 'bg-red-100 text-red-700',
  TRIP_EXCEPTION:  'bg-orange-100 text-orange-700',
};

const ANOMALY_STATUS_STYLE: Record<string, string> = {
  OPEN:      'bg-red-500     text-white',
  REVIEWING: 'bg-yellow-500  text-white',
  RESOLVED:  'bg-emerald-500 text-white',
};

/**
 * One truck, watched live — map-first: a compact header, a large journey map (or
 * depot/idle placeholder), then a compact per-compartment fuel strip and the
 * event timeline below. Shared by the seller and transporter Fleet Monitor pages.
 */
export default function TruckFocusPanel({ order, truck }: { order: any; truck?: any }) {
  const reg    = truck?.registrationNumber ?? order?.assignedTruckRegistration ?? 'Truck';
  const driver = order?.assignedDriverName ?? '—';
  const status = order?.status ?? truck?.status ?? 'IDLE';
  const noSignal = order?.telemetryStatus === 'NO_SIGNAL';

  // A 1s local clock so "stopped Ns ago" counts up smoothly between the
  // ~3s backend polls, instead of jumping in visible steps.
  const [liveNow, setLiveNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setLiveNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const stoppedElapsedMs = order?.stoppedAt ? liveNow - new Date(order.stoppedAt).getTime() : null;
  const stoppedTooLong = stoppedElapsedMs !== null && stoppedElapsedMs >= STOP_ALERT_MS;
  // Still stopped and not yet failed by the backend — the live client clock
  // can cross the 30s mark a moment before the next ~3s poll confirms it.
  const stoppedActive = order?.stoppedAt && order.status === 'EN_ROUTE';

  const lastFix = truck && noSignal ? getLiveState(truck.id) : undefined;

  // Alerts get their own section below (banners), not the map — the map
  // keeps showing the same depot/destination/route context throughout, with
  // the truck marker frozen at its actual last-known/stopped point instead
  // of the road interpolation continuing to (mis)animate it once we've lost
  // track of where it really is.
  const frozenPosition = order?.stoppedAt
    ? { lat: order.stoppedLat, lng: order.stoppedLng }
    : noSignal && lastFix
    ? { lat: lastFix.lat, lng: lastFix.lng }
    : undefined;
  const moving = order && ['EN_ROUTE', 'ARRIVED'].includes(order.status) && (!noSignal || !!lastFix);

  const journeys = moving
    ? [{
        id:         order.id,
        truckReg:   order.assignedTruckRegistration || reg,
        status:     order.status,
        depot:      { lat: FIXED_DEPOT.lat, lng: FIXED_DEPOT.lng, name: FIXED_DEPOT.name },
        dest:       (() => { const d = destinationCoords(order); return { lat: d.lat, lng: d.lng, name: order.destinationName || 'Destination' }; })(),
        startedAt:  order.tripStartedAt ? new Date(order.tripStartedAt).getTime() : Date.now(),
        durationMs: JOURNEY_DURATION_MS,
        frozenPosition,
      }]
    : [];

  // Placeholder shown in place of the map when the truck isn't on the road.
  const placeholder = (() => {
    if (!order)                        return { icon: '🅿️', title: 'Idle at depot', sub: 'No active order assigned' };
    if (status === 'ASSIGNED')         return { icon: '🏭', title: 'At depot', sub: 'Awaiting fuel loading' };
    if (status === 'LOADING')          return { icon: '🛢️', title: 'At depot', sub: 'Loading fuel into compartments' };
    if (status === 'LOADED')           return { icon: '🛢️', title: 'At depot', sub: 'Loaded — ready to depart' };
    if (status === 'COMPLETED')        return { icon: '✅', title: `Delivered at ${order.destinationName ?? 'station'}`, sub: 'Offloading complete' };
    if (status === 'DELIVERY_FAILED')  return { icon: '🚨', title: 'Delivery failed', sub: 'Unauthorized activity detected — trip aborted' };
    if (status === 'TRIP_EXCEPTION')   return { icon: '🚪', title: 'Trip exception', sub: 'Left the destination geofence without confirming delivery' };
    // stoppedActive and "no signal with a last fix" both keep the map itself
    // rendering (frozen marker via frozenPosition) instead of landing here —
    // this only covers the edge case of no signal with no position ever recorded.
    if (noSignal)                      return {
      icon: '📡',
      title: 'No GPS signal',
      sub: 'No position ever recorded for this trip',
    };
    return { icon: '🗺️', title: 'Not tracking', sub: '' };
  })();

  const anomaly = order?.status === 'DELIVERY_FAILED'
    ? getFuelAnomalies().filter(a => a.orderId === order.id).sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())[0]
    : null;

  // Optimistic override so Review/Resolve feels instant instead of waiting
  // for the parent's ~3s poll to re-fetch the anomaly from storage.
  const [ackOverride, setAckOverride] = useState<{ id: string; status: string } | null>(null);
  useEffect(() => { setAckOverride(null); }, [anomaly?.id]);
  const anomalyStatus = anomaly && ackOverride?.id === anomaly.id ? ackOverride.status : anomaly?.status;
  const acknowledge = (nextStatus: 'REVIEWING' | 'RESOLVED') => {
    if (!anomaly) return;
    updateFuelAnomaly(anomaly.id, { status: nextStatus });
    setAckOverride({ id: anomaly.id, status: nextStatus });
  };

  return (
    <div className="space-y-3">
      {/* Header — truck identity only */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-xl flex-shrink-0">🚛</div>
        <CopyId value={reg} className="font-black text-gray-900 text-lg" />
        <span className={`ml-auto text-xs font-bold px-3 py-1 rounded-full flex-shrink-0 ${STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-600'}`}>
          {String(status).replace(/_/g, ' ')}
        </span>
      </div>

      {/* BIG MAP (moving) or depot/idle placeholder */}
      <div className="rounded-xl overflow-hidden border border-gray-200">
        {moving ? (
          <LiveTrackingMap journeys={journeys} className="w-full h-[560px]" />
        ) : (
          <div className="w-full h-[320px] bg-slate-50 flex flex-col items-center justify-center text-center">
            <p className="text-4xl mb-2">{placeholder.icon}</p>
            <p className="text-sm font-semibold text-gray-700">{placeholder.title}</p>
            {placeholder.sub && <p className="text-xs text-gray-400 mt-1">{placeholder.sub}</p>}
          </div>
        )}
      </div>

      {/* Unauthorized-activity alert — the trip was failed, not just flagged */}
      {order?.status === 'DELIVERY_FAILED' && (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🚨</span>
              <p className="font-bold text-red-800 text-sm">Fuel theft detected — delivery aborted</p>
            </div>
            {anomaly && (
              <span className="text-[10px] font-black text-white bg-red-600 px-2 py-0.5 rounded-full flex-shrink-0">{anomaly.severity}</span>
            )}
          </div>

          {anomaly && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-white/60 rounded-lg px-2 py-2 text-center">
                <p className="text-base font-black text-red-700">
                  {anomaly.fuelDropPercent != null ? `−${anomaly.fuelDropPercent}%` : `−${anomaly.fuelDropLiters.toLocaleString()}L`}
                </p>
                <p className="text-[10px] text-red-600">decrease from total</p>
              </div>
              <div className="bg-white/60 rounded-lg px-2 py-2 text-center">
                <p className="text-base font-black text-red-700">&gt;{Math.round(STOP_ALERT_MS / 1000)}s</p>
                <p className="text-[10px] text-red-600">stopped, ignition off</p>
              </div>
              <div className="bg-white/60 rounded-lg px-2 py-2 text-center">
                <p className="text-base font-black text-red-700">{new Date(anomaly.detectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                <p className="text-[10px] text-red-600">detected</p>
              </div>
            </div>
          )}

          <p className="text-xs text-red-700">Outside any authorized geofence — trip aborted automatically.</p>

          {anomaly && (
            <div className="flex items-center justify-between gap-3 mt-3">
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${ANOMALY_STATUS_STYLE[anomalyStatus ?? 'OPEN']}`}>
                {anomalyStatus}
              </span>
              {anomalyStatus === 'OPEN' && (
                <button
                  onClick={() => acknowledge('REVIEWING')}
                  className="text-xs font-bold text-gray-800 bg-white hover:bg-gray-50 border border-black/10 px-3 py-1.5 rounded-lg shadow-sm transition"
                >
                  Mark as Reviewing
                </button>
              )}
              {anomalyStatus === 'REVIEWING' && (
                <button
                  onClick={() => acknowledge('RESOLVED')}
                  className="text-xs font-bold text-gray-800 bg-white hover:bg-gray-50 border border-black/10 px-3 py-1.5 rounded-lg shadow-sm transition"
                >
                  Mark Resolved
                </button>
              )}
            </div>
          )}

          <DriverContactStrip name={order.assignedDriverName} phone={order.assignedDriverPhone} />
        </div>
      )}

      {/* Vehicle stopped — live countdown while under the alert threshold,
          escalates to a red alert once stopped too long (plan-adjacent: this
          is what triggers the automatic theft evaluation below). */}
      {stoppedActive && (
        <div className={`border-2 rounded-xl p-4 ${stoppedTooLong ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{stoppedTooLong ? '🚨' : '🛑'}</span>
            <p className={`font-bold text-sm ${stoppedTooLong ? 'text-red-800' : 'text-amber-800'}`}>
              {stoppedTooLong
                ? `Vehicle stopped at this position for more than ${Math.round(STOP_ALERT_MS / 1000)} seconds`
                : 'Vehicle stopped — monitoring'}
            </p>
          </div>
          <p className={`text-xs ${stoppedTooLong ? 'text-red-700' : 'text-amber-700'}`}>
            Stationary for {Math.max(0, Math.floor((stoppedElapsedMs ?? 0) / 1000))}s, engine off, outside any authorized geofence.
            {stoppedTooLong ? ' Evaluating for unauthorized activity…' : ` Alert fires at ${Math.round(STOP_ALERT_MS / 1000)}s if it doesn't move.`}
          </p>
          <DriverContactStrip name={order.assignedDriverName} phone={order.assignedDriverPhone} />
        </div>
      )}

      {/* Trip exception — reached the destination but left again unconfirmed */}
      {order?.status === 'TRIP_EXCEPTION' && (
        <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🚪</span>
            <p className="font-bold text-orange-800 text-sm">Trip exception — left without confirming</p>
          </div>
          {order.exceptionReason && <p className="text-xs text-orange-700">{order.exceptionReason}</p>}
          <DriverContactStrip name={order.assignedDriverName} phone={order.assignedDriverPhone} />
        </div>
      )}

      {/* No GPS signal — position/geofence tracking is frozen, not just stale */}
      {noSignal && (
        <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">📡</span>
            <p className="font-bold text-orange-800 text-sm">No GPS signal — tracking paused</p>
          </div>
          <p className="text-xs text-orange-700">
            Device went offline{order.noSignalSince ? ` at ${new Date(order.noSignalSince).toLocaleTimeString()}` : ''} — position and geofence checks are frozen until signal returns.
          </p>
          <DriverContactStrip name={order?.assignedDriverName} phone={order?.assignedDriverPhone} />
        </div>
      )}

      {/* Geofence debounce readout — real haversine distance + N-consecutive-fix
          debounce (plan §7), not a flat timer. Only meaningful while en route
          with a live signal — frozen/absent otherwise, same as position. */}
      {order?.status === 'EN_ROUTE' && !noSignal && !order?.stoppedAt && (() => {
        const debounce = getGeofenceDebounceState(order.id);
        const insideCount = debounce.side === 'INSIDE' ? GEOFENCE_DEBOUNCE_TICKS : debounce.pendingSide === 'INSIDE' ? debounce.pendingCount : 0;
        return (
          <div className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <span className="text-gray-500">Geofence debounce (radius {destinationGeofenceRadiusM(order)}m):</span>
            <span className="font-bold text-gray-800">{insideCount}/{GEOFENCE_DEBOUNCE_TICKS} fixes inside</span>
          </div>
        );
      })()}

      {/* Signed delivery QR — rotates on a timer, bound to this trip (plan §8) */}
      {order && ['EN_ROUTE', 'ARRIVED'].includes(order.status) && (
        <DeliveryQrPanel tripId={order.id} />
      )}

      {/* Compact compartment fuel */}
      <CompartmentFuel order={order ?? null} compact />

      {/* Details + timeline — split within one card, using the full width */}
      {order && (
        <div className="rounded-xl border border-gray-200 grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
          {/* Left — metadata */}
          <div className="p-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Delivery Details</p>
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-start gap-3">
                <dt className="text-gray-400 w-24 flex-shrink-0">Driver</dt>
                <dd className="font-semibold text-gray-900 truncate">{driver}</dd>
              </div>
              <div className="flex items-start gap-3">
                <dt className="text-gray-400 w-24 flex-shrink-0">Order</dt>
                <dd className="font-semibold text-gray-900">
                  <CopyId value={shortOrderId(order.id)} label={`#${shortOrderId(order.id)}`} />
                </dd>
              </div>
              <div className="flex items-start gap-3">
                <dt className="text-gray-400 w-24 flex-shrink-0">Cargo</dt>
                <dd className="font-semibold text-gray-900 truncate">{order.volume?.toLocaleString()}L {order.fuelType}</dd>
              </div>
              <div className="flex items-start gap-3">
                <dt className="text-gray-400 w-24 flex-shrink-0">Destination</dt>
                <dd className="font-semibold text-gray-900 truncate">{order.destinationName ?? '—'}</dd>
              </div>
              <div className="flex items-start gap-3">
                <dt className="text-gray-400 w-24 flex-shrink-0">Client</dt>
                <dd className="font-semibold text-gray-900 truncate">{order.clientName ?? '—'}</dd>
              </div>
              {order.erpDispatchNo && (
                <div className="flex items-start gap-3">
                  <dt className="text-gray-400 w-24 flex-shrink-0">Order Ref</dt>
                  <dd className="font-mono text-gray-900 truncate">{order.erpDispatchNo}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Right — event timeline */}
          <div className="p-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
              Event Timeline · #{shortOrderId(order.id)}
            </p>
            <OrderTimeline order={order} showHeader={false} />
          </div>
        </div>
      )}
    </div>
  );
}

// Every alert state (theft, stopped-too-long, exception, no-signal) ends the
// same way in real life: someone has to call the driver. Surfacing the name
// + a tap-to-dial number right on the alert saves a trip to Delivery Details.
function DriverContactStrip({ name, phone }: { name?: string; phone?: string }) {
  if (!name && !phone) return null;
  return (
    <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-black/10">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-7 h-7 rounded-full bg-white/70 flex items-center justify-center text-sm flex-shrink-0">👤</span>
        <div className="min-w-0">
          <p className="text-xs font-bold text-gray-800 truncate">{name ?? 'Driver'}</p>
          {phone && <p className="text-[11px] text-gray-500 truncate">{phone}</p>}
        </div>
      </div>
      {phone && (
        <a
          href={`tel:${phone}`}
          className="flex-shrink-0 flex items-center gap-1.5 text-xs font-bold text-gray-800 bg-white hover:bg-gray-50 border border-black/10 px-3 py-1.5 rounded-lg shadow-sm transition"
        >
          📞 Call driver
        </a>
      )}
    </div>
  );
}
