import {
  User,
  Workspace,
  Depot,
  Truck,
  Order,
  KYCDocument,
  Ticket,
  Notification,
  Compartment,
  FuelType,
  SensorIntegrationRequest,
  SellerConnectionRequest,
  SellerOnboarding,
  Driver,
  ProductMode,
  ProductModules,
} from '@/src/types';
import { isInsideGeofence, initialDebounceState, stepDebounce, DebounceState } from './geo';
import { getCachedRoadRoute, routePosition } from './route-geometry';
import { ingestTelemetry } from './telemetry-store';
import { sendWebhook } from './webhooks';
import { updateTripStatus as updateErpTripStatus } from './dispatch-client';

// ── Demo version — bump this to force a full localStorage reset ──
const DEMO_VERSION = 'v3.11';
const VERSION_KEY  = 'fuel_demo_version';

// Product mode is intentionally a standalone key (not in STORAGE_KEYS) so it
// survives demo reseeds/version bumps — switching mode never touches seeded data.
const PRODUCT_MODE_KEY = 'fuel_product_mode';

// ── Fixed truck compartment model ─────────────────────────────
// Every truck has the same physical layout: 4 compartments, each holding a
// fixed 9,100 L. Compartments are generic (no preset fuel type) — the order
// decides which fuel goes into each compartment at dispatch time. Orders are
// placed in whole-compartment units, so a single truck (4 compartments) can
// always carry any valid order and no per-truck capacity check is needed.
export const COMPARTMENT_CAPACITY    = 9100;
export const COMPARTMENTS_PER_TRUCK  = 4;
export const MAX_ORDER_COMPARTMENTS  = COMPARTMENTS_PER_TRUCK;
export const TRUCK_CAPACITY          = COMPARTMENT_CAPACITY * COMPARTMENTS_PER_TRUCK; // 36,400 L

/** Standard 4 × 9,100 L compartment layout shared by every truck. */
export function makeStandardCompartments(): Compartment[] {
  return Array.from({ length: COMPARTMENTS_PER_TRUCK }, (_, i) => ({
    id: i + 1,
    capacity: COMPARTMENT_CAPACITY,
    currentVolume: 0,
  }));
}

// ── Fuel Anomaly (theft detection) ───────────────────────────
export interface FuelAnomaly {
  id: string;
  orderId: string;
  truckReg: string;
  compartment: string;
  fuelDropLiters: number;
  fuelDropPercent?: number;
  location: string;
  detectedAt: Date;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'OPEN' | 'REVIEWING' | 'RESOLVED';
}

const ANOMALY_KEY = 'fuel_anomalies';

export const getFuelAnomalies = (): FuelAnomaly[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ANOMALY_KEY);
    if (!raw) return [];
    return JSON.parse(raw).map((a: any) => ({ ...a, detectedAt: new Date(a.detectedAt) }));
  } catch { return []; }
};

export const addFuelAnomaly = (anomaly: FuelAnomaly) => {
  if (typeof window === 'undefined') return;
  const existing = getFuelAnomalies();
  existing.push(anomaly);
  localStorage.setItem(ANOMALY_KEY, JSON.stringify(existing));
};

export const updateFuelAnomaly = (id: string, updates: Partial<FuelAnomaly>) => {
  if (typeof window === 'undefined') return;
  const items = getFuelAnomalies().map(a => a.id === id ? { ...a, ...updates } : a);
  localStorage.setItem(ANOMALY_KEY, JSON.stringify(items));
};

// FIXED DEPOT LOCATION
export const FIXED_DEPOT = {
  id: 'depot-seeb',
  name: 'Central Depot — Seeb',
  address: 'Seeb, Muscat, Oman',
  lat: 23.670250,
  lng: 58.189120,
  geofenceRadius: 200,
};

// FIXED DELIVERY DESTINATIONS
// Each station stores fuel per type with a seed `base` level and a `capacity`.
// The live level = base + fuel received from completed deliveries (capped at
// capacity). This is the single source of truth for BOTH the client dashboard
// reserves and the order-capacity validation, so they can never disagree.
export const DELIVERY_ZONES = [
  {
    id: 'qurum-station',
    name: 'Station A',
    lat: 23.612703,
    lng: 58.498615,
    radius: 250,
    clientName: 'Client 1',
    address: 'Qurum, Muscat, Oman',
    type: 'Petrol Station',
    // Capacities & seed levels are whole multiples of one compartment (9,100 L)
    // so many compartment-sized orders fit before a tank fills.
    fuels: {
      DIESEL:  { base: 18200, capacity: 182000 },  // 2 / 20 compartments
      PETROL:  { base: 9100,  capacity: 136500 },  // 1 / 15 compartments
      PREMIUM: { base: 9100,  capacity: 91000  },  // 1 / 10 compartments
    } as Record<string, { base: number; capacity: number }>,
  },
  {
    id: 'khuwair-station',
    name: 'Station B',
    lat: 23.586549,
    lng: 58.431447,
    radius: 250,
    clientName: 'Client 2',
    address: 'Al Khuwair, Muscat, Oman',
    type: 'Petrol Station',
    fuels: {
      DIESEL:  { base: 9100, capacity: 182000 },  // 1 / 20 compartments
      PETROL:  { base: 9100, capacity: 136500 },  // 1 / 15 compartments
      PREMIUM: { base: 0,    capacity: 91000  },  // 0 / 10 compartments
    } as Record<string, { base: number; capacity: number }>,
  },
];

export function getDeliveryLocations() {
  return DELIVERY_ZONES;
}

// Platform Admin
export const PLATFORM_ADMIN: User = {
  id: 'admin-platform',
  email: 'admin@anptco.com',
  firstName: 'Admin',
  lastName: 'ANPTCO',
  role: 'PLATFORM_ADMIN',
  verified: true,
};

// Storage keys
const STORAGE_KEYS = {
  USERS:             'fuel_users',
  WORKSPACES:        'fuel_workspaces',
  TRUCKS:            'fuel_trucks',
  ORDERS:            'fuel_orders',
  KYC:               'fuel_kyc',
  TICKETS:           'fuel_tickets',
  NOTIFICATIONS:     'fuel_notifications',
  CURRENT_USER:      'fuel_current_user',
  SENSOR_REQUESTS:   'fuel_sensor_requests',
  DRIVERS:           'fuel_drivers',
  SELLER_CONNECTIONS:'fuel_seller_connections',
  SELLER_CODES:      'fuel_seller_codes',
};

// ── Demo Drivers ──────────────────────────────────────────────
const DEMO_DRIVERS: Driver[] = [
  {
    id: 'driver-001',
    email: 'driver1@transporter1.com',
    password: 'driver123',
    firstName: 'Driver',
    lastName: '1',
    phone: '+968 9234 5678',
    licenseNumber: 'DL-OM-001',
    tspId: 'tsp-001',
    tspName: 'Transporter 1',
    workspaceId: 'ws-anptco',
    verified: true,
    assignedTruckId: 'truck-001',
    currentStatus: 'AVAILABLE',
    createdAt: new Date('2026-01-15'),
  },
  {
    id: 'driver-002',
    email: 'driver2@transporter1.com',
    password: 'driver123',
    firstName: 'Driver',
    lastName: '2',
    phone: '+968 9876 5432',
    licenseNumber: 'DL-OM-002',
    tspId: 'tsp-001',
    tspName: 'Transporter 1',
    workspaceId: 'ws-anptco',
    verified: true,
    assignedTruckId: 'truck-002',
    currentStatus: 'AVAILABLE',
    createdAt: new Date('2026-01-20'),
  },
  {
    id: 'driver-003',
    email: 'driver1@transporter2.com',
    password: 'driver123',
    firstName: 'Driver',
    lastName: '3',
    phone: '+968 9111 2222',
    licenseNumber: 'DL-OM-003',
    tspId: 'tsp-002',
    tspName: 'Transporter 2',
    workspaceId: 'ws-anptco',
    verified: true,
    assignedTruckId: 'truck-003',
    currentStatus: 'AVAILABLE',
    createdAt: new Date('2026-01-25'),
  },
  {
    id: 'driver-004',
    email: 'driver2@transporter2.com',
    password: 'driver123',
    firstName: 'Driver',
    lastName: '4',
    phone: '+968 9333 4444',
    licenseNumber: 'DL-OM-004',
    tspId: 'tsp-002',
    tspName: 'Transporter 2',
    workspaceId: 'ws-anptco',
    verified: true,
    assignedTruckId: 'truck-005',
    currentStatus: 'AVAILABLE',
    createdAt: new Date('2026-02-05'),
  },
  {
    id: 'driver-xyz-1',
    email: 'driver1@client1.com',
    password: 'driver123',
    firstName: 'Ahmed',
    lastName: 'Al-Balushi',
    phone: '+968 9555 1010',
    licenseNumber: 'DL-OM-101',
    tspId: 'xyz-petroleum',
    tspName: 'Client 1',
    workspaceId: 'ws-xyz-petroleum',
    verified: true,
    assignedTruckId: 'truck-xyz-1',
    currentStatus: 'AVAILABLE',
    createdAt: new Date('2026-02-01'),
  },
  {
    id: 'driver-xyz-2',
    email: 'driver2@client1.com',
    password: 'driver123',
    firstName: 'Salim',
    lastName: 'Al-Harthy',
    phone: '+968 9555 2020',
    licenseNumber: 'DL-OM-102',
    tspId: 'xyz-petroleum',
    tspName: 'Client 1',
    workspaceId: 'ws-xyz-petroleum',
    verified: true,
    assignedTruckId: 'truck-xyz-2',
    currentStatus: 'AVAILABLE',
    createdAt: new Date('2026-02-01'),
  },
  {
    id: 'driver-xyz-3',
    email: 'driver3@client1.com',
    password: 'driver123',
    firstName: 'Yousuf',
    lastName: 'Al-Rawahi',
    phone: '+968 9555 3030',
    licenseNumber: 'DL-OM-103',
    tspId: 'xyz-petroleum',
    tspName: 'Client 1',
    workspaceId: 'ws-xyz-petroleum',
    verified: true,
    assignedTruckId: 'truck-xyz-3',
    currentStatus: 'AVAILABLE',
    createdAt: new Date('2026-02-01'),
  },
  {
    id: 'driver-xyz2-1',
    email: 'driver1@client2.com',
    password: 'driver123',
    firstName: 'Hamed',
    lastName: 'Al-Kindi',
    phone: '+968 9666 1010',
    licenseNumber: 'DL-OM-201',
    tspId: 'xyz-petroleum-2',
    tspName: 'Client 2',
    workspaceId: 'ws-xyz-petroleum-2',
    verified: true,
    assignedTruckId: 'truck-xyz2-1',
    currentStatus: 'AVAILABLE',
    createdAt: new Date('2026-02-10'),
  },
  {
    id: 'driver-xyz2-2',
    email: 'driver2@client2.com',
    password: 'driver123',
    firstName: 'Nasser',
    lastName: 'Al-Amri',
    phone: '+968 9666 2020',
    licenseNumber: 'DL-OM-202',
    tspId: 'xyz-petroleum-2',
    tspName: 'Client 2',
    workspaceId: 'ws-xyz-petroleum-2',
    verified: true,
    assignedTruckId: 'truck-xyz2-2',
    currentStatus: 'AVAILABLE',
    createdAt: new Date('2026-02-10'),
  },
];

