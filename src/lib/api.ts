'use client';

import { getIdToken } from './auth';
import { API_BASE } from './amplify-config';

// ── Types mirroring the Go backend ───────────────────────────
export interface ApiOrder {
  id:                    string;
  workspace_id:          string;
  client_workspace_id?:  string;
  status:                string;
  destination_station_id?: string;
  transporter_id?:       string;
  volume_liters?:        number;
  fuel_type?:            string;
  created_at:            string;
  updated_at:            string;
}

export interface ApiSeller {
  id:          string;
  slug:        string;
  name:        string;
  type:        string;
  seller_code?: string;
  created_at:  string;
}

export interface ApiGeofence {
  id:            string;
  workspace_id:  string;
  type:          'STATION' | 'DEPOT';
  ref_id?:       string;
  name:          string;
  latitude:      number;
  longitude:     number;
  radius_meters: number;
  created_at:    string;
}

export interface ApiTruck {
  id:                string;
  workspace_id:      string;
  device_id:         string; // galileosky_device_id (telemetry hardware IMEI)
  status:            string;
  created_at:        string;
  latitude?:         number;
  longitude?:        number;
  speed?:            number;
  last_seen_at?:     string;
  total_fuel_liters?: number;
  compartment_fuel?:  Record<string, number>;
}

export interface ApiTruckPosition {
  truck_id:           string;
  latitude?:          number;
  longitude?:         number;
  speed?:             number;
  last_message_at?:   string;
  total_fuel_liters?: number;
  compartment_fuel?:  Record<string, number>;
}

export interface ApiConnection {
  id:             string;
  workspace_id:   string;
  transporter_id: string; // Cognito sub of the TRANSPORT_ADMIN who requested it
  seller_code:    string;
  status:         'PENDING' | 'APPROVED' | 'REJECTED';
  requested_at:   string;
  resolved_at?:   string;
  resolved_by?:   string;
}

