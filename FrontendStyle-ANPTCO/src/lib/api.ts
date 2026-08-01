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

export interface ApiWorkspaceModules {
  ordering:     boolean;
  dispatch_api: boolean;
}

export interface ApiWorkspace {
  id:          string;
  slug:        string;
  name:        string;
  type:        string;
  seller_code?: string;
  modules:     ApiWorkspaceModules;
  created_at:  string;
}

export interface ApiTrip {
  id:               string;
  workspace_id:     string;
  truck_id:         string;
  order_id?:        string;
  order_ref?:       string;
  driver_name?:     string;
  origin_name?:     string;
  origin_lat?:      number;
  origin_lng?:      number;
  dest_name:        string;
  dest_lat:         number;
  dest_lng:         number;
  dest_geofence_id?: string;
  source:           string;
  status:           string;
  compartments?:    unknown;
  fuel_loaded?:     Record<string, number>;
  fuel_delivered?:  Record<string, number>;
  scanned_at?:      string;
  created_at:       string;
  updated_at:       string;
}

// ── Admin types ────────────────────────────────────────────────
export interface ApiAdminWorkspace {
  id:          string;
  slug:        string;
  name:        string;
  type:        string;
  is_sandbox:  boolean;
  modules:     Record<string, boolean>;
  created_at:  string;
}

export interface ApiWorkspaceProfile {
  workspace_id:  string;
  company_name:  string;
  company_reg_no?: string;
  tax_id?:       string;
  country:       string;
  city?:         string;
  address?:      string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  notes?:        string;
  updated_at:    string;
}

export interface ApiSubscriptionPlan {
  id:         string;
  key:        string;
  name:       string;
  max_trucks: number;
  price_usd:  number;
}

export interface ApiWorkspaceSubscription {
  id:           string;
  workspace_id: string;
  plan_id:      string;
  status:       string;
  started_at:   string;
  ends_at?:     string;
}

export interface ApiDriver {
  id:          string;
  workspace_id: string;
  full_name:   string;
  phone?:      string;
  license_no?: string;
  notes?:      string;
  is_active:   boolean;
  created_at:  string;
}

export interface ApiTruckCompartment {
  id:              string;
  truck_id:        string;
  compartment_no:  number;
  capacity_liters: number;
  product_type:    string;
}

export interface ApiAdminTruck {
  id:            string;
  workspace_id:  string;
  license_plate: string | null;
  make:          string | null;
  model:         string | null;
  year:          number | null;
  compartments:  ApiTruckCompartment[];
}

export interface ApiDevice {
  id:          string;
  imei:        string;
  model:       string;
  firmware?:   string;
  sim_iccid?:  string;
  sim_phone?:  string;
  status:      'AVAILABLE' | 'ASSIGNED' | 'MAINTENANCE' | 'RETIRED';
  purchased_at?: string;
  notes?:      string;
  created_at:  string;
}

export interface ApiDeviceAssignment {
  id:            string;
  device_id:     string;
  truck_id:      string;
  assigned_by:   string;
  assigned_at:   string;
  unassigned_at?: string;
  notes?:        string;
}

export interface ApiFuelSensor {
  id:        string;
  serial_no: string;
  model:     string;
  status:    'AVAILABLE' | 'ASSIGNED' | 'MAINTENANCE' | 'RETIRED';
  notes?:    string;
  created_at: string;
}

export interface ApiDispatchAPIKey {
  id:          string;
  workspace_id: string;
  description?: string;
  status:      'ACTIVE' | 'REVOKED';
  created_by:  string;
  created_at:  string;
  revoked_at?: string;
  last_used_at?: string;
  // Only present on create response
  key?:        string;
}

export interface ApiReadinessCheck {
  key:     string;
  label:   string;
  passed:  boolean;
  message?: string;
}

export interface ApiReadinessReport {
  workspace_id: string;
  ready:        boolean;
  checks:       ApiReadinessCheck[];
}