// ── Demo Workspaces ───────────────────────────────────────────
const DEMO_WORKSPACES: Workspace[] = [
  {
    id: 'ws-anptco',
    name: 'ANPTCO Operations',
    slug: 'anptco-operations',
    type: 'SELLER',
    ownerId: 'seller-001',
    createdAt: new Date('2026-01-01'),
  },
  // A separate tenant onboarded specifically for Monitoring-Only (plan doc
  // Step 1: "Platform Admin creates a Workspace → Tenant"). Its trucks/drivers
  // and account are isolated from the ws-anptco marketplace tenant.
  {
    id: 'ws-xyz-petroleum',
    name: 'Client 1',
    slug: 'xyz-petroleum',
    type: 'TRANSPORT',
    ownerId: 'xyz-petroleum',
    createdAt: new Date('2026-02-01'),
  },
  // A second, independent Monitoring-Only tenant — dedicated to demoing the
  // fuel-theft / unauthorized-activity → failed-delivery path, so the first
  // XYZ Petroleum tenant can stay a clean, always-succeeds walkthrough.
  {
    id: 'ws-xyz-petroleum-2',
    name: 'Client 2',
    slug: 'xyz-petroleum-2',
    type: 'TRANSPORT',
    ownerId: 'xyz-petroleum-2',
    createdAt: new Date('2026-02-10'),
  },
];

// ── Demo Users ────────────────────────────────────────────────
const DEMO_USERS: User[] = [
  PLATFORM_ADMIN,
  {
    id: 'client-001',
    email: 'client1@fuelclient.com',
    firstName: 'Client',
    lastName: '1',
    role: 'CLIENT',
    workspaceId: 'ws-anptco',
    companyName: 'Client Corp 1',
    verified: true,
  },
  {
    id: 'seller-001',
    email: 'seller1@anptco.com',
    firstName: 'Seller 1',
    lastName: '',
    role: 'SELLER_MANAGER',
    workspaceId: 'ws-anptco',
    companyName: 'ANPTCO Fuel Depot',
    sellerCode: 'SELLER-ANPTCO-2026',
    connectedSellerIds: [],
    verified: true,
  },
  {
    id: 'tsp-001',
    email: 'admin@transporter1.com',
    firstName: 'TSP 1',
    lastName: '',
    role: 'TRANSPORT_ADMIN',
    workspaceId: 'ws-anptco',
    companyName: 'Transporter 1',
    verified: true,
  },
  {
    id: 'tsp-002',
    email: 'admin@transporter2.com',
    firstName: 'TSP 2',
    lastName: '',
    role: 'TRANSPORT_ADMIN',
    workspaceId: 'ws-anptco',
    companyName: 'Transporter 2',
    verified: true,
  },
  {
    id: 'client-002',
    email: 'client2@fuelclient.com',
    firstName: 'Client',
    lastName: '2',
    role: 'CLIENT',
    workspaceId: 'ws-anptco',
    companyName: 'Client Corp 2',
    verified: true,
  },
  // Monitoring-Only tenant — the account XYZ Petroleum itself logs into on
  // this platform to watch their own fleet. Their trucks/drivers below are
  // registered under ws-xyz-petroleum, not the ws-anptco marketplace tenant.
  {
    id: 'xyz-petroleum',
    email: 'ops@client1.com',
    firstName: 'Client',
    lastName: '1',
    role: 'SELLER_MANAGER',
    workspaceId: 'ws-xyz-petroleum',
    companyName: 'Client 1',
    verified: true,
  },
  {
    id: 'xyz-petroleum-2',
    email: 'ops@client2.com',
    firstName: 'Client',
    lastName: '2',
    role: 'SELLER_MANAGER',
    workspaceId: 'ws-xyz-petroleum-2',
    companyName: 'Client 2',
    verified: true,
  },
];

// ── Demo Trucks ───────────────────────────────────────────────
// Every truck shares the fixed layout: 4 generic compartments × 9,100 L (36,400 L total).
const DEMO_TRUCKS: Truck[] = [
  {
    id: 'truck-001',
    registrationNumber: 'TRK-001',
    assignedDriverId: 'driver-001',
    tspId: 'tsp-001',
    tspName: 'Transporter 1',
    workspaceId: 'ws-anptco',
    compartments: makeStandardCompartments(),
    capacity: TRUCK_CAPACITY,
    status: 'IDLE',
    currentLat: 23.670250,
    currentLng: 58.189120,
    qrCode: 'QR-TRK-001',
    sensorConfigured: true,
    commercialApproval: true,
    safetyApproval: true,
    createdAt: new Date('2026-01-15'),
  },
  {
    id: 'truck-002',
    registrationNumber: 'TRK-002',
    assignedDriverId: 'driver-002',
    tspId: 'tsp-001',
    tspName: 'Transporter 1',
    workspaceId: 'ws-anptco',
    compartments: makeStandardCompartments(),
    capacity: TRUCK_CAPACITY,
    status: 'IDLE',
    currentLat: 23.670250,
    currentLng: 58.189120,
    qrCode: 'QR-TRK-002',
    sensorConfigured: true,
    commercialApproval: true,
    safetyApproval: true,
    createdAt: new Date('2026-01-20'),
  },
  {
    id: 'truck-003',
    registrationNumber: 'TRK-003',
    assignedDriverId: 'driver-003',
    tspId: 'tsp-002',
    tspName: 'Transporter 2',
    workspaceId: 'ws-anptco',
    compartments: makeStandardCompartments(),
    capacity: TRUCK_CAPACITY,
    status: 'IDLE',
    currentLat: 23.670250,
    currentLng: 58.189120,
    qrCode: 'QR-TRK-003',
    sensorConfigured: true,
    commercialApproval: true,
    safetyApproval: true,
    createdAt: new Date('2026-01-25'),
  },
  {
    id: 'truck-004',
    registrationNumber: 'TRK-004',
    assignedDriverId: undefined,
    tspId: 'tsp-002',
    tspName: 'Transporter 2',
    workspaceId: 'ws-anptco',
    compartments: makeStandardCompartments(),
    capacity: TRUCK_CAPACITY,
    status: 'PENDING_INTEGRATION',
    currentLat: 23.670250,
    currentLng: 58.189120,
    createdAt: new Date('2026-02-08'),
  },
  // Spare — a second, always-idle truck for Transporter 2 so a stuck/open
  // trip on TRK-001..004 (e.g. an abandoned test run) doesn't leave every
  // Full Platform truck unavailable for dispatch at once.
  {
    id: 'truck-005',
    registrationNumber: 'TRK-005',
    assignedDriverId: 'driver-004',
    tspId: 'tsp-002',
    tspName: 'Transporter 2',
    workspaceId: 'ws-anptco',
    compartments: makeStandardCompartments(),
    capacity: TRUCK_CAPACITY,
    status: 'IDLE',
    currentLat: 23.670250,
    currentLng: 58.189120,
    qrCode: 'QR-TRK-005',
    sensorConfigured: true,
    commercialApproval: true,
    safetyApproval: true,
    createdAt: new Date('2026-02-08'),
  },
  // XYZ Petroleum's own fleet — registered under ws-xyz-petroleum, the
  // Monitoring-Only tenant, not the ws-anptco marketplace tenant above.
  {
    id: 'truck-xyz-1',
    registrationNumber: 'TRK-101',
    assignedDriverId: 'driver-xyz-1',
    tspId: 'xyz-petroleum',
    tspName: 'Client 1',
    workspaceId: 'ws-xyz-petroleum',
    compartments: makeStandardCompartments(),
    capacity: TRUCK_CAPACITY,
    status: 'IDLE',
    currentLat: 23.670250,
    currentLng: 58.189120,
    qrCode: 'QR-TRK-101',
    galileoskyDeviceId: 'GSKY-XYZ-101',
    sensorConfigured: true,
    commercialApproval: true,
    safetyApproval: true,
    createdAt: new Date('2026-02-01'),
  },
  {
    id: 'truck-xyz-2',
    registrationNumber: 'TRK-102',
    assignedDriverId: 'driver-xyz-2',
    tspId: 'xyz-petroleum',
    tspName: 'Client 1',
    workspaceId: 'ws-xyz-petroleum',
    compartments: makeStandardCompartments(),
    capacity: TRUCK_CAPACITY,
    status: 'IDLE',
    currentLat: 23.670250,
    currentLng: 58.189120,
    qrCode: 'QR-TRK-102',
    galileoskyDeviceId: 'GSKY-XYZ-102',
    sensorConfigured: true,
    commercialApproval: true,
    safetyApproval: true,
    createdAt: new Date('2026-02-01'),
  },
  {
    id: 'truck-xyz-3',
    registrationNumber: 'TRK-103',
    assignedDriverId: 'driver-xyz-3',
    tspId: 'xyz-petroleum',
    tspName: 'Client 1',
    workspaceId: 'ws-xyz-petroleum',
    compartments: makeStandardCompartments(),
    capacity: TRUCK_CAPACITY,
    status: 'IDLE',
    currentLat: 23.670250,
    currentLng: 58.189120,
    qrCode: 'QR-TRK-103',
    galileoskyDeviceId: 'GSKY-XYZ-103',
    sensorConfigured: true,
    commercialApproval: true,
    safetyApproval: true,
    createdAt: new Date('2026-02-01'),
  },
  // XYZ Petroleum 2's own fleet — the theft/unauthorized-activity demo tenant.
  {
    id: 'truck-xyz2-1',
    registrationNumber: 'TRK-201',
    assignedDriverId: 'driver-xyz2-1',
    tspId: 'xyz-petroleum-2',
    tspName: 'Client 2',
    workspaceId: 'ws-xyz-petroleum-2',
    compartments: makeStandardCompartments(),
    capacity: TRUCK_CAPACITY,
    status: 'IDLE',
    currentLat: 23.670250,
    currentLng: 58.189120,
    qrCode: 'QR-TRK-201',
    galileoskyDeviceId: 'GSKY-XYZ2-201',
    sensorConfigured: true,
    commercialApproval: true,
    safetyApproval: true,
    createdAt: new Date('2026-02-10'),
  },
  {
    id: 'truck-xyz2-2',
    registrationNumber: 'TRK-202',
    assignedDriverId: 'driver-xyz2-2',
    tspId: 'xyz-petroleum-2',
    tspName: 'Client 2',
    workspaceId: 'ws-xyz-petroleum-2',
    compartments: makeStandardCompartments(),
    capacity: TRUCK_CAPACITY,
    status: 'IDLE',
    currentLat: 23.670250,
    currentLng: 58.189120,
    qrCode: 'QR-TRK-202',
    galileoskyDeviceId: 'GSKY-XYZ2-202',
    sensorConfigured: true,
    commercialApproval: true,
    safetyApproval: true,
    createdAt: new Date('2026-02-10'),
  },
];