// ── Core fetch wrapper ────────────────────────────────────────
async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getIdToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${text}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Orders ────────────────────────────────────────────────────
export const api = {
  orders: {
    // Backend defaults to active-only when `active` is omitted or anything but
    // the literal string "false" — so we must always send it explicitly to
    // get the semantics callers expect (no args = all orders, including COMPLETED).
    list: (activeOnly = false) =>
      apiFetch<ApiOrder[]>(`/v1/orders?active=${activeOnly ? 'true' : 'false'}`),

    get: (id: string) =>
      apiFetch<ApiOrder>(`/v1/orders/${id}`),

    create: (body: {
      seller_workspace_id:    string;
      destination_station_id?: string;
      volume_liters?:          number;
      fuel_type?:              string;
    }) => apiFetch<ApiOrder>('/v1/orders', { method: 'POST', body: JSON.stringify(body) }),

    // PLACED → ACCEPTED_BY_SELLER
    accept: (id: string) =>
      apiFetch<ApiOrder>(`/v1/orders/${id}/accept`, { method: 'PATCH' }),

    // ACCEPTED_BY_SELLER → ASSIGNED_TO_TSP
    assignTsp: (id: string, transporterId: string) =>
      apiFetch<ApiOrder>(`/v1/orders/${id}/assign-tsp`, {
        method: 'PATCH',
        body:   JSON.stringify({ transporter_id: transporterId }),
      }),

    // ASSIGNED_TO_TSP → ASSIGNED
    assignTruck: (id: string, truckId: string) =>
      apiFetch<ApiOrder>(`/v1/orders/${id}/assign-truck`, {
        method: 'PATCH',
        body:   JSON.stringify({ truck_id: truckId }),
      }),

    // ASSIGNED → LOADING
    startLoading: (id: string) =>
      apiFetch<ApiOrder>(`/v1/orders/${id}/start-loading`, { method: 'PATCH' }),

    // LOADING → LOADED  (compartmentFuel: {"1":5000,"2":10000,"3":7500,"4":2500})
    finishLoading: (id: string, compartmentFuel?: Record<string, number>) =>
      apiFetch<ApiOrder>(`/v1/orders/${id}/finish-loading`, {
        method: 'PATCH',
        body:   JSON.stringify({ compartment_fuel: compartmentFuel ?? {} }),
      }),

    // LOADED → EN_ROUTE
    depart: (id: string) =>
      apiFetch<ApiOrder>(`/v1/orders/${id}/depart`, { method: 'PATCH' }),

    // ARRIVED → DELIVERY_ACCEPTED (QR scan; truck_id is the value encoded in the QR)
    scan: (id: string, truckId: string) =>
      apiFetch<ApiOrder>(`/v1/orders/${id}/scan`, {
        method: 'PATCH',
        body:   JSON.stringify({ truck_id: truckId }),
      }),
  },

  // ── Sellers ─────────────────────────────────────────────────
  sellers: {
    list: () => apiFetch<ApiSeller[]>('/v1/sellers'),
  },

  // ── Stations (CLIENT geofences) ──────────────────────────────
  stations: {
    list: () => apiFetch<ApiGeofence[]>('/v1/stations'),

    create: (body: {
      name:          string;
      latitude:      number;
      longitude:     number;
      radius_meters: number;
    }) => apiFetch<ApiGeofence>('/v1/stations', { method: 'POST', body: JSON.stringify(body) }),
  },

  // ── Depots (TRANSPORT_ADMIN geofences) ───────────────────────
  depots: {
    list: () => apiFetch<ApiGeofence[]>('/v1/depots'),

    create: (body: {
      name:          string;
      latitude:      number;
      longitude:     number;
      radius_meters: number;
    }) => apiFetch<ApiGeofence>('/v1/depots', { method: 'POST', body: JSON.stringify(body) }),
  },

  // ── Trucks ───────────────────────────────────────────────────
  trucks: {
    list:        () => apiFetch<ApiTruck[]>('/v1/trucks'),
    get:         (id: string) => apiFetch<ApiTruck>(`/v1/trucks/${id}`),
    getQR:       (id: string) => apiFetch<{ qr_url: string }>(`/v1/trucks/${id}/qr`),
    getPosition: (id: string) => apiFetch<ApiTruckPosition>(`/v1/trucks/${id}/position`),
    seedPosition: (id: string, latitude: number, longitude: number) =>
      apiFetch<{ status: string }>(`/v1/trucks/${id}/position`, {
        method: 'PATCH',
        body:   JSON.stringify({ latitude, longitude }),
      }),
    setFuel: (id: string, compartmentFuel: Record<string, number>) =>
      apiFetch<{ status: string; total_fuel_liters: number }>(`/v1/trucks/${id}/fuel`, {
        method: 'PATCH',
        body:   JSON.stringify({ compartment_fuel: compartmentFuel }),
      }),
  },

  // ── Seller ↔ Transporter connections ──────────────────────────
  connections: {
    // TRANSPORT_ADMIN requests a connection with a seller by their seller_code
    request: (sellerCode: string) =>
      apiFetch<ApiConnection>('/v1/connections', {
        method: 'POST',
        body:   JSON.stringify({ seller_code: sellerCode }),
      }),

    // SELLER_MANAGER sees pending requests for their workspace;
    // TRANSPORT_ADMIN sees their own outgoing requests.
    list: () => apiFetch<ApiConnection[]>('/v1/connections'),

    approve: (id: string) =>
      apiFetch<ApiConnection>(`/v1/connections/${id}/approve`, { method: 'PATCH' }),

    reject: (id: string) =>
      apiFetch<ApiConnection>(`/v1/connections/${id}/reject`, { method: 'PATCH' }),
  },

  // ── Admin: invite user ────────────────────────────────────────
  admin: {
    inviteUser: (body: { email: string; role: string; workspace_id?: string }) =>
      apiFetch<{ message: string }>('/v1/users/invite', {
        method: 'POST',
        body:   JSON.stringify(body),
      }),
  },
};
