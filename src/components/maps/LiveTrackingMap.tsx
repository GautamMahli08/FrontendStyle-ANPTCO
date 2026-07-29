'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { escapeHtml } from '@/src/lib/utils';
// Road geometry is shared with the theft scenario in demo-data, which has to stop a
// truck on the same road this map draws it on — see src/lib/route-geometry.ts.
import {
  ensureRoadRoute, getCachedRoadRoute, routeCacheKey, routePosition, straightPath,
} from '@/src/lib/route-geometry';

/**
 * LiveTrackingMap — real (OpenStreetMap / Leaflet) map showing trucks driving from
 * the ANPTCO depot to their destination stations. Each truck's position is
 * interpolated from its journey progress and updated a few times a second, so the
 * seller sees the truck move along the route in real time.
 *
 * Must be imported with `next/dynamic` + `ssr: false` (Leaflet touches `window`).
 */

export type Journey = {
  id: string;
  truckReg: string;
  status: string;                                   // EN_ROUTE | ARRIVED
  depot: { lat: number; lng: number; name: string; address?: string };
  /** Omit when the truck has no active delivery — it just parks, no route drawn. */
  dest?: { lat: number; lng: number; name: string; address?: string };
  startedAt: number;                                // ms epoch
  durationMs: number;

  // ── Fleet-overview extras (unused by the single-truck focus view) ──
  /** Where to park the truck before it departs. Defaults to the depot. */
  at?: { lat: number; lng: number };
  /**
   * Truck has halted mid-route (unauthorized stop) — pin it at `at` instead of
   * letting elapsed time keep sliding it along the route toward the destination.
   */
  halted?: boolean;
  /** Small lat/lng nudge so several parked trucks don't stack on one pin. */
  offset?: [number, number];
  /** HTML shown on hover. When set, replaces the click popup. */
  tooltip?: string;
  /** Draw with a red ring — this truck has an open fuel anomaly. */
  alert?: boolean;
};


function progress(j: Journey): number {
  if (j.status === 'ARRIVED') return 1;
  if (!j.startedAt) return 0;
  return Math.max(0, Math.min(1, (Date.now() - j.startedAt) / j.durationMs));
}

/**
 * Where to draw the truck. Once it's rolling it sits on the road route; before it
 * departs (or when it has no delivery at all) it parks, nudged by `offset` so a
 * yard full of trucks doesn't collapse into a single un-hoverable pin.
 */
function truckPosition(j: Journey, route: [number, number][] | null): [number, number] {
  const [dLat, dLng] = j.offset ?? [0, 0];
  if (j.halted && j.at) return [j.at.lat, j.at.lng];
  if (!j.dest || !route) {
    const parked = j.at ?? j.depot;
    return [parked.lat + dLat, parked.lng + dLng];
  }
  const t = progress(j);
  const [lat, lng] = routePosition(route, t);
  return t <= 0 ? [lat + dLat, lng + dLng] : [lat, lng];
}

/** Fuel-pump glyph used for delivery stations — drawn, not an emoji, so it renders
 *  identically on every platform and stays crisp at map scale. */
const PUMP_GLYPH = `
  <g fill="#fff">
    <path d="M8.6 8.4c0-.7.6-1.3 1.3-1.3h4.3c.7 0 1.3.6 1.3 1.3v11.9H8.6z"/>
    <rect x="7.6" y="19.7" width="8.7" height="1.9" rx=".95"/>
    <path d="M15.3 9.8h2.9a1.9 1.9 0 0 1 1.9 1.9v5.6a1.05 1.05 0 0 1-2.1 0v-4.9a.8.8 0 0 0-.8-.8h-1.9z"/>
  </g>
  <rect x="10" y="9.5" width="4.2" height="3" rx=".6" fill="currentColor"/>`;

const PIN_PATH = (bg: string) =>
  `<path d="M15 1.6C7.9 1.6 2.1 7.4 2.1 14.5c0 9.1 11.3 21.5 11.8 22a1.5 1.5 0 0 0 2.2 0c.5-.5 11.8-12.9 11.8-22C27.9 7.4 22.1 1.6 15 1.6z"
      fill="${bg}" stroke="#fff" stroke-width="2.2"/>`;

/**
 * Teardrop map pin. Drawn as an SVG path rather than a CSS-rotated square, so the
 * glyph sits upright and sharp instead of being counter-rotated 45°.
 */
function pinIcon(glyph: 'pump' | string, bg: string, size = 30) {
  const h = Math.round(size * 1.27);
  const inner = glyph === 'pump'
    ? `<svg width="${size}" height="${h}" viewBox="0 0 30 38" style="position:absolute;inset:0;color:${bg}">
         ${PIN_PATH(bg)}<g transform="translate(0,0.5)">${PUMP_GLYPH}</g>
       </svg>`
    : `<svg width="${size}" height="${h}" viewBox="0 0 30 38" style="position:absolute;inset:0">${PIN_PATH(bg)}</svg>
       <span style="position:absolute;top:${Math.round(h * 0.15)}px;left:0;width:${size}px;text-align:center;
                    font-size:${Math.round(size * 0.48)}px;line-height:1.15;">${glyph}</span>`;

  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:${size}px;height:${h}px;
      filter:drop-shadow(0 2px 4px rgba(0,0,0,.35));">${inner}</div>`,
    iconSize: [size, h],
    iconAnchor: [size / 2, h],
    popupAnchor: [0, -h],
  });
}