// Orders start empty — placed fresh by clients during the demo
const DEMO_ORDERS: Order[] = [];

// ── Demo Sensor Requests ──────────────────────────────────────
const DEMO_SENSOR_REQUESTS: SensorIntegrationRequest[] = [
  {
    id: 'sensor-001',
    transporterId: 'tsp-002',
    transporterName: 'Transporter 2',
    workspaceId: 'ws-anptco',
    sellerId: 'seller-001',
    sellerName: 'ANPTCO Fuel Depot',
    sellerCode: 'SELLER-ANPTCO-2026',
    truckId: 'truck-004',
    truckRegistration: 'TRK-004',
    driverId: '',
    driverName: 'UNASSIGNED',
    status: 'PENDING_SELLER_APPROVAL',
    requestedAt: new Date(),
    sensorIntegrationComplete: false,
  },
];

const DEMO_CONNECTIONS: SellerConnectionRequest[] = [
  {
    id: 'conn-001',
    transporterId: 'tsp-001',
    transporterName: 'Transporter 1',
    sellerId: 'seller-001',
    sellerName: 'ANPTCO Fuel Depot',
    sellerCode: 'SELLER-ANPTCO-2026',
    status: 'APPROVED',
    requestedAt: new Date('2026-01-10'),
  },
  {
    id: 'conn-002',
    transporterId: 'tsp-002',
    transporterName: 'Transporter 2',
    sellerId: 'seller-001',
    sellerName: 'ANPTCO Fuel Depot',
    sellerCode: 'SELLER-ANPTCO-2026',
    status: 'APPROVED',
    requestedAt: new Date('2026-01-12'),
  },
];

const DEMO_CODES: SellerOnboarding[] = [
  {
    sellerId: 'seller-001',
    sellerCode: 'SELLER-ANPTCO-2026',
    enabled: true,
    createdAt: new Date(),
  },
];

const getDemoKYC = (): KYCDocument[] => {
  return [
    {
      id: 'kyc-demo-001',
      userId: 'tsp-001',
      userName: 'Trans Admin 1',
      userEmail: 'admin@transporter1.com',
      workspaceId: 'ws-anptco',
      documentType: 'Transport Business License',
      documentUrl: '',
      reviewStatus: 'APPROVED',
      uploadedAt: new Date('2026-01-15'),
      reviewedAt: new Date('2026-01-18'),
      reviewedBy: 'seller-001',
    },
    {
      id: 'kyc-demo-002',
      userId: 'tsp-002',
      userName: 'Trans Admin 2',
      userEmail: 'admin@transporter2.com',
      workspaceId: 'ws-anptco',
      documentType: 'Transport Business License',
      documentUrl: '',
      reviewStatus: 'PENDING',
      uploadedAt: new Date('2026-01-20'),
      reviewedAt: undefined,
      reviewedBy: undefined,
    },
    {
      id: 'kyc-demo-003',
      userId: 'client-001',
      userName: 'Client 1',
      userEmail: 'client1@fuelclient.com',
      workspaceId: 'ws-anptco',
      documentType: 'Client Business Registration',
      documentUrl: '',
      reviewStatus: 'APPROVED',
      uploadedAt: new Date('2026-01-22'),
      reviewedAt: new Date('2026-01-24'),
      reviewedBy: 'seller-001',
    },
  ];
};

// ── Demo Notifications (seeded) ───────────────────────────────
const DEMO_NOTIFICATIONS: Notification[] = [
  {
    id: 'notif-welcome-seller',
    userId: 'seller-001',
    type: 'SYSTEM',
    title: '👋 Welcome to OOMCO Demo',
    message: 'Clients will place orders and you will receive a notification here instantly.',
    read: false,
    createdAt: new Date(Date.now() - 2 * 60 * 1000),
  },
  {
    id: 'notif-welcome-tsp1',
    userId: 'tsp-001',
    type: 'SYSTEM',
    title: '👋 Welcome, Transporter 1',
    message: 'Orders assigned to you will appear here. Assign trucks and manage deliveries.',
    read: false,
    createdAt: new Date(Date.now() - 2 * 60 * 1000),
  },
  {
    id: 'notif-welcome-tsp2',
    userId: 'tsp-002',
    type: 'SYSTEM',
    title: '👋 Welcome, Transporter 2',
    message: 'TRK-004 is pending sensor integration. Check your tickets for next steps.',
    read: false,
    createdAt: new Date(Date.now() - 2 * 60 * 1000),
  },
  {
    id: 'notif-welcome-client1',
    userId: 'client-001',
    type: 'SYSTEM',
    title: '👋 Welcome, Client 1',
    message: 'Ready to order? Click "Place Order" to request fuel delivery.',
    read: false,
    createdAt: new Date(Date.now() - 2 * 60 * 1000),
  },
  {
    id: 'notif-welcome-client2',
    userId: 'client-002',
    type: 'SYSTEM',
    title: '👋 Welcome, Client 2',
    message: 'Ready to order? Click "Place Order" to request fuel delivery.',
    read: false,
    createdAt: new Date(Date.now() - 2 * 60 * 1000),
  },
];

// ── Initialize storage ────────────────────────────────────────
const initializeStorage = () => {
  if (typeof window === 'undefined') return;

  localStorage.setItem(STORAGE_KEYS.USERS,             JSON.stringify(DEMO_USERS));
  localStorage.setItem(STORAGE_KEYS.WORKSPACES,        JSON.stringify(DEMO_WORKSPACES));
  localStorage.setItem(STORAGE_KEYS.TRUCKS,            JSON.stringify(DEMO_TRUCKS));
  localStorage.setItem(STORAGE_KEYS.SENSOR_REQUESTS,   JSON.stringify(DEMO_SENSOR_REQUESTS));
  localStorage.setItem(STORAGE_KEYS.ORDERS,            JSON.stringify(DEMO_ORDERS));
  localStorage.setItem(STORAGE_KEYS.KYC,               JSON.stringify(getDemoKYC()));
  localStorage.setItem(STORAGE_KEYS.TICKETS,           JSON.stringify([]));
  localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS,     JSON.stringify(DEMO_NOTIFICATIONS));
  localStorage.setItem(STORAGE_KEYS.DRIVERS,           JSON.stringify(DEMO_DRIVERS));
  localStorage.setItem(STORAGE_KEYS.SELLER_CONNECTIONS,JSON.stringify(DEMO_CONNECTIONS));
  localStorage.setItem(STORAGE_KEYS.SELLER_CODES,      JSON.stringify(DEMO_CODES));
  localStorage.removeItem(ANOMALY_KEY);
};

