'use client';

import { useEffect, useRef, useState } from 'react';

import L from 'leaflet';

import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';

// Fix marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',

  iconUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',

  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface TruckMapProps {

  trucks: Array<{
    id: string;
    registrationNumber: string;
    lat: number;
    lng: number;
    status: string;
  }>;

  depots?: Array<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    geofenceRadius: number;
  }>;

  destinations?: Array<{
    id: string;
    name: string;
    lat: number;
    lng: number;
  }>;

  center?: [number, number];

  zoom?: number;

}

export default function TruckMap({

  trucks,

  depots = [],

  destinations = [],

  center = [23.588, 58.3829],

  zoom = 11,

}: TruckMapProps) {

  const mapRef =
    useRef<L.Map | null>(null);

  const mapContainerRef =
    useRef<HTMLDivElement>(null);

  const markersRef =
    useRef<Map<string, L.Marker>>(
      new Map()
    );

  const circlesRef =
    useRef<L.Layer[]>([]);

  const routingControlRef =
    useRef<any>(null);

  const [ready, setReady] =
    useState(false);

  // Initialize
  useEffect(() => {
    setReady(true);
  }, []);

  // Create map once
  useEffect(() => {

    if (
      !ready ||
      !mapContainerRef.current ||
      mapRef.current
    ) {
      return;
    }

    mapRef.current =
      L.map(
        mapContainerRef.current
      ).setView(
        center,
        zoom
      );

    L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        attribution:
          '© OpenStreetMap contributors',
      }
    ).addTo(
      mapRef.current
    );

  }, [ready]);

  // Draw depots + destinations
  useEffect(() => {

    if (!mapRef.current)
      return;

    circlesRef.current.forEach(
      layer => layer.remove()
    );

    circlesRef.current = [];

    depots.forEach(depot => {

      const marker =
        L.marker([
          depot.lat,
          depot.lng,
        ])
          .bindPopup(
            `🏭 ${depot.name}`
          )
          .addTo(
            mapRef.current!
          );

      circlesRef.current.push(
        marker
      );

      const circle =
        L.circle(
          [
            depot.lat,
            depot.lng,
          ],
          {
            radius:
              depot.geofenceRadius,

            color:
              '#2563eb',

            fillOpacity:
              0.1,
          }
        )
          .addTo(
            mapRef.current!
          );

      circlesRef.current.push(
        circle
      );

    });

    destinations.forEach(
      destination => {

        const marker =
          L.marker([
            destination.lat,
            destination.lng,
          ])
            .bindPopup(
              `📍 ${destination.name}`
            )
            .addTo(
              mapRef.current!
            );

        circlesRef.current.push(
          marker
        );

      }
    );

  }, [
    depots,
    destinations,
  ]);

  // Live truck movement
  useEffect(() => {

    if (!mapRef.current)
      return;

    trucks.forEach(
      truck => {

        const existing =
          markersRef.current.get(
            truck.id
          );

        // Animate existing marker
        if (existing) {

          const current =
            existing.getLatLng();

          const target =
            L.latLng(
              truck.lat,
              truck.lng
            );

          const steps = 20;

          let step = 0;

          const deltaLat =
            (target.lat - current.lat) /
            steps;

          const deltaLng =
            (target.lng - current.lng) /
            steps;

          const interval =
            setInterval(() => {

              step++;

              existing.setLatLng([

                current.lat +
                deltaLat * step,

                current.lng +
                deltaLng * step,

              ]);

              if (
                step >= steps
              ) {
                clearInterval(
                  interval
                );
              }

            }, 50);

          return;
        }

        // Create new marker
        const icon =
          L.divIcon({

            className: '',

            html: `
<div
style="
background:
${truck.status === 'EN_ROUTE'
? '#f59e0b'
: '#10b981'
};

width:38px;
height:38px;

display:flex;
align-items:center;
justify-content:center;

border-radius:10px;

color:white;
font-size:18px;

box-shadow:
0 4px 10px rgba(0,0,0,.3);
"
>

🚛

</div>
`,
          });

        const marker =
          L.marker(
            [
              truck.lat,
              truck.lng,
            ],
            {
              icon,
            }
          )
            .bindPopup(
              `
<b>
${truck.registrationNumber}
</b>

<br/>

${truck.status}
`
            )
            .addTo(
              mapRef.current!
            );

        markersRef.current.set(
          truck.id,
          marker
        );

      }
    );

  }, [trucks]);

  // REAL ROAD ROUTING
  useEffect(() => {

    if (
      !mapRef.current ||
      !trucks.length ||
      !destinations.length
    ) {
      return;
    }

    const truck =
      trucks[0];

    const destination =
      destinations[0];

    // Remove old route
    if (
      routingControlRef.current
    ) {

      mapRef.current.removeControl(
        routingControlRef.current
      );

    }

    routingControlRef.current =
      (L as any).Routing.control({

        waypoints: [

          L.latLng(
            truck.lat,
            truck.lng
          ),

          L.latLng(
            destination.lat,
            destination.lng
          ),

        ],

        routeWhileDragging:
          false,

        addWaypoints:
          false,

        draggableWaypoints:
          false,

        fitSelectedRoutes:
          true,

        show:
          false,

        createMarker:
          () => null,

        lineOptions: {
          styles: [
            {
              color:
                '#2563eb',

              weight:
                6,

              opacity:
                0.8,
            },
          ],
        },

      }).addTo(
        mapRef.current
      );

  }, [
    trucks,
    destinations,
  ]);

  if (!ready) {

    return (
      <div className="w-full h-[500px] rounded-lg bg-gray-100 flex items-center justify-center">

        Loading Map...

      </div>
    );

  }

  return (

    <div className="relative">

      <div
        ref={
          mapContainerRef
        }
        className="
          w-full
          h-[500px]
          rounded-xl
          overflow-hidden
          border
          border-gray-200
        "
      />

      {/* overlay */}
      <div
        className="
          absolute
          top-3
          left-3
          bg-white
          rounded-lg
          shadow-lg
          p-3
          z-[1000]
        "
      >

        <div>
          🚛
          {' '}
          {trucks.length}
          {' '}
          Truck
        </div>

        <div>
          📍
          {' '}
          {destinations.length}
          {' '}
          Destination
        </div>

      </div>

    </div>

  );
}