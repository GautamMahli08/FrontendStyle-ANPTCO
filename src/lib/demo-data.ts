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
} from '@/src/types';

// ── Demo version — bump this to force a full localStorage reset ──
const DEMO_VERSION = 'v3.5';
const VERSION_KEY  = 'fuel_demo_version';

// ── Fuel Anomaly (theft detection) ───────────────────────────
export interface FuelAnomaly {
  id: string;
  orderId: string;
  truckReg: string;
  compartment: string;
  fuelDropLiters: number;
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
  name: 'ANPTCO Central Depot — Seeb',
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
    fuels: {
      DIESEL:  { base: 6000, capacity: 20000 },
      PETROL:  { base: 2500, capacity: 10000 },
      PREMIUM: { base: 1200, capacity: 5000  },
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
      DIESEL:  { base: 4200, capacity: 20000 },
      PETROL:  { base: 1800, capacity: 10000 },
      PREMIUM: { base: 600,  capacity: 5000  },
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
];

// ── Demo Trucks ───────────────────────────────────────────────
const DEMO_TRUCKS: Truck[] = [
  {
    id: 'truck-001',
    registrationNumber: 'TRK-001',
    assignedDriverId: 'driver-001',
    tspId: 'tsp-001',
    tspName: 'Transporter 1',
    workspaceId: 'ws-anptco',
    compartments: [
      { id: 1, capacity: 5000, fuelType: 'DIESEL', currentVolume: 0 },
      { id: 2, capacity: 5000, fuelType: 'DIESEL', currentVolume: 0 },
      { id: 3, capacity: 4000, fuelType: 'PETROL', currentVolume: 0 },
    ],
    capacity: 14000,
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
    compartments: [
      { id: 1, capacity: 6000, fuelType: 'DIESEL',  currentVolume: 0 },
      { id: 2, capacity: 4000, fuelType: 'PETROL',  currentVolume: 0 },
      { id: 3, capacity: 3000, fuelType: 'PREMIUM', currentVolume: 0 },
    ],
    capacity: 13000,
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
    compartments: [
      { id: 1, capacity: 8000, fuelType: 'DIESEL', currentVolume: 0 },
      { id: 2, capacity: 6000, fuelType: 'DIESEL', currentVolume: 0 },
      { id: 3, capacity: 4000, fuelType: 'PETROL', currentVolume: 0 },
    ],
    capacity: 18000,
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
    compartments: [
      { id: 1, capacity: 4000, fuelType: 'DIESEL',  currentVolume: 0 },
      { id: 2, capacity: 3000, fuelType: 'PETROL',  currentVolume: 0 },
      { id: 3, capacity: 2000, fuelType: 'PREMIUM', currentVolume: 0 },
    ],
    capacity: 9000,
    status: 'PENDING_INTEGRATION',
    currentLat: 23.670250,
    currentLng: 58.189120,
    createdAt: new Date('2026-02-08'),
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
    tripStartedAt:         order.tripStartedAt         ? new Date(order.tripStartedAt)         : undefined,
    arrivedAt:             order.arrivedAt             ? new Date(order.arrivedAt)             : undefined,
    cancelledAt:           order.cancelledAt           ? new Date(order.cancelledAt)           : undefined,
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

/** Total compartment capacity a truck has for each fuel type. */
export function truckFuelCapacity(truck: any): Record<string, number> {
  const caps: Record<string, number> = {};
  (truck?.compartments ?? []).forEach((c: any) => {
    const ft = c.fuelType;
    if (!ft) return;
    caps[ft] = (caps[ft] ?? 0) + (c.capacity ?? 0);
  });
  return caps;
}

/**
 * Can a single truck carry this order? Checks, per fuel type, that the truck has
 * enough compartment capacity of that fuel to hold the ordered volume.
 */
export function checkTruckFitsOrder(
  truck: any,
  order: any,
): { ok: boolean; shortfalls: { fuelType: string; required: number; available: number }[] } {
  const caps = truckFuelCapacity(truck);
  const shortfalls = orderFuelBreakdown(order)
    .map(({ fuelType, volume }) => ({ fuelType, required: volume, available: caps[fuelType] ?? 0 }))
    .filter(s => s.required > s.available);
  return { ok: shortfalls.length === 0, shortfalls };
}

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
  'PLACED', 'ACCEPTED_BY_SELLER', 'ASSIGNED_TO_TSP', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED',
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
    { seq: 4, key: 'enroute',  icon: '🚦', label: 'Journey started',        detail: 'Left ANPTCO depot', at: toDate(order.tripStartedAt),  tone: 'active' },
    { seq: 5, key: 'arrived',  icon: '📍', label: 'Arrived at station',     detail: order.destinationName, at: toDate(order.arrivedAt),    tone: 'active' },
    { seq: 6, key: 'done',     icon: '🔒', label: 'Delivery completed',     detail: 'QR verified', at: toDate(order.completedAt),          tone: 'success' },
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

/** Flip any EN_ROUTE order whose journey has elapsed to ARRIVED (truck reached the station). */
export function advanceJourneys(): boolean {
  let changed = false;
  getOrders().forEach((o: any) => {
    if (o.status === 'EN_ROUTE' && journeyProgress(o) >= 1) {
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
      changed = true;
    }
  });
  return changed;
}

/**
 * Seller assigns a transporter → a truck for that transporter immediately leaves the
 * depot and starts the journey to the destination (status EN_ROUTE, tripStartedAt = now).
 * Falls back to the manual TSP flow (ASSIGNED_TO_TSP) only if the transporter has no truck.
 */
export function assignTransporterAndDispatch(orderId: string, tspId: string): { dispatched: boolean } {
  const order: any = getOrders().find(o => o.id === orderId);
  const tsp: any = getUsers().find(u => u.id === tspId);
  if (!order || !tsp) return { dispatched: false };

  const tspTrucks = getTrucks().filter((t: any) => t.tspId === tspId);
  const truck: any = tspTrucks.find((t: any) => t.status === 'IDLE' || t.status === 'ACTIVE') ?? tspTrucks[0];

  if (truck) {
    const driver: any = getDrivers().find((d: any) => d.tspId === tspId);
    const now = new Date();
    updateOrder(orderId, {
      status:                    'EN_ROUTE',
      assignedTSPId:             tspId,
      assignedTruckId:           truck.id,
      assignedTruckRegistration: truck.registrationNumber,
      assignedDriverId:          driver?.id ?? '',
      assignedDriverName:        driver ? `${driver.firstName} ${driver.lastName}` : 'Driver',
      assignedToTspAt:           now,
      truckAssignedAt:           now,
      tripStartedAt:             now,
    });
    updateTruck(truck.id, { status: 'EN_ROUTE' });
    return { dispatched: true };
  }

  updateOrder(orderId, { status: 'ASSIGNED_TO_TSP', assignedTSPId: tspId, assignedToTspAt: new Date() });
  return { dispatched: false };
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
];
