// API client for the ERP Dispatch Console.
// All requests use a dispatch API key (Bearer), never a Cognito JWT.

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ??
  'https://jlkkd3rvih.execute-api.ap-south-1.amazonaws.com';

export interface ERPCompartment {
  id: string;
  truck_id: string;
  compartment_no: number;
  capacity_liters: number;
  product_type: string;
}

export interface ERPTruck {
  id: string;
  workspace_id: string;
  license_plate: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  compartments: ERPCompartment[];
}

export interface ERPDriver {
  id: string;
  workspace_id: string;
  full_name: string;
  phone: string | null;
}

export interface ERPGeofence {
  id: string;
  workspace_id: string;
  type: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

export interface ERPWorkspaceInfo {
  workspace_id: string;
  workspace_name: string;
  trucks: ERPTruck[];
}

export interface DispatchCompartment {
  compartment_no: number;
  product_type: string;
  volume_liters: number;
}

export interface DispatchBody {
  truck_id: string;
  order_ref?: string;
  driver_name?: string;
  origin_name?: string;
  origin_lat?: number;
  origin_lng?: number;
  dest_name: string;
  dest_lat: number;
  dest_lng: number;
  dest_geofence_ref_id?: string;
  dest_radius_meters?: number;
  compartments?: DispatchCompartment[];
}

export interface DispatchedTrip {
  id: string;
  workspace_id: string;
  truck_id: string;
  status: string;
  source: string;
  order_ref?: string;
  driver_name?: string;
  dest_name: string;
  dest_lat: number;
  dest_lng: number;
  created_at: string;
  updated_at: string;
}

export interface ERPAssetEvent {
  id:           string;
  truck_id:     string;
  workspace_id: string;
  event_type:   'FUEL_FILL' | 'FUEL_DRAIN' | 'BATTERY_ON' | 'BATTERY_OFF' | 'IGNITION_ON' | 'IGNITION_OFF' | 'MOVEMENT_START' | 'MOVEMENT_STOP';
  latitude?:    number;
  longitude?:   number;
  value_before?: number;
  value_after?:  number;
  occurred_at:  string;
  created_at:   string;
}

async function erpFetch<T>(apiKey: string, path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const erp = {
  // Validates key and returns workspace info + trucks.
  loadWorkspace: (apiKey: string) =>
    erpFetch<ERPWorkspaceInfo>(apiKey, '/v1/erp/trucks'),

  listTrucks: (apiKey: string) =>
    erpFetch<ERPWorkspaceInfo>(apiKey, '/v1/erp/trucks'),

  listDrivers: (apiKey: string) =>
    erpFetch<{ drivers: ERPDriver[] }>(apiKey, '/v1/erp/drivers').then(r => r.drivers),

  listGeofences: (apiKey: string) =>
    erpFetch<{ geofences: ERPGeofence[] }>(apiKey, '/v1/erp/geofences').then(r => r.geofences),

  listEvents: (apiKey: string) =>
    erpFetch<ERPAssetEvent[]>(apiKey, '/v1/erp/events'),

  listTrips: (apiKey: string) =>
    erpFetch<DispatchedTrip[]>(apiKey, '/v1/erp/trips'),

  dispatch: (apiKey: string, body: DispatchBody): Promise<DispatchedTrip> =>
    fetch(`${API_BASE}/v1/trips/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    }).then(async res => {
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json() as Promise<DispatchedTrip>;
    }),
};