export const resetDemoData = () => {
  if (typeof window === 'undefined') return;
  Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
  localStorage.removeItem(VERSION_KEY);
  localStorage.removeItem(ANOMALY_KEY);
  initializeStorage();
  localStorage.setItem(VERSION_KEY, DEMO_VERSION);
};

if (typeof window !== 'undefined') {
  // Auto-reset if demo version changed
  if (localStorage.getItem(VERSION_KEY) !== DEMO_VERSION) {
    Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
    localStorage.removeItem(ANOMALY_KEY);
    initializeStorage();
    localStorage.setItem(VERSION_KEY, DEMO_VERSION);
  }
}

// ── Save helper ───────────────────────────────────────────────
const saveToStorage = (key: string, data: any) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(data));
  }
};

// ── Getters ───────────────────────────────────────────────────
export const getUsers = (): User[] => {
  if (typeof window === 'undefined') return DEMO_USERS;
  const stored = localStorage.getItem(STORAGE_KEYS.USERS);
  return stored ? JSON.parse(stored) : DEMO_USERS;
};

export const getWorkspaces = (): Workspace[] => {
  if (typeof window === 'undefined') return DEMO_WORKSPACES;
  const stored = localStorage.getItem(STORAGE_KEYS.WORKSPACES);
  if (!stored) return DEMO_WORKSPACES;
  return JSON.parse(stored).map((ws: any) => ({
    ...ws,
    createdAt: ws.createdAt ? new Date(ws.createdAt) : new Date(),
  }));
};

export const getTrucks = (): Truck[] => {
  if (typeof window === 'undefined') return DEMO_TRUCKS;
  const stored = localStorage.getItem(STORAGE_KEYS.TRUCKS);
  if (!stored) return DEMO_TRUCKS;
  return JSON.parse(stored).map((truck: any) => ({
    ...truck,
    createdAt: truck.createdAt ? new Date(truck.createdAt) : new Date(),
  }));
};

export const getOrders = (): Order[] => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(STORAGE_KEYS.ORDERS);
  if (!stored) return [];
  return JSON.parse(stored).map((order: any) => ({
    ...order,
    createdAt:             order.createdAt             ? new Date(order.createdAt)             : new Date(),
    updatedAt:             order.updatedAt             ? new Date(order.updatedAt)             : undefined,
    scheduledDeliveryTime: order.scheduledDeliveryTime ? new Date(order.scheduledDeliveryTime) : undefined,
    acceptedAt:            order.acceptedAt            ? new Date(order.acceptedAt)            : undefined,
    completedAt:           order.completedAt           ? new Date(order.completedAt)           : undefined,
    loadStartedAt:         order.loadStartedAt         ? new Date(order.loadStartedAt)         : undefined,
    loadedAt:              order.loadedAt              ? new Date(order.loadedAt)              : undefined,
    tripStartedAt:         order.tripStartedAt         ? new Date(order.tripStartedAt)         : undefined,
    arrivedAt:             order.arrivedAt             ? new Date(order.arrivedAt)             : undefined,
    cancelledAt:           order.cancelledAt           ? new Date(order.cancelledAt)           : undefined,
    rejectedAt:            order.rejectedAt            ? new Date(order.rejectedAt)            : undefined,
    assignedAt:            order.assignedAt            ? new Date(order.assignedAt)            : undefined,
  }));
};

export const getKYCDocuments = (): KYCDocument[] => {
  if (typeof window === 'undefined') return getDemoKYC();
  const stored = localStorage.getItem(STORAGE_KEYS.KYC);
  if (!stored) return getDemoKYC();
  return JSON.parse(stored).map((doc: any) => ({
    ...doc,
    uploadedAt: doc.uploadedAt ? new Date(doc.uploadedAt) : new Date(),
    reviewedAt: doc.reviewedAt ? new Date(doc.reviewedAt) : undefined,
  }));
};

export const getTickets = (): Ticket[] => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(STORAGE_KEYS.TICKETS);
  if (!stored) return [];
  return JSON.parse(stored).map((ticket: any) => ({
    ...ticket,
    createdAt:  ticket.createdAt  ? new Date(ticket.createdAt)  : new Date(),
    resolvedAt: ticket.resolvedAt ? new Date(ticket.resolvedAt) : undefined,
  }));
};

export const getNotifications = (): Notification[] => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
  if (!stored) return [];
  return JSON.parse(stored).map((notif: any) => ({
    ...notif,
    createdAt: notif.createdAt ? new Date(notif.createdAt) : new Date(),
  }));
};

export const getSensorRequests = (): SensorIntegrationRequest[] => {
  if (typeof window === 'undefined') return DEMO_SENSOR_REQUESTS;
  const stored = localStorage.getItem(STORAGE_KEYS.SENSOR_REQUESTS);
  if (!stored) return DEMO_SENSOR_REQUESTS;
  return JSON.parse(stored).map((req: any) => ({
    ...req,
    requestedAt:        req.requestedAt        ? new Date(req.requestedAt)        : new Date(),
    managerReviewedAt:  req.managerReviewedAt  ? new Date(req.managerReviewedAt)  : undefined,
    forwardedToAdminAt: req.forwardedToAdminAt ? new Date(req.forwardedToAdminAt) : undefined,
    adminReviewedAt:    req.adminReviewedAt    ? new Date(req.adminReviewedAt)    : undefined,
  }));
};

export const getSellerConnections = (): SellerConnectionRequest[] => {
  if (typeof window === 'undefined') return DEMO_CONNECTIONS;
  const stored = localStorage.getItem(STORAGE_KEYS.SELLER_CONNECTIONS);
  return stored ? JSON.parse(stored) : DEMO_CONNECTIONS;
};

export const getSellerCodes = (): SellerOnboarding[] => {
  if (typeof window === 'undefined') return DEMO_CODES;
  const stored = localStorage.getItem(STORAGE_KEYS.SELLER_CODES);
  return stored ? JSON.parse(stored) : DEMO_CODES;
};

export const findSellerByCode = (sellerCode: string) => {
  return getUsers().find(
    (user: any) => user.role === 'SELLER_MANAGER' && user.sellerCode === sellerCode
  );
};

export const activateSensorIntegration = (requestId: string) => {
  const requests = getSensorRequests();
  const target = requests.find(r => r.id === requestId);
  if (!target) return;

  updateSensorRequest(requestId, {
    status: 'ADMIN_APPROVED',
    adminApproved: true,
    adminReviewedAt: new Date(),
    sensorIntegrationComplete: true,
    activatedAt: new Date(),
  });

  if (target.truckId) {
    updateTruck(target.truckId, {
      sensorConfigured: true,
      commercialApproval: true,
      safetyApproval: true,
      status: 'ACTIVE',
    });
  }
};

export const getVisibleSellers = (userId: string) => {
  const user = getUserById(userId);
  if (user?.role === 'TRANSPORT_ADMIN') return [];
  return getUsers().filter(u => u.role === 'SELLER_MANAGER');
};

export const canRequestSensor = (transporterId: string, sellerId: string) => {
  return getSellerConnections().some(
    r => r.transporterId === transporterId && r.sellerId === sellerId && r.status === 'APPROVED'
  );
};

export const getDrivers = (): Driver[] => {
  if (typeof window === 'undefined') return DEMO_DRIVERS;
  const stored = localStorage.getItem(STORAGE_KEYS.DRIVERS);
  if (!stored) return DEMO_DRIVERS;
  return JSON.parse(stored).map((driver: any) => ({
    ...driver,
    createdAt: driver.createdAt ? new Date(driver.createdAt) : new Date(),
  }));
};

export const generateSellerCode = (companyName: string) => {
  const prefix = companyName.replace(/\s/g, '').substring(0, 5).toUpperCase();
  const random = Math.floor(1000 + Math.random() * 9000);
  return `SELLER-${prefix}-${random}`;
};

// ── Add functions ─────────────────────────────────────────────
export const addUser = (user: User) => {
  const users = getUsers();
  const sellerCode =
    user.role === 'SELLER_MANAGER'
      ? generateSellerCode(user.companyName || user.firstName || 'Seller')
      : undefined;
  const updatedUser = { ...user, sellerCode };
  users.push(updatedUser);
  saveToStorage(STORAGE_KEYS.USERS, users);

  if (user.role === 'SELLER_MANAGER' && sellerCode) {
    const codes = getSellerCodes();
    codes.push({ sellerId: updatedUser.id, sellerCode, enabled: true, createdAt: new Date() });
    saveToStorage(STORAGE_KEYS.SELLER_CODES, codes);
  }
};

export const addWorkspace    = (workspace: Workspace)              => { const d = getWorkspaces();    d.push(workspace);    saveToStorage(STORAGE_KEYS.WORKSPACES,      d); };
export const addTruck        = (truck: Truck)                      => { const d = getTrucks();         d.push(truck);        saveToStorage(STORAGE_KEYS.TRUCKS,          d); };
export const addOrder        = (order: Order)                      => { const d = getOrders();         d.push(order);        saveToStorage(STORAGE_KEYS.ORDERS,          d); };
export const addKYCDocument  = (doc: KYCDocument)                  => { const d = getKYCDocuments();  d.push(doc);          saveToStorage(STORAGE_KEYS.KYC,             d); };
export const addTicket       = (ticket: Ticket)                    => { const d = getTickets();        d.push(ticket);       saveToStorage(STORAGE_KEYS.TICKETS,         d); };
export const addNotification = (notification: Notification)        => { const d = getNotifications(); d.push(notification); saveToStorage(STORAGE_KEYS.NOTIFICATIONS,   d); };
export const addSensorRequest= (request: SensorIntegrationRequest) => { const d = getSensorRequests();d.push(request);      saveToStorage(STORAGE_KEYS.SENSOR_REQUESTS, d); };
export const addDriver       = (driver: Driver)                    => { const d = getDrivers();        d.push(driver);       saveToStorage(STORAGE_KEYS.DRIVERS,         d); };