export interface ApiAuditLog {
  id:          string;
  actor_id:    string;
  action:      string;
  target_type: string;
  target_id:   string;
  payload?:    unknown;
  created_at:  string;
}

export interface ApiAssetEvent {
  id:             string;
  truck_id:       string;
  workspace_id:   string;
  event_type:     'FUEL_FILL' | 'FUEL_DRAIN' | 'BATTERY_ON' | 'BATTERY_OFF'
                | 'IGNITION_ON' | 'IGNITION_OFF' | 'MOVEMENT_START' | 'MOVEMENT_STOP'
                | 'GEOFENCE_ENTER_STATION' | 'GEOFENCE_EXIT_STATION'
                | 'GEOFENCE_ENTER_DEPOT'   | 'GEOFENCE_EXIT_DEPOT'
                | string;
  latitude?:      number;
  longitude?:     number;
  value_before?:  number;
  value_after?:   number;
  // Present only on geofence events
  geofence_type?: 'STATION' | 'DEPOT';
  geofence_zone?: string;   // geofence name, e.g. "Point 1" or "Main Depot"
  trip_id?:       string;
  occurred_at:    string;
  created_at:     string;
}

export interface ApiIntegration {
  id:          string;
  workspace_id: string;
  system_type: string;
  base_url?:   string;
  auth_type:   string;
  status:      string;
  verified_at?: string;
  notes?:      string;
}

export interface ApiDeliveryNote {
  id:           string;
  trip_id:      string;
  order_id?:    string;
  workspace_id: string;
  qr_confirmed: boolean;
  note_data:    {
    trip_id?:                string;
    order_id?:               string;
    truck_id?:               string;
    driver_name?:            string;
    origin_name?:            string;
    dest_name?:              string;
    volume_ordered_liters?:  number;
    fuel_type?:              string;
    fuel_loaded?:            Record<string, number>;
    fuel_delivered?:         Record<string, number>;
    qr_confirmed?:           boolean;
    dist_m?:                 number;
    telemetry_age_s?:        number;
    accepted_by?:            string;
    accepted_at?:            string;
  };
  generated_at: string;
  download_url?: string;
}

// ── ERP Client portal types ───────────────────────────────────
export interface ApiClientMe {
  workspace_id:   string;
  workspace_name: string;
  modules:        ApiWorkspaceModules & { monitoring?: boolean };
}

export interface ApiClientTruck {
  id:                string;
  license_plate?:    string;
  make?:             string;
  model?:            string;
  year?:             number;
  latitude?:         number;
  longitude?:        number;
  speed?:            number;
  total_fuel_liters?: number;
  ignition_on?:      boolean;
  last_seen_at?:     string;
}

// ── Token cache — avoids concurrent fetchAuthSession() calls ──
let _cachedToken: string | null = null;
let _tokenExpiresAt = 0;

async function getCachedToken(): Promise<string | null> {
  if (_cachedToken && Date.now() < _tokenExpiresAt - 60_000) return _cachedToken;
  const token = await getIdToken();
  if (token) {
    try {
      const exp = JSON.parse(atob(token.split('.')[1])).exp as number;
      _tokenExpiresAt = exp * 1000;
    } catch {
      _tokenExpiresAt = Date.now() + 3_500_000; // ~1h fallback
    }
    _cachedToken = token;
  }
  return token;
}