/** Hover card for a fixed place (the depot or a delivery station). */
function placeTooltip(name: string, kind: string, address?: string) {
  return `<div style="font-family:inherit;font-size:12px;line-height:1.5;min-width:140px">
      <b style="font-size:13px;color:#0f172a">${escapeHtml(name)}</b>
      <div style="color:#94a3b8;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em">${escapeHtml(kind)}</div>
      ${address ? `<div style="color:#64748b;margin-top:3px">📍 ${escapeHtml(address)}</div>` : ''}
    </div>`;
}

// Marker colour by what the truck is doing right now.
const TRUCK_BG: Record<string, string> = {
  ASSIGNED:  '#6366f1',
  LOADING:   '#06b6d4',
  LOADED:    '#0ea5e9',
  EN_ROUTE:  '#f59e0b',
  ARRIVED:   '#10b981',
  COMPLETED: '#10b981',
};

function truckIcon(j: Journey, clickable: boolean) {
  // A halted truck reads red regardless of the order status underneath — it is
  // still nominally "EN_ROUTE", but it is very much not en route.
  const bg     = j.halted ? '#ef4444' : TRUCK_BG[j.status] ?? '#94a3b8';   // idle / pending → slate
  const border = j.alert ? '#ef4444' : 'white';
  return L.divIcon({
    className: '',
    html: `<div style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;
      background:${bg};border-radius:9px;color:white;font-size:17px;
      box-shadow:0 3px 8px rgba(0,0,0,.35);border:2px solid ${border};
      ${clickable ? 'cursor:pointer;' : ''}">🚛</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
}

type Layer = { dest?: L.Marker; line?: L.Polyline; truck: L.Marker };

const routeKey    = (j: Journey) => routeCacheKey(j.depot, j.dest!);
const cachedRoute = (j: Journey) => (j.dest ? getCachedRoadRoute(j.depot, j.dest) : null);
const fallback    = (j: Journey) => straightPath(j.depot, j.dest!);

export default function LiveTrackingMap({
  journeys,
  className = '',
  onSelect,
}: {
  journeys: Journey[];
  className?: string;
  /** Fleet overview: called with the journey id when a truck marker is clicked. */
  onSelect?: (id: string) => void;
}) {
  const elRef     = useRef<HTMLDivElement>(null);
  const mapRef    = useRef<L.Map | null>(null);
  const depotRef  = useRef<L.Marker | null>(null);
  const layersRef = useRef<Map<string, Layer>>(new Map());
  const dataRef   = useRef<Journey[]>(journeys);
  dataRef.current = journeys;
  // Kept in a ref so the marker click handler (bound once) always sees the latest closure.
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  // ── Auto-fit ────────────────────────────────────────────────
  // The view is fitted to depot + trucks + destinations once per set of journeys.
  // After that the map is the user's: `userMovedRef` latches on the first manual
  // zoom/pan and suppresses further auto-fitting, so we never yank the view away.
  const fittedKeyRef = useRef('');
  const userMovedRef = useRef(false);
  const fittingRef   = useRef(false);   // true while WE move the map, to tell it apart from the user
  const fitAllRef    = useRef<() => void>(() => {});

  fitAllRef.current = () => {
    const map = mapRef.current;
    const js  = dataRef.current;
    if (!map || js.length === 0) return;

    const pts: [number, number][] = [[js[0].depot.lat, js[0].depot.lng]];
    js.forEach(j => {
      const route = j.dest ? (cachedRoute(j) ?? fallback(j)) : null;
      if (j.dest) pts.push([j.dest.lat, j.dest.lng]);
      if (route)  pts.push(...route);          // include the road geometry, which can bulge outside
      pts.push(truckPosition(j, route));
    });

    map.invalidateSize();                       // bounds are meaningless if the container isn't measured
    fittingRef.current = true;
    // maxZoom stops a degenerate single-point bounds (one idle truck at the depot)
    // from slamming the map to street level. animate:false keeps this synchronous,
    // so `fittingRef` reliably brackets the whole move.
    map.fitBounds(L.latLngBounds(pts), { padding: [45, 45], maxZoom: 13, animate: false });
    fittingRef.current = false;
  };

  // Re-fit whenever the SET of journeys changes (not on every position tick).
  useEffect(() => {
    const key = journeys.map(j => j.id).sort().join('|');
    if (!key || key === fittedKeyRef.current) return;
    fittedKeyRef.current = key;
    if (userMovedRef.current) return;
    fitAllRef.current();
  }, [journeys]);

  // Resolve the real road geometry for any route not already held, then snap the
  // polyline (and the truck's path) onto it. Anything cached from an earlier visit is
  // reused immediately, so returning to this page draws the road at once. Caching and
  // in-flight de-duplication both live in route-geometry.
  useEffect(() => {
    journeys.forEach(j => {
      if (!j.dest || getCachedRoadRoute(j.depot, j.dest)) return;
      const key = routeKey(j);
      ensureRoadRoute(j.depot, j.dest).then(path => {
        if (!path) return;
        // Every journey sharing this destination, not just the one that fetched it.
        dataRef.current.forEach(other => {
          if (other.dest && routeKey(other) === key) {
            layersRef.current.get(other.id)?.line?.setLatLngs(path);
          }
        });
        // The placeholder was a straight line; the real road can swing well outside it,
        // so reframe — unless the user has already taken control of the view.
        if (!userMovedRef.current) fitAllRef.current();
      });
    });
  }, [journeys]);

  // Create the map once.
  useEffect(() => {
    if (mapRef.current || !elRef.current) return;
    // Initial view is only a placeholder — the auto-fit effect reframes it to the
    // depot, trucks and destinations as soon as there are journeys to show.
    const map = L.map(elRef.current, { zoomControl: true, attributionControl: false })
      .setView([23.55, 58.15], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    mapRef.current = map;

    // Any zoom/pan we didn't initiate means the user has taken over the view.
    map.on('zoomstart dragstart', () => { if (!fittingRef.current) userMovedRef.current = true; });

    // "Fit all" — hands the overview back after the user has zoomed around.
    const fitControl = new L.Control({ position: 'topleft' });
    fitControl.onAdd = () => {
      const wrap = L.DomUtil.create('div', 'leaflet-bar');
      const btn  = L.DomUtil.create('a', '', wrap);
      btn.href = '#';
      btn.title = 'Fit depot, trucks & destinations';
      btn.innerHTML = '⛶';
      btn.style.cssText = 'font-size:15px;line-height:26px;text-align:center;text-decoration:none;';
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.on(btn, 'click', e => {
        L.DomEvent.preventDefault(e);
        userMovedRef.current = false;   // re-arm auto-fit
        fitAllRef.current();
      });
      return wrap;
    };
    fitControl.addTo(map);

    // container is sized by the parent; make sure Leaflet measures it after layout
    setTimeout(() => { map.invalidateSize(); if (!userMovedRef.current) fitAllRef.current(); }, 0);
    return () => { map.remove(); mapRef.current = null; depotRef.current = null; layersRef.current.clear(); };
  }, []);

  // Reconcile layers + animate truck positions on a fast tick.
  useEffect(() => {
    const tick = () => {
      const map = mapRef.current;
      if (!map) return;
      const js = dataRef.current;

      // Depot marker (once).
      if (!depotRef.current && js[0]) {
        const d = js[0].depot;
        depotRef.current = L.marker([d.lat, d.lng], { icon: pinIcon('🏭', '#2563eb', 34) })
          .addTo(map)
          .bindTooltip(placeTooltip(d.name, 'Depot', d.address),
            { direction: 'top', offset: [0, -39], opacity: 1 });
      }

      const clickable = !!selectRef.current;
      const seen = new Set<string>();
      js.forEach(j => {
        seen.add(j.id);
        const route = j.dest ? (cachedRoute(j) ?? fallback(j)) : null;
        const [lat, lng] = truckPosition(j, route);

        const layer = layersRef.current.get(j.id);
        if (!layer) {
          // Destination pin + planned route — only for a truck that has a delivery.
          const dest = j.dest
            ? L.marker([j.dest.lat, j.dest.lng], { icon: pinIcon('pump', '#0891b2', 30) })
                .addTo(map)
                .bindTooltip(placeTooltip(j.dest.name, 'Delivery station', j.dest.address),
                  { direction: 'top', offset: [0, -34], opacity: 1 })
            : undefined;
          const line = route
            ? L.polyline(route, { color: '#2563eb', weight: 3, dashArray: '6,8', opacity: 0.45 }).addTo(map)
            : undefined;

          const truck = L.marker([lat, lng], { icon: truckIcon(j, clickable), riseOnHover: true }).addTo(map);
          // Overview passes rich hover HTML; the focus view keeps the click popup.
          if (j.tooltip) truck.bindTooltip(j.tooltip, { direction: 'top', offset: [0, -14], opacity: 1 });
          else           truck.bindPopup(`<b>🚛 ${j.truckReg}</b>`);
          truck.on('click', () => selectRef.current?.(j.id));

          layersRef.current.set(j.id, { dest, line, truck });
        } else {
          layer.truck.setLatLng([lat, lng]);
          layer.truck.setIcon(truckIcon(j, clickable));
          if (j.tooltip) layer.truck.setTooltipContent(j.tooltip);
        }
      });

      // Drop layers for journeys that ended.
      layersRef.current.forEach((layer, id) => {
        if (!seen.has(id)) {
          layer.dest?.remove(); layer.line?.remove(); layer.truck.remove();
          layersRef.current.delete(id);
        }
      });
    };

    tick();
    const iv = setInterval(tick, 250);
    return () => clearInterval(iv);
  }, []);

  // `relative z-0` traps Leaflet's internal pane/control z-indexes (up to ~1000) inside
  // this container's own stacking context, so they don't paint over the header dropdown.
  return <div ref={elRef} className={`relative z-0 ${className}`} />;
}