// ── Update functions ──────────────────────────────────────────
export const markNotificationRead = (id: string) =>
  saveToStorage(STORAGE_KEYS.NOTIFICATIONS, getNotifications().map(n => n.id === id ? { ...n, read: true } : n));

export const markAllNotificationsRead = (userId: string) =>
  saveToStorage(STORAGE_KEYS.NOTIFICATIONS, getNotifications().map(n => n.userId === userId ? { ...n, read: true } : n));

export const updateUser          = (id: string, updates: Partial<User>)                     => { saveToStorage(STORAGE_KEYS.USERS,           getUsers().map(u          => u.id === id ? { ...u, ...updates } : u)); };
export const updateWorkspace     = (id: string, updates: Partial<Workspace>)                => { saveToStorage(STORAGE_KEYS.WORKSPACES,      getWorkspaces().map(w     => w.id === id ? { ...w, ...updates } : w)); };
export const updateOrder         = (id: string, updates: Partial<Order>)                    => { saveToStorage(STORAGE_KEYS.ORDERS,          getOrders().map(o         => o.id === id ? { ...o, ...updates } : o)); };
export const updateKYCDocument   = (id: string, updates: Partial<KYCDocument>)              => { saveToStorage(STORAGE_KEYS.KYC,             getKYCDocuments().map(d   => d.id === id ? { ...d, ...updates } : d)); };
export const updateTicket        = (id: string, updates: Partial<Ticket>)                   => { saveToStorage(STORAGE_KEYS.TICKETS,         getTickets().map(t        => t.id === id ? { ...t, ...updates } : t)); };
export const updateSensorRequest = (id: string, updates: Partial<SensorIntegrationRequest>) => { saveToStorage(STORAGE_KEYS.SENSOR_REQUESTS, getSensorRequests().map(r => r.id === id ? { ...r, ...updates } : r)); };
export const updateDriver        = (id: string, updates: Partial<Driver>)                   => { saveToStorage(STORAGE_KEYS.DRIVERS,         getDrivers().map(d        => d.id === id ? { ...d, ...updates } : d)); };

export const updateTruck = (truckId: string, updates: Partial<Truck>) => {
  const trucks = getTrucks();
  const idx = trucks.findIndex(t => t.id === truckId);
  if (idx === -1) { console.error('Truck not found:', truckId); return; }
  saveToStorage(STORAGE_KEYS.TRUCKS, trucks.map(t => t.id === truckId ? { ...t, ...updates } : t));
};

// ── Capacity validation ───────────────────────────────────────

/** Normalised per-fuel-type breakdown of an order, whether single-fuel or MIXED. */
export function orderFuelBreakdown(order: any): { fuelType: string; volume: number }[] {
  if (Array.isArray(order?.fuelItems) && order.fuelItems.length > 0) {
    return order.fuelItems.map((f: any) => ({ fuelType: f.fuelType, volume: f.volume }));
  }
  if (order?.fuelType && order.fuelType !== 'MIXED') {
    return [{ fuelType: order.fuelType, volume: order.volume ?? 0 }];
  }
  return [];
}

// Per-truck capacity validation was removed: every truck is now a fixed
// 4 × 9,100 L layout and orders are capped at 4 compartments, so any truck can
// carry any valid order. The order decides which fuel fills each compartment.

/**
 * Live stored level per fuel type for a station: seed `base` plus everything
 * received from completed deliveries to that station, capped at capacity.
 * Single source of truth shared by the client dashboard and order validation.
 */
export function stationFuelLevels(zoneId: string): Record<string, { current: number; capacity: number }> {
  const zone: any = DELIVERY_ZONES.find(z => z.id === zoneId);
  if (!zone?.fuels) return {};
  const completed = getOrders().filter((o: any) => o.destination === zoneId && o.status === 'COMPLETED');
  const out: Record<string, { current: number; capacity: number }> = {};
  Object.entries<any>(zone.fuels).forEach(([fuel, cfg]) => {
    const received = completed.reduce((sum: number, o: any) => {
      if (Array.isArray(o.fuelItems) && o.fuelItems.length) {
        const item = o.fuelItems.find((f: any) => f.fuelType === fuel);
        return sum + (item?.volume || 0);
      }
      return sum + (o.fuelType === fuel ? (o.volume || 0) : 0);
    }, 0);
    out[fuel] = { current: Math.min(cfg.base + received, cfg.capacity), capacity: cfg.capacity };
  });
  return out;
}

/** Remaining storage headroom (capacity − current level) per fuel type for a station. */
export function stationFuelHeadroom(zoneId: string): Record<string, number> {
  const out: Record<string, number> = {};
  Object.entries(stationFuelLevels(zoneId)).forEach(([fuel, l]) => {
    out[fuel] = Math.max(0, l.capacity - l.current);
  });
  return out;
}

/**
 * Will these fuel items fit in the chosen station? Flags any fuel type whose
 * ordered volume exceeds the station's remaining headroom (i.e. would overfill).
 */
export function checkOrderFitsStation(
  zoneId: string,
  fuelItems: { fuelType: string; volume: number }[],
): { ok: boolean; exceeded: { fuelType: string; requested: number; headroom: number }[] } {
  const headroom = stationFuelHeadroom(zoneId);
  const exceeded = fuelItems
    .map(({ fuelType, volume }) => ({ fuelType, requested: volume, headroom: headroom[fuelType] ?? 0 }))
    .filter(s => s.requested > s.headroom);
  return { ok: exceeded.length === 0, exceeded };
}

// ── Order identity + event timeline ───────────────────────────

/**
 * Short, human-readable code for an order. Order ids look like `order-1748275832123`;
 * the unique part is the timestamp TAIL, so we show the last 6 chars (not the first,
 * which are always "order-1…" and identical for every order).
 */
export function shortOrderId(id: string | null | undefined): string {
  if (!id) return '—';
  return String(id).replace(/^order-/, '').slice(-6).toUpperCase();
}

export type OrderEventTone = 'default' | 'success' | 'active' | 'alert';
export type OrderEvent = {
  key:    string;
  icon:   string;
  label:  string;
  detail?: string;
  at?:    Date;
  tone:   OrderEventTone;
};

const ORDER_STATUS_SEQUENCE = [
  'PLACED', 'ACCEPTED_BY_SELLER', 'ASSIGNED_TO_TSP', 'ASSIGNED', 'LOADING', 'LOADED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED',
];

/**
 * Chronological event feed for a single order — derived from the timestamps stored
 * on the order as it moves through the workflow, merged with any fuel anomalies
 * detected during its journey. Used by the seller & transporter order views.
 */
export function getOrderTimeline(order: any, anomalies?: FuelAnomaly[]): OrderEvent[] {
  if (!order) return [];
  const toDate = (v: any) => (v ? new Date(v) : undefined);
  const reached = ORDER_STATUS_SEQUENCE.indexOf(order.status);

  const milestones: (OrderEvent & { seq: number })[] = [
    { seq: 0, key: 'placed',   icon: '📦', label: 'Order placed',          detail: order.clientName, at: toDate(order.createdAt),        tone: 'default' },
    { seq: 1, key: 'accepted', icon: '✅', label: 'Accepted by seller',     at: toDate(order.acceptedAt),                                 tone: 'default' },
    { seq: 2, key: 'tsp',      icon: '🏢', label: 'Assigned to transporter', at: toDate(order.assignedToTspAt),                            tone: 'default' },
    { seq: 3, key: 'truck',    icon: '🚛', label: 'Truck assigned',         detail: [order.assignedTruckRegistration, order.assignedDriverName].filter(Boolean).join(' · '), at: toDate(order.truckAssignedAt), tone: 'default' },
    { seq: 5, key: 'loaded',   icon: '🛢️', label: 'Fuel loaded',            detail: 'Compartments filled at depot', at: toDate(order.loadedAt),    tone: 'default' },
    { seq: 6, key: 'enroute',  icon: '🚦', label: 'Journey started',        detail: 'Left depot', at: toDate(order.tripStartedAt),  tone: 'active' },
    { seq: 7, key: 'arrived',  icon: '📍', label: 'Arrived at station',     detail: order.destinationName, at: toDate(order.arrivedAt),    tone: 'active' },
    { seq: 8, key: 'done',     icon: '🔒', label: 'Delivery completed',     detail: 'QR verified', at: toDate(order.completedAt),          tone: 'success' },
  ];

  const events: OrderEvent[] = [];

  if (order.status === 'CANCELLED') {
    events.push(milestones[0]);
    events.push({ key: 'cancelled', icon: '❌', label: 'Order cancelled', tone: 'alert', at: toDate(order.cancelledAt) });
  } else {
    milestones.forEach(m => {
      // Show a milestone once the order has reached that stage (or if it carries a timestamp).
      if ((reached >= 0 && m.seq <= reached) || m.at) {
        const { seq, ...evt } = m;
        // Completed steps read as done (green); the current stage is active (blue).
        if (reached >= 0) {
          evt.tone =
            seq < reached   ? 'success' :
            seq === reached ? (order.status === 'COMPLETED' ? 'success' : 'active') :
                              evt.tone;
        }
        events.push(evt);
      }
    });
  }

  // Merge fuel anomalies detected for this order.
  (anomalies ?? getFuelAnomalies())
    .filter(a => a.orderId === order.id)
    .forEach(a => events.push({
      key:   `anomaly-${a.id}`,
      icon:  '🚨',
      label: `Fuel anomaly — ${a.fuelDropLiters}L drop`,
      detail: [a.compartment, a.location, a.severity].filter(Boolean).join(' · '),
      at:    toDate(a.detectedAt),
      tone:  'alert',
    }));

  // Sort by timestamp when available; events without a time keep their insertion order.
  return events
    .map((e, i) => ({ e, i }))
    .sort((x, y) => {
      const tx = x.e.at?.getTime();
      const ty = y.e.at?.getTime();
      if (tx != null && ty != null) return tx - ty || x.i - y.i;
      if (tx != null) return -1;
      if (ty != null) return 1;
      return x.i - y.i;
    })
    .map(({ e }) => e);
}