// ── Core fetch wrapper ────────────────────────────────────────
async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getCachedToken();

  // No valid Cognito session — bounce to login immediately so the user
  // sees a clear "session expired" message rather than a cryptic 401.
  if (!token && typeof window !== 'undefined') {
    window.location.href = '/auth/login';
    throw new Error('Session expired — please log in again');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    // 401 from API Gateway means the token was rejected (expired or invalid).
    // Clear the cached token so the next call re-fetches, then bounce to login.
    if (res.status === 401) {
      _cachedToken = null;
      _tokenExpiresAt = 0;
      if (typeof window !== 'undefined') window.location.href = '/auth/login';
      throw new Error('Session expired — please log in again');
    }
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

    // ARRIVED → DELIVERY_ACCEPTED (legacy driver scan, no QR gates)
    scan: (id: string, truckId: string) =>
      apiFetch<ApiOrder>(`/v1/orders/${id}/scan`, {
        method: 'PATCH',
        body:   JSON.stringify({ truck_id: truckId }),
      }),

    // ARRIVED → DELIVERY_ACCEPTED via 4-gate QR (CLIENT role).
    // token is the full signed string from the truck's QR sticker.
    acceptDelivery: (id: string, token: string) =>
      apiFetch<ApiOrder>(`/v1/orders/${id}/accept-delivery`, {
        method: 'POST',
        body:   JSON.stringify({ token }),
      }),

    getDeliveryNote: (id: string) =>
      apiFetch<ApiDeliveryNote>(`/v1/orders/${id}/delivery-note`),
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

  // ── Admin: invite user + onboarding ──────────────────────────
  admin: {
    inviteUser: (body: { email: string; role: string; workspace_id?: string }) =>
      apiFetch<{ message: string }>('/v1/users/invite', {
        method: 'POST',
        body:   JSON.stringify(body),
      }),

    inviteClientUser: (workspaceId: string, email: string) =>
      apiFetch<{ workspace_id: string; email: string; role: string }>('/v1/users/invite', {
        method: 'POST',
        body:   JSON.stringify({ email, role: 'ERP_CLIENT', workspace_id: workspaceId }),
      }),

    // ── Workspace management ──────────────────────────────────
    listWorkspaces: () =>
      apiFetch<ApiAdminWorkspace[]>('/admin/v1/workspaces'),

    createWorkspace: (body: { slug: string; name: string; type?: string; is_sandbox?: boolean }) =>
      apiFetch<ApiAdminWorkspace>('/admin/v1/workspaces', { method: 'POST', body: JSON.stringify(body) }),

    getWorkspace: (id: string) =>
      apiFetch<{ workspace: ApiAdminWorkspace; profile: ApiWorkspaceProfile | null; subscription: ApiWorkspaceSubscription | null }>(`/admin/v1/workspaces/${id}`),

    upsertProfile: (id: string, profile: Partial<ApiWorkspaceProfile>) =>
      apiFetch<ApiWorkspaceProfile>(`/admin/v1/workspaces/${id}/profile`, { method: 'PUT', body: JSON.stringify(profile) }),

    setModules: (id: string, modules: Record<string, boolean>) =>
      apiFetch<{ workspace_id: string; modules: Record<string, boolean> }>(`/admin/v1/workspaces/${id}/modules`, {
        method: 'PUT',
        body:   JSON.stringify(modules),
      }),

    subscribe: (id: string, planId: string) =>
      apiFetch<ApiWorkspaceSubscription>(`/admin/v1/workspaces/${id}/subscribe`, {
        method: 'POST',
        body:   JSON.stringify({ plan_id: planId }),
      }),

    getReadiness: (id: string) =>
      apiFetch<ApiReadinessReport>(`/admin/v1/workspaces/${id}/readiness`),

    listPlans: () =>
      apiFetch<ApiSubscriptionPlan[]>('/admin/v1/plans'),

    getAuditLog: (id: string) =>
      apiFetch<ApiAuditLog[]>(`/admin/v1/workspaces/${id}/audit`),

    upsertIntegration: (id: string, body: Partial<ApiIntegration>) =>
      apiFetch<ApiIntegration>(`/admin/v1/workspaces/${id}/integrations`, { method: 'PUT', body: JSON.stringify(body) }),

    listIntegrations: (id: string) =>
      apiFetch<ApiIntegration[]>(`/admin/v1/workspaces/${id}/integrations`),

    // ── Fleet management ──────────────────────────────────────
    listTrucks: (wsId: string) =>
      apiFetch<ApiAdminTruck[]>(`/admin/v1/workspaces/${wsId}/trucks`),

    createTruck: (wsId: string, body: { device_imei: string; license_plate?: string; make?: string; model?: string; year?: number }) =>
      apiFetch<{ id: string; workspace_id: string }>(`/admin/v1/workspaces/${wsId}/trucks`, { method: 'POST', body: JSON.stringify(body) }),

    updateTruckMeta: (truckId: string, body: { license_plate?: string; make?: string; model?: string; year?: number; notes?: string }) =>
      apiFetch<{ id: string; updated: boolean }>(`/admin/v1/trucks/${truckId}/meta`, { method: 'PATCH', body: JSON.stringify(body) }),

    listCompartments: (truckId: string) =>
      apiFetch<ApiTruckCompartment[]>(`/admin/v1/trucks/${truckId}/compartments`),

    upsertCompartments: (truckId: string, compartments: Array<{ compartment_no: number; capacity_liters: number; product_type?: string }>) =>
      apiFetch<ApiTruckCompartment[]>(`/admin/v1/trucks/${truckId}/compartments`, { method: 'PUT', body: JSON.stringify(compartments) }),

    // ── Drivers ───────────────────────────────────────────────
    listDrivers: (wsId: string) =>
      apiFetch<ApiDriver[]>(`/admin/v1/workspaces/${wsId}/drivers`),

    createDriver: (wsId: string, body: { full_name: string; phone?: string; license_no?: string; notes?: string }) =>
      apiFetch<ApiDriver>(`/admin/v1/workspaces/${wsId}/drivers`, { method: 'POST', body: JSON.stringify(body) }),

    updateDriver: (wsId: string, driverId: string, body: Partial<ApiDriver>) =>
      apiFetch<ApiDriver>(`/admin/v1/workspaces/${wsId}/drivers/${driverId}`, { method: 'PATCH', body: JSON.stringify(body) }),

    deactivateDriver: (driverId: string) =>
      apiFetch<{ id: string; is_active: boolean }>(`/admin/v1/drivers/${driverId}`, { method: 'DELETE' }),

    // ── Device inventory ──────────────────────────────────────
    listDevices: (status?: string) =>
      apiFetch<ApiDevice[]>(`/admin/v1/devices${status ? `?status=${status}` : ''}`),

    createDevice: (body: { imei: string; model?: string; firmware?: string; sim_iccid?: string; sim_phone?: string; notes?: string }) =>
      apiFetch<ApiDevice>('/admin/v1/devices', { method: 'POST', body: JSON.stringify(body) }),

    assignDevice: (deviceId: string, body: { truck_id: string; notes?: string }) =>
      apiFetch<ApiDeviceAssignment>(`/admin/v1/devices/${deviceId}/assign`, { method: 'POST', body: JSON.stringify(body) }),

    unassignDevice: (deviceId: string) =>
      apiFetch<{ device_id: string; unassigned: boolean }>(`/admin/v1/devices/${deviceId}/unassign`, { method: 'POST', body: '{}' }),

    listDeviceAssignments: (truckId: string) =>
      apiFetch<ApiDeviceAssignment[]>(`/admin/v1/trucks/${truckId}/devices`),

    // ── Fuel sensors ──────────────────────────────────────────
    listSensors: (status?: string) =>
      apiFetch<ApiFuelSensor[]>(`/admin/v1/sensors${status ? `?status=${status}` : ''}`),

    createSensor: (body: { serial_no: string; model?: string; notes?: string }) =>
      apiFetch<ApiFuelSensor>('/admin/v1/sensors', { method: 'POST', body: JSON.stringify(body) }),

    assignSensor: (sensorId: string, body: { truck_id: string; compartment_no: number; notes?: string }) =>
      apiFetch<{ id: string }>(`/admin/v1/sensors/${sensorId}/assign`, { method: 'POST', body: JSON.stringify(body) }),

    unassignSensor: (sensorId: string) =>
      apiFetch<{ sensor_id: string; unassigned: boolean }>(`/admin/v1/sensors/${sensorId}/unassign`, { method: 'POST', body: '{}' }),

    // ── Dispatch API keys ─────────────────────────────────────
    listAPIKeys: (wsId: string) =>
      apiFetch<ApiDispatchAPIKey[]>(`/admin/v1/workspaces/${wsId}/api-keys`),

    createAPIKey: (wsId: string, description?: string) =>
      apiFetch<ApiDispatchAPIKey>(`/admin/v1/workspaces/${wsId}/api-keys`, {
        method: 'POST',
        body:   JSON.stringify({ description }),
      }),

    revokeAPIKey: (keyId: string) =>
      apiFetch<{ id: string; status: string }>(`/admin/v1/api-keys/${keyId}`, { method: 'DELETE' }),

    // ── Trips (admin view) ────────────────────────────────────
    listTrips: (wsId: string) =>
      apiFetch<ApiTrip[]>(`/admin/v1/workspaces/${wsId}/trips`),

    // ── Asset events (admin view, PLATFORM_ADMIN only) ───────
    listEvents: (wsId: string) =>
      apiFetch<ApiAssetEvent[]>(`/admin/v1/workspaces/${wsId}/events`),
  },

  // ── Workspace (module flags) ──────────────────────────────────
  workspace: {
    get: () => apiFetch<ApiWorkspace>('/v1/workspace'),
  },

  // ── ERP Client portal (/v1/client/* — Cognito JWT auth) ──────
  client: {
    me:     () => apiFetch<ApiClientMe>('/v1/client/me'),
    trucks: () => apiFetch<ApiClientTruck[]>('/v1/client/trucks'),
    events: (truckId?: string) =>
      apiFetch<ApiAssetEvent[]>(`/v1/client/events${truckId ? `?truck_id=${truckId}` : ''}`),
    trips:  (truckId?: string) =>
      apiFetch<ApiTrip[]>(`/v1/client/trips${truckId ? `?truck_id=${truckId}` : ''}`),
  },

  // ── Fleet monitor (TRANSPORT_ADMIN own-workspace endpoints) ──
  fleet: {
    events: () => apiFetch<ApiAssetEvent[]>('/v1/events'),
    dispatch: (body: {
      truck_id: string;
      dest_name: string;
      dest_lat: number;
      dest_lng: number;
      dest_radius_meters?: number;
      origin_name?: string;
      origin_lat?: number;
      origin_lng?: number;
    }) => apiFetch<ApiTrip>('/v1/trips', { method: 'POST', body: JSON.stringify(body) }),
  },

  // ── Trips (Mode B dispatch + monitoring view) ─────────────────
  trips: {
    list: () => apiFetch<ApiTrip[]>('/v1/trips'),

    get: (id: string) => apiFetch<ApiTrip>(`/v1/trips/${id}`),

    // ARRIVED → DELIVERY_ACCEPTED (QR scan at delivery)
    scan: (id: string, fuelDelivered?: Record<string, number>) =>
      apiFetch<ApiTrip>(`/v1/trips/${id}/scan`, {
        method: 'PATCH',
        body:   JSON.stringify({ fuel_delivered: fuelDelivered ?? {} }),
      }),

    deliveryNote: (id: string) =>
      apiFetch<Record<string, unknown>>(`/v1/trips/${id}/delivery-note`),

    // Mode B: ERP/machine-auth dispatch endpoint.
    // Use dispatchFetch (not apiFetch) so it sends the API key, not a JWT.
    dispatch: (apiKey: string, body: {
      truck_id:              string;
      order_ref?:            string;
      driver_name?:          string;
      origin_name?:          string;
      origin_lat?:           number;
      origin_lng?:           number;
      dest_name:             string;
      dest_lat:              number;
      dest_lng:              number;
      dest_geofence_ref_id?: string;
      dest_radius_meters?:   number;
      compartments?:         unknown[];
    }) => fetch(`${API_BASE}/v1/trips/dispatch`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    }).then(async res => {
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`API ${res.status}: ${text}`);
      }
      return res.json() as Promise<ApiTrip>;
    }),
  },
};
