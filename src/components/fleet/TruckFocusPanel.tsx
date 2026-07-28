'use client';

import dynamic from 'next/dynamic';
import CompartmentFuel from '@/src/components/fleet/CompartmentFuel';
import OrderTimeline from '@/src/components/orders/OrderTimeline';
import CopyId from '@/src/components/ui/CopyId';
import {
  destinationCoords, FIXED_DEPOT, JOURNEY_DURATION_MS, shortOrderId,
  destinationGeofenceRadiusM, getGeofenceDebounceState,
} from '@/src/lib/demo-data';
import { GEOFENCE_DEBOUNCE_TICKS } from '@/src/lib/geo';
import { getCachedRoadRoute } from '@/src/lib/route-geometry';
import { getHistory } from '@/src/lib/telemetry-store';
import DeliveryQrPanel from '@/src/components/qr/DeliveryQrPanel';

// Leaflet touches `window`, so load the map only on the client.
const LiveTrackingMap = dynamic(() => import('@/src/components/maps/LiveTrackingMap'), {
  ssr: false,
  loading: () => <div className="w-full h-[560px] flex items-center justify-center text-sm text-gray-400">Loading map…</div>,
});
const RouteReplayMap = dynamic(() => import('@/src/components/fleet/RouteReplayMap'), {
  ssr: false,
  loading: () => <div className="w-full h-[220px] flex items-center justify-center text-sm text-gray-400">Loading route…</div>,
});

const STATUS_BADGE: Record<string, string> = {
  IDLE:      'bg-emerald-100 text-emerald-700',
  ASSIGNED:  'bg-indigo-100  text-indigo-700',
  LOADING:   'bg-cyan-100    text-cyan-700',
  LOADED:    'bg-sky-100     text-sky-700',
  EN_ROUTE:  'bg-blue-100    text-blue-700',
  ARRIVED:   'bg-teal-100    text-teal-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
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
  const moving = order && ['EN_ROUTE', 'ARRIVED'].includes(order.status);

  const journeys = moving
    ? [{
        id:         order.id,
        truckReg:   order.assignedTruckRegistration || reg,
        status:     order.status,
        depot:      { lat: FIXED_DEPOT.lat, lng: FIXED_DEPOT.lng, name: FIXED_DEPOT.name },
        dest:       (() => { const d = destinationCoords(order); return { lat: d.lat, lng: d.lng, name: order.destinationName || 'Destination' }; })(),
        startedAt:  order.tripStartedAt ? new Date(order.tripStartedAt).getTime() : Date.now(),
        durationMs: JOURNEY_DURATION_MS,
      }]
    : [];

  // Placeholder shown in place of the map when the truck isn't on the road.
  const placeholder = (() => {
    if (!order)                        return { icon: '🅿️', title: 'Idle at depot', sub: 'No active order assigned' };
    if (status === 'ASSIGNED')         return { icon: '🏭', title: 'At depot', sub: 'Awaiting fuel loading' };
    if (status === 'LOADING')          return { icon: '🛢️', title: 'At depot', sub: 'Loading fuel into compartments' };
    if (status === 'LOADED')           return { icon: '🛢️', title: 'At depot', sub: 'Loaded — ready to depart' };
    if (status === 'COMPLETED')        return { icon: '✅', title: `Delivered at ${order.destinationName ?? 'station'}`, sub: 'Offloading complete' };
    return { icon: '🗺️', title: 'Not tracking', sub: '' };
  })();

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

      {/* Geofence debounce readout — real haversine distance + N-consecutive-fix
          debounce (plan §7), not a flat timer. Only meaningful while en route. */}
      {order?.status === 'EN_ROUTE' && (() => {
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

      {/* Route replay — drawn from real recorded telemetry_history (plan §5), not the live interpolation above */}
      {order && truck && ['ARRIVED', 'COMPLETED'].includes(order.status) && (
        <div className="rounded-xl overflow-hidden border border-gray-200">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide px-4 pt-3">Route Replay (recorded telemetry)</p>
          <RouteReplayMap
            points={getHistory(truck.id).map(p => ({ lat: p.lat, lng: p.lng }))}
            roadRoute={getCachedRoadRoute(FIXED_DEPOT, destinationCoords(order))}
            className="w-full h-[220px]"
          />
        </div>
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