// ── Live journey tracking ─────────────────────────────────────
// How long a depot → destination journey takes in the demo.
export const JOURNEY_DURATION_MS = 60_000;

/** 0 → 1 progress of an order's journey, derived from its tripStartedAt timestamp. */
export function journeyProgress(order: any): number {
  if (order?.status === 'ARRIVED' || order?.status === 'COMPLETED') return 1;
  const start = order?.tripStartedAt ? new Date(order.tripStartedAt).getTime() : 0;
  if (!start) return 0;
  return Math.max(0, Math.min(1, (Date.now() - start) / JOURNEY_DURATION_MS));
}

/** Destination coordinates for an order (prefers the order's own coords, falls back to the zone). */
export function destinationCoords(order: any): { lat: number; lng: number } {
  if (typeof order?.destinationLat === 'number' && typeof order?.destinationLng === 'number') {
    return { lat: order.destinationLat, lng: order.destinationLng };
  }
  const zone = DELIVERY_ZONES.find(z => z.id === order?.destination);
  return zone ? { lat: zone.lat, lng: zone.lng } : { lat: FIXED_DEPOT.lat, lng: FIXED_DEPOT.lng };
}

/**
 * Flip any LOADING order whose fill window has elapsed to LOADED (compartments
 * full, truck ready to depart). Mirrors advanceJourneys — call it on the same poll.
 */
export function advanceLoading(): boolean {
  let changed = false;
  getOrders().forEach((o: any) => {
    if (
      o.status === 'LOADING' && o.loadStartedAt &&
      Date.now() - new Date(o.loadStartedAt).getTime() >= LOADING_DURATION_MS
    ) {
      updateOrder(o.id, { status: 'LOADED', loadedAt: new Date() });
      if (o.assignedTruckId) updateTruck(o.assignedTruckId, { status: 'LOADED' });
      changed = true;
    }
  });
  return changed;
}

/** Radius (metres) of the destination geofence — order-specific if set, else the station's own, else a tenant default. */
export function destinationGeofenceRadiusM(order: any): number {
  if (typeof order?.geofenceRadiusM === 'number') return order.geofenceRadiusM;
  const zone = DELIVERY_ZONES.find(z => z.id === order?.destination);
  return zone?.radius ?? FIXED_DEPOT.geofenceRadius;
}

const GEOFENCE_DEBOUNCE_KEY = 'order_geofence_debounce';

function readGeofenceDebounceMap(): Record<string, DebounceState> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(GEOFENCE_DEBOUNCE_KEY) ?? '{}'); } catch { return {}; }
}

function writeGeofenceDebounceMap(map: Record<string, DebounceState>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(GEOFENCE_DEBOUNCE_KEY, JSON.stringify(map));
}

/** Current geofence debounce readout for an order (for the "N/3 fixes inside" UI). */
export function getGeofenceDebounceState(orderId: string): DebounceState {
  return readGeofenceDebounceMap()[orderId] ?? initialDebounceState();
}

// Tenants whose EN_ROUTE deliveries automatically run the theft pipeline
// partway through the trip (see advanceJourneys below) — no manual "Report
// unauthorized activity" click needed. XYZ Petroleum 2 exists specifically
// to demo this failure mode reliably; XYZ Petroleum LLC (and every Full
// Platform TSP) stays untouched, so it's still the clean always-succeeds walkthrough.
const AUTO_THEFT_TENANTS = ['xyz-petroleum-2'];

/**
 * Flip any EN_ROUTE order to ARRIVED once its truck has genuinely entered the
 * destination geofence — replacing the old flat "60s timer = arrived" stand-in.
 * Position is the same depot→destination interpolation the map already draws,
 * with light GPS jitter; each tick is recorded as real telemetry (plan §5) and
 * tested against the geofence radius with ENTER debounced over N consecutive
 * fixes (plan §7) so jitter near the boundary can't flap the state.
 */
export function advanceJourneys(): boolean {
  let changed = false;
  const debounceMap = readGeofenceDebounceMap();
  const trucks = getTrucks();

  getOrders().forEach((o: any) => {
    if (o.status !== 'EN_ROUTE') return;
    // No GPS signal, no position updates and no geofence progress — this is
    // exactly what a real lost-signal truck looks like: the platform simply
    // stops hearing from it until the signal (or the demo trigger) restores.
    if (o.telemetryStatus === 'NO_SIGNAL') return;

    const truck = trucks.find(t => t.id === o.assignedTruckId);
    const t = journeyProgress(o);
    const dest = destinationCoords(o);

    // Automatic theft demo — XYZ Petroleum 2 is the dedicated "things go
    // wrong" tenant, so its deliveries fail on their own partway through the
    // trip, no manual "Report unauthorized activity" click required. Staged,
    // not instant: the truck visibly stops at a fixed off-route position,
    // fuel drains down in view over real time (orderFuelPhase reads
    // stoppedAt directly), and only once it's been stopped for
    // STOP_ALERT_MS does the real pipeline evaluate the — by then genuinely
    // recorded, not fabricated — declining stationary/off-geofence readings
    // and raise the alert.
    if (AUTO_THEFT_TENANTS.includes(o.assignedTSPId) && o.assignedTruckId) {
      if (o.stoppedAt) {
        const deviceId = truck?.galileoskyDeviceId ?? `IMEI-${o.assignedTruckId}`;
        const elapsed = Date.now() - new Date(o.stoppedAt).getTime();
        const { readings } = orderFuelTelemetry(o); // reflects the live drain via orderFuelPhase
        ingestTelemetry({
          truckId: o.assignedTruckId, deviceId,
          lat: o.stoppedLat, lng: o.stoppedLng,
          speed: 0, ignition: false, ts: Date.now(),
          compartmentVolumes: readings.map(r => r.volume),
        });

        if (elapsed >= STOP_ALERT_MS) {
          // Deliberately NOT evaluateTheftRisk here: that function looks for
          // a high→low *transition* inside its last-5-readings window, which
          // is exactly right for spotting a drop in an ambient stream. But by
          // 30s stopped, the drain has long since plateaued at its floor
          // (STOP_DRAIN_MS is 26s), so the last 5 readings are all flat and
          // a transition-detector correctly (but unhelpfully) finds no
          // change. This is a constructed, deterministic "stopped too long"
          // scenario, not a noisy stream to search — compare the fill
          // directly against the known full capacity instead.
          const fullVolume = orderCompartmentPlan(o).reduce((s, c) => s + (c.fuelType ? c.capacity : 0), 0);
          const currentVolume = orderFuelTelemetry(o).totalVolume;
          const dropLiters = Math.max(0, fullVolume - currentVolume);
          const dropPct = fullVolume > 0 ? (dropLiters / fullVolume) * 100 : 0;
          const stoppedS = Math.round(elapsed / 1000);
          const reasoning = `${dropLiters}L (${Math.round(dropPct)}%) drop while stopped · truck stationary with ignition off · outside any authorized geofence`;

          if (dropLiters > fullVolume * THEFT_DROP_FRACTION) {
            addFuelAnomaly({
              id:             `anomaly-${Date.now()}`,
              orderId:        o.id,
              truckReg:       o.assignedTruckRegistration ?? 'TRK',
              compartment:    'All compartments',
              fuelDropLiters: Math.round(dropLiters),
              fuelDropPercent: Math.round(dropPct),
              location:       `Stopped ${stoppedS}s at an unauthorized location · ${reasoning}`,
              detectedAt:     new Date(),
              severity:       'HIGH',
              status:         'OPEN',
            });
            if (o.assignedTSPId) {
              addNotification({
                id: `notif-theft-${Date.now()}`, userId: o.assignedTSPId,
                type: 'FUEL_ANOMALY', title: '🚨 Fuel theft detected',
                message: `${o.assignedTruckRegistration ?? 'Truck'} — ${Math.round(dropLiters)}L (${Math.round(dropPct)}%) drop while stopped outside any authorized geofence. Delivery #${shortOrderId(o.id)} aborted.`,
                read: false, createdAt: new Date(),
              });
            }
            updateOrder(o.id, {
              status: 'DELIVERY_FAILED',
              failedAt: new Date(),
              failureReason: `Vehicle stopped at this position for more than ${Math.round(STOP_ALERT_MS / 1000)} seconds — ${reasoning}`,
            });
            updateTruck(o.assignedTruckId, { status: 'RETURNING' });
            if (o.erpTripId) void updateErpTripStatus(o.erpTripId, 'CANCELLED');
            void sendWebhook({
              event: 'theft.alert',
              trip_id: o.erpTripId ?? o.id,
              erp_dispatch_no: o.erpDispatchNo ?? o.id,
              occurred_at: new Date().toISOString(),
              data: {
                drop_liters: Math.round(dropLiters),
                stopped_seconds: stoppedS,
                reasoning,
                driver: o.assignedDriverName,
                driver_phone: o.assignedDriverPhone,
              },
            });
            void sendWebhook({
              event: 'trip.exception',
              trip_id: o.erpTripId ?? o.id,
              erp_dispatch_no: o.erpDispatchNo ?? o.id,
              occurred_at: new Date().toISOString(),
              data: { reason: 'unauthorized_activity', outcome: 'DELIVERY_FAILED' },
            });
          }
        }
        changed = true;
        return; // stopped (draining or already failed) — skip normal driving logic below
      }

      if (t >= 0.3) {
        // Cross the trigger point — the truck pulls off and stops right where
        // it actually was on the route at this moment (small nudge off the
        // road itself), not teleported off to a fixed offset from the
        // destination — that could land far from the visible route, in a
        // corner of the map nobody's looking at. Stopping mid-route reads
        // immediately as "it was here, then it stopped here."
        const roadRoute = getCachedRoadRoute(FIXED_DEPOT, dest);
        const atStop = roadRoute
          ? routePosition(roadRoute, t)
          : { lat: FIXED_DEPOT.lat + (dest.lat - FIXED_DEPOT.lat) * t, lng: FIXED_DEPOT.lng + (dest.lng - FIXED_DEPOT.lng) * t };
        const offRoute = { lat: atStop.lat + 0.01, lng: atStop.lng + 0.01 }; // ~1km off the road, still clearly on the route
        updateOrder(o.id, { stoppedAt: new Date(), stoppedLat: offRoute.lat, stoppedLng: offRoute.lng });
        changed = true;
        return;
      }
    }

    // Follow the actual road geometry (same OSRM path the live map draws) once
    // it's fetched; a straight-line lerp is only the fallback for the first
    // tick or two before the route arrives, so recorded telemetry — and
    // anything built on it, like route replay — matches roads, not a
    // depot-to-destination beeline.
    const roadRoute = getCachedRoadRoute(FIXED_DEPOT, dest);
    const position = roadRoute
      ? routePosition(roadRoute, t)
      : { lat: FIXED_DEPOT.lat + (dest.lat - FIXED_DEPOT.lat) * t, lng: FIXED_DEPOT.lng + (dest.lng - FIXED_DEPOT.lng) * t };
    const lat = position.lat + (Math.random() - 0.5) * 0.0006;
    const lng = position.lng + (Math.random() - 0.5) * 0.0006;

    if (o.assignedTruckId) {
      const { readings } = orderFuelTelemetry(o);
      ingestTelemetry({
        truckId:  o.assignedTruckId,
        deviceId: truck?.galileoskyDeviceId ?? `IMEI-${o.assignedTruckId}`,
        lat, lng,
        speed:    t < 1 ? 55 + Math.random() * 15 : 0,
        ignition: t < 1,
        ts:       Date.now(),
        compartmentVolumes: readings.map(r => r.volume),
      });
    }

    const radius = destinationGeofenceRadiusM(o);
    const inside = isInsideGeofence({ lat, lng }, dest, radius);
    const { state: nextState, flipped } = stepDebounce(debounceMap[o.id] ?? initialDebounceState(), inside);
    debounceMap[o.id] = nextState;

    if (flipped && nextState.side === 'INSIDE') {
      updateOrder(o.id, { status: 'ARRIVED', arrivedAt: new Date() });
      if (o.assignedTruckId) updateTruck(o.assignedTruckId, { status: 'ARRIVED' });
      // The truck reached the station on its own — prompt the client to scan the QR.
      // This flip happens exactly once per order, so the notification isn't duplicated.
      if (o.clientId) {
        addNotification({
          id:        `notif-arrived-${o.id}`,
          userId:    o.clientId,
          type:      'TRUCK_ARRIVED',
          title:     '📍 Truck Has Arrived!',
          message:   `Your fuel truck (${o.assignedTruckRegistration ?? ''}) has arrived at ${o.destinationName ?? 'your location'}. Please scan the QR code to accept delivery.`,
          read:      false,
          createdAt: new Date(),
        } as any);
      }
      if (o.erpTripId) void updateErpTripStatus(o.erpTripId, 'ARRIVED');
      void sendWebhook({
        event: 'trip.arrived',
        trip_id: o.erpTripId ?? o.id,
        erp_dispatch_no: o.erpDispatchNo ?? o.id,
        occurred_at: new Date().toISOString(),
        data: { destination: dest, travel_time_min: Math.round((JOURNEY_DURATION_MS / 1000) / 60) },
      });
      changed = true;
    }
  });

  writeGeofenceDebounceMap(debounceMap);
  return changed;
}


// ── Compartment fuel telemetry (flespi-style) ────────────────
// In production, per-compartment fuel levels arrive from the Galileosky sensors
// through a flespi MQTT/webhook push — a discrete reading every few seconds, NOT
// a continuous stream. We mirror that here: the UI samples a derived reading
// every TELEMETRY_INTERVAL_MS and animates smoothly between samples (CSS), so the
// component already behaves the way it will once wired to the real feed.
export const TELEMETRY_INTERVAL_MS = 2_000;   // simulated flespi push cadence
export const LOADING_DURATION_MS   = 8_000;   // depot fill time (compartments filling)
export const OFFLOAD_DURATION_MS   = 10_000;  // station drain time (offloading)

// An unauthorized-activity stop (see advanceJourneys' AUTO_THEFT_TENANTS):
// fuel visibly drains down to STOP_DRAIN_FLOOR over STOP_DRAIN_MS — deliberately
// longer than STOP_ALERT_MS so the tank is still smoothly, visibly emptying
// (CompartmentFuel re-samples + CSS-animates every TELEMETRY_INTERVAL_MS) when
// the alert fires at STOP_ALERT_MS, then keeps draining to the floor after —
// not an instant jump straight to the floor value.
export const STOP_DRAIN_MS    = 12_000;
export const STOP_ALERT_MS    = 5_000;
export const STOP_DRAIN_FLOOR = 0.25;
// A drop has to clear this fraction of the truck's full loaded volume before
// it's flagged as theft rather than normal sensor noise (plan §6).
export const THEFT_DROP_FRACTION = 0.05;

export type FuelPhase = 'EMPTY' | 'LOADING' | 'LOADED' | 'IN_TRANSIT' | 'OFFLOADING' | 'DELIVERED';

export interface CompartmentReading {
  index:    number;
  fuelType: string | null;  // null = compartment not used by this order
  capacity: number;
  volume:   number;         // current litres (derived from phase + elapsed time)
}

/**
 * Maps an order onto the truck's 4 fixed compartments in whole-compartment units
 * (each fuel item is a multiple of 9,100 L). Unused compartments are returned empty.
 */
export function orderCompartmentPlan(order: any): { index: number; fuelType: string | null; capacity: number }[] {
  const plan: { index: number; fuelType: string | null; capacity: number }[] = [];
  let idx = 1;
  orderFuelBreakdown(order).forEach(({ fuelType, volume }) => {
    const comps = Math.max(0, Math.round(volume / COMPARTMENT_CAPACITY));
    for (let i = 0; i < comps && idx <= COMPARTMENTS_PER_TRUCK; i++) {
      plan.push({ index: idx++, fuelType, capacity: COMPARTMENT_CAPACITY });
    }
  });
  while (idx <= COMPARTMENTS_PER_TRUCK) {
    plan.push({ index: idx++, fuelType: null, capacity: COMPARTMENT_CAPACITY });
  }
  return plan;
}

/**
 * Phase + 0→1 fill factor of the loaded compartments for an order at time `now`.
 * Loading ramps up over LOADING_DURATION_MS once the journey starts; offloading
 * ramps down over OFFLOAD_DURATION_MS once the client confirms delivery (QR scan).
 */
export function orderFuelPhase(order: any, now = Date.now()): { phase: FuelPhase; fill: number } {
  if (!order) return { phase: 'EMPTY', fill: 0 };

  // Vehicle stopped at an unauthorized location — drain visibly toward
  // STOP_DRAIN_FLOOR instead of sitting at a flat 100% while "in transit."
  // Reuses the OFFLOADING phase visuals (amber, pulsing "Offloading" label),
  // which reads correctly here too: fuel is leaving the tank right now.
  // Stays frozen at the drained level after DELIVERY_FAILED so the bar
  // doesn't snap back up or to empty the instant the status flips.
  if (order.stoppedAt) {
    const elapsed = now - new Date(order.stoppedAt).getTime();
    const t = Math.max(0, Math.min(1, elapsed / STOP_DRAIN_MS));
    const fill = 1 - t * (1 - STOP_DRAIN_FLOOR);
    return { phase: 'OFFLOADING', fill };
  }

  if (order.status === 'COMPLETED') {
    const start = order.completedAt ? new Date(order.completedAt).getTime() : 0;
    const t = start ? (now - start) / OFFLOAD_DURATION_MS : 1;
    return t >= 1 ? { phase: 'DELIVERED', fill: 0 } : { phase: 'OFFLOADING', fill: Math.max(0, 1 - t) };
  }
  // Loading is its own step now: the transporter triggers it (loadStartedAt) before
  // the journey starts. Tanks ramp up over LOADING_DURATION_MS, then sit full.
  if (order.status === 'LOADING') {
    const start = order.loadStartedAt ? new Date(order.loadStartedAt).getTime() : 0;
    const t = start ? (now - start) / LOADING_DURATION_MS : 1;
    return t < 1 ? { phase: 'LOADING', fill: Math.max(0, Math.min(1, t)) } : { phase: 'LOADED', fill: 1 };
  }
  if (order.status === 'LOADED') return { phase: 'LOADED', fill: 1 };
  if (order.status === 'EN_ROUTE' || order.status === 'ARRIVED') return { phase: 'IN_TRANSIT', fill: 1 };

  // PLACED / ACCEPTED / ASSIGNED_TO_TSP / ASSIGNED / CANCELLED → not yet loaded
  return { phase: 'EMPTY', fill: 0 };
}

/** Full derived telemetry snapshot for an order's truck at time `now`. */
export function orderFuelTelemetry(order: any, now = Date.now()): {
  phase: FuelPhase;
  readings: CompartmentReading[];
  totalVolume: number;
  totalCapacity: number;
} {
  const { phase, fill } = orderFuelPhase(order, now);
  const readings: CompartmentReading[] = orderCompartmentPlan(order).map(c => ({
    ...c,
    volume: c.fuelType ? Math.round(c.capacity * fill) : 0,
  }));
  return {
    phase,
    readings,
    totalVolume:   readings.reduce((s, r) => s + r.volume, 0),
    totalCapacity: readings.reduce((s, r) => s + r.capacity, 0),
  };
}

// ── Driver helpers ────────────────────────────────────────────
export const getDriverById = (driverId: string): Driver | undefined =>
  getDrivers().find(d => d.id === driverId);

// ── Tank storage ──────────────────────────────────────────────
const TANKS_KEY = 'fuelfleet_tanks';

export interface ClientTank {
  id: string;
  clientId: string;
  name: string;
  fuelType: string;
  capacity: number;
  currentLevel: number;
  minLevel: number;
  reorderAlert: boolean;
  lastRefilled: Date;
  createdAt: Date;
}

export function getTanks(clientId?: string): ClientTank[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TANKS_KEY);
    if (!raw) return [];
    const parsed: ClientTank[] = JSON.parse(raw).map((t: any) => ({
      ...t,
      lastRefilled: new Date(t.lastRefilled),
      createdAt:    new Date(t.createdAt),
    }));
    return clientId ? parsed.filter(t => t.clientId === clientId) : parsed;
  } catch { return []; }
}

export function saveTanks(tanks: ClientTank[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TANKS_KEY, JSON.stringify(tanks));
}

export function updateTankLevel(tankId: string, addedVolume: number): void {
  if (typeof window === 'undefined') return;
  saveTanks(getTanks().map(t => {
    if (t.id !== tankId) return t;
    const newLevel = Math.min(t.currentLevel + addedVolume, t.capacity);
    return { ...t, currentLevel: newLevel, reorderAlert: newLevel <= t.minLevel, lastRefilled: new Date() };
  }));
}

// ── Current user ──────────────────────────────────────────────
export const getCurrentUser = (): User | null => {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
  return stored ? JSON.parse(stored) : null;
};

export const setCurrentUser = (user: User | null) => {
  if (typeof window === 'undefined') return;
  if (user) localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
  else      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
};

export const logout = () => setCurrentUser(null);

// ── Product mode (full vs monitoring-only) ────────────────────
export const getProductMode = (): ProductMode => {
  if (typeof window === 'undefined') return 'full';
  return localStorage.getItem(PRODUCT_MODE_KEY) === 'monitoring' ? 'monitoring' : 'full';
};

export const setProductMode = (mode: ProductMode) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PRODUCT_MODE_KEY, mode);
};

// Capability switch derived from the active product mode. Monitoring is always on;
// Ordering (marketplace screens) is full-only; the Dispatch API stands in for it
// in monitoring-only. See docs/PRODUCT_MODES.md §3.
export const getModules = (mode: ProductMode = getProductMode()): ProductModules =>
  mode === 'monitoring'
    ? { ordering: false, monitoring: true, dispatchApi: true }
    : { ordering: true,  monitoring: true, dispatchApi: false };

// ── Utility ───────────────────────────────────────────────────
export const findUserByEmail = (email: string): User | undefined =>
  getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());

export const getUserById = (userId: string): User | undefined =>
  getUsers().find(u => u.id === userId);

export const getClients = (): User[] =>
  getUsers().filter(u => u.role === 'CLIENT');

export const clearAllData = () => {
  if (typeof window === 'undefined') return;
  localStorage.clear();
  initializeStorage();
};

// ── Seller connection helpers (legacy compat) ─────────────────
export const addSellerConnection = (conn: SellerConnectionRequest) => {
  const d = getSellerConnections();
  d.push(conn);
  saveToStorage(STORAGE_KEYS.SELLER_CONNECTIONS, d);
};

export const updateSellerConnection = (id: string, updates: Partial<SellerConnectionRequest>) => {
  saveToStorage(
    STORAGE_KEYS.SELLER_CONNECTIONS,
    getSellerConnections().map(c => c.id === id ? { ...c, ...updates } : c)
  );
};

export const requestSellerConnection = (
  transporterId: string,
  transporterNameOrCode: string,
  sellerCodeArg?: string,
) => {
  // Support both (id, name, code) and (id, code) call signatures
  const sellerCode     = sellerCodeArg ?? transporterNameOrCode;
  const transporterName = sellerCodeArg ? transporterNameOrCode : (getUserById(transporterId)?.companyName ?? transporterId);

  const seller = findSellerByCode(sellerCode);
  if (!seller) return { error: 'Seller code not found' };

  const existing = getSellerConnections().find(
    c => c.transporterId === transporterId && c.sellerId === seller.id
  );
  if (existing) return { error: 'Request already exists', existing };

  const conn: SellerConnectionRequest = {
    id:              `conn-${Date.now()}`,
    transporterId,
    transporterName,
    sellerId:        seller.id,
    sellerName:      seller.companyName || `${seller.firstName} ${seller.lastName}`,
    sellerCode,
    status:          'PENDING',
    requestedAt:     new Date(),
  };
  addSellerConnection(conn);
  return { success: true, connection: conn };
};

// ── Demo persona quick-login map ──────────────────────────────
export const DEMO_PERSONAS = [
  {
    id: 'admin-platform',
    label: 'Platform Admin',
    name: 'Admin ANPTCO',
    email: 'admin@anptco.com',
    password: 'admin123',
    role: 'PLATFORM_ADMIN' as const,
    route: '/platform-admin/dashboard',
    color: 'purple',
    icon: '🛡️',
    description: 'System control, sensor management & full oversight',
  },
  {
    id: 'seller-001',
    label: 'Seller Manager',
    name: 'Seller 1',
    email: 'seller1@anptco.com',
    password: 'seller123',
    role: 'SELLER_MANAGER' as const,
    route: '/seller/dashboard',
    color: 'blue',
    icon: '🏢',
    description: 'ANPTCO Fuel Depot — manage orders, KYC & fleet',
  },
  {
    id: 'tsp-001',
    label: 'Transporter 1',
    name: 'TSP 1',
    email: 'admin@transporter1.com',
    password: 'transport123',
    role: 'TRANSPORT_ADMIN' as const,
    route: '/transport/dashboard',
    color: 'orange',
    icon: '🚛',
    description: 'Transporter 1 — 2 trucks, 3 active drivers',
  },
  {
    id: 'tsp-002',
    label: 'Transporter 2',
    name: 'TSP 2',
    email: 'admin@transporter2.com',
    password: 'transport123',
    role: 'TRANSPORT_ADMIN' as const,
    route: '/transport/dashboard',
    color: 'orange',
    icon: '🚛',
    description: 'Transporter 2 — 2 trucks, sensor integration pending',
  },
  {
    id: 'client-001',
    label: 'Client 1',
    name: 'Client 1',
    email: 'client1@fuelclient.com',
    password: 'client123',
    role: 'CLIENT' as const,
    route: '/client/dashboard',
    color: 'green',
    icon: '🏪',
    description: 'Client Corp 1 — Petrol station, place & track orders',
  },
  {
    id: 'client-002',
    label: 'Client 2',
    name: 'Client 2',
    email: 'client2@fuelclient.com',
    password: 'client123',
    role: 'CLIENT' as const,
    route: '/client/dashboard',
    color: 'green',
    icon: '🏪',
    description: 'Client Corp 2 — Industrial, place & track orders',
  },
  {
    id: 'driver-001',
    label: 'Driver 1',
    name: 'Driver 1',
    email: 'driver1@transporter1.com',
    password: 'driver123',
    role: 'DRIVER' as const,
    route: '/driver/dashboard',
    color: 'teal',
    icon: '👤',
    description: 'Truck TRK-001 — Transporter 1 driver',
  },
  {
    id: 'xyz-petroleum',
    label: 'Client 1',
    name: 'Client 1',
    email: 'ops@client1.com',
    password: 'xyz123',
    role: 'SELLER_MANAGER' as const,
    route: '/seller/dashboard',
    color: 'orange',
    icon: '🛢️',
    description: 'Monitoring-Only tenant — 2 trucks, own fleet',
  },
  {
    id: 'xyz-petroleum-2',
    label: 'Client 2',
    name: 'Client 2',
    email: 'ops@client2.com',
    password: 'xyz123',
    role: 'SELLER_MANAGER' as const,
    route: '/seller/dashboard',
    color: 'orange',
    icon: '🚨',
    description: 'Monitoring-Only tenant — theft & unauthorized activity demo',
  },
];
