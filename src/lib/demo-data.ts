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

// FIXED DEPOT LOCATION
export const FIXED_DEPOT = {
  id: 'depot-seeb',
  name: 'Oman Seeb Central Depot',
  address: 'Seeb, Muscat, Oman',
  lat: 23.670250,
  lng: 58.189120,
  geofenceRadius: 200,
};

// FIXED DELIVERY DESTINATIONS
export const DELIVERY_ZONES = [
  {
    id: 'qurum-station',
    name: 'Qurum Station A',
    lat: 23.612703,
    lng: 58.498615,
    radius: 250,
    clientName: 'Shell',
    address: 'Qurum, Muscat, Oman',
    type: 'Petrol Station',
  },
  {
    id: 'khuwair-station',
    name: 'Al Khuwair Station B',
    lat: 23.586549,
    lng: 58.431447,
    radius: 250,
    clientName: 'BP',
    address: 'Al Khuwair, Muscat, Oman',
    type: 'Petrol Station',
  },
  {
    id: 'rusayl-station',
    name: 'Rusayl Industrial Estate Station C',
    lat: 23.556700,
    lng: 58.203590,
    radius: 300,
    clientName: 'Total',
    address: 'Rusayl, Muscat, Oman',
    type: 'Industrial',
  },
  {
    id: 'al-amrat-station',
    name: 'Al Amrat Station E',
    lat: 23.500920,
    lng: 58.393880,
    radius: 260,
    clientName: 'Shell',
    address: 'Al Amrat, Muscat, Oman',
    type: 'Petrol Station',
  },
  {
    id: 'bowshar-station',
    name: 'Bowshar Service Station F',
    lat: 23.577510,
    lng: 58.454210,
    radius: 240,
    clientName: 'BP',
    address: 'Bowshar, Muscat, Oman',
    type: 'Petrol Station',
  },
  {
    id: 'muttrah-station',
    name: 'Muttrah Port Station G',
    lat: 23.616300,
    lng: 58.565450,
    radius: 300,
    clientName: 'Total',
    address: 'Muttrah Port, Muscat, Oman',
    type: 'Port',
  },
  {
    id: 'airport-station',
    name: 'Muscat Airport Fuel Station H',
    lat: 23.593300,
    lng: 58.284440,
    radius: 320,
    clientName: 'Oman Oil',
    address: 'Muscat Airport, Oman',
    type: 'Airport',
  },
];

export function getDeliveryLocations() {
  return DELIVERY_ZONES;
}

// Platform Admin
export const PLATFORM_ADMIN: User = {
  id: 'admin-platform',
  email: 'admin@fuelplatform.com',
  firstName: 'Platform',
  lastName: 'Admin',
  role: 'PLATFORM_ADMIN',
  verified: true,
};

// Storage keys
const STORAGE_KEYS = {
  USERS:           'fuel_users',
  WORKSPACES:      'fuel_workspaces',
  TRUCKS:          'fuel_trucks',
  ORDERS:          'fuel_orders',
  KYC:             'fuel_kyc',
  TICKETS:         'fuel_tickets',
  NOTIFICATIONS:   'fuel_notifications',
  CURRENT_USER:    'fuel_current_user',
  SENSOR_REQUESTS: 'fuel_sensor_requests',
  DRIVERS:         'fuel_drivers',
  SELLER_CONNECTIONS:'fuel_seller_connections',

SELLER_CODES:'fuel_seller_codes',
};

// ── Demo Drivers ──────────────────────────────────────────────
const DEMO_DRIVERS: Driver[] = [
  {
    id: 'driver-001',
    email: 'ahmed.driver@swift.om',
    password: 'driver123',
    firstName: 'Ahmed',
    lastName: 'Al-Balushi',
    phone: '+968 9234 5678',
    licenseNumber: 'DL-OM-123456',
    tspId: 'tsp-001',
    tspName: 'Swift Transport LLC',
    workspaceId: 'ws-oman',
    verified: true,
    assignedTruckId: 'truck-001',
    currentStatus: 'AVAILABLE',
    createdAt: new Date('2026-01-15'),
  },
  {
    id: 'driver-002',
    email: 'mohammed.driver@swift.om',
    password: 'driver123',
    firstName: 'Mohammed',
    lastName: 'Al-Rashid',
    phone: '+968 9876 5432',
    licenseNumber: 'DL-OM-567890',
    tspId: 'tsp-001',
    tspName: 'Swift Transport LLC',
    workspaceId: 'ws-oman',
    verified: true,
    assignedTruckId: 'truck-002',
    currentStatus: 'AVAILABLE',
    createdAt: new Date('2026-01-20'),
  },
  {
    id: 'driver-003',
    email: 'salem.driver@express.om',
    password: 'driver123',
    firstName: 'Salem',
    lastName: 'Al-Hinai',
    phone: '+968 9111 2222',
    licenseNumber: 'DL-OM-999999',
    tspId: 'tsp-002',
    tspName: 'Express Logistics',
    workspaceId: 'ws-oman',
    verified: true,
    assignedTruckId: 'truck-003',
    currentStatus: 'AVAILABLE',
    createdAt: new Date('2026-01-25'),
  },
];

// ── Demo Workspaces ───────────────────────────────────────────
const DEMO_WORKSPACES: Workspace[] = [
  {
    id:        'ws-oman',
    name:      'Oman Operations',
    slug:      'oman-operations',
    type:      'SELLER',
    ownerId:   'seller-001',
    createdAt: new Date('2026-01-01'),
  },
];

// ── Demo Users ────────────────────────────────────────────────
const DEMO_USERS: User[] = [
  PLATFORM_ADMIN,
  {
id:'seller-001',

email:
'seller@omanfuel.com',

firstName:
'Ahmed',

lastName:
'Al-Said',

role:
'SELLER_MANAGER',

workspaceId:
'ws-oman',

sellerCode:
'SELLER-OMAN-2026',

connectedSellerIds:[],

verified:
true,
},

  {
    id: 'tsp-002',
    email: 'express@logistics.om',
    firstName: 'Salem',
    lastName: 'Al-Hinai',
    role: 'TRANSPORT_ADMIN',
    workspaceId: 'ws-oman',
    companyName: 'Express Logistics',
    verified: true,
  },
  {
    id: 'client-001',
    email: 'client@shell.om',
    firstName: 'John',
    lastName: 'Smith',
    role: 'CLIENT',
    workspaceId: 'ws-oman',
    companyName: 'Shell Oman',
    verified: true,
  },
];

// ── Demo Trucks ───────────────────────────────────────────────
const DEMO_TRUCKS: Truck[] = [
  {
    id: 'truck-001',
    registrationNumber: 'OM-1234',
    assignedDriverId:'driver-001',
    tspId: 'tsp-001',
    tspName: 'Swift Transport LLC',
    workspaceId: 'ws-oman',
    compartments: [
      { id: 1, capacity: 5000, fuelType: 'DIESEL', currentVolume: 0 },
      { id: 2, capacity: 3000, fuelType: 'PETROL', currentVolume: 0 },
    ],
    capacity: 8000,
    status: 'IDLE',
    currentLat: 23.5880,
    currentLng: 58.3829,
    qrCode: 'QR-TRUCK-001-DEMO',
    createdAt: new Date('2026-01-15'),
  },
  {
    id: 'truck-002',
    registrationNumber: 'OM-5678',
   assignedDriverId:'driver-002',
    tspId: 'tsp-001',
    tspName: 'Swift Transport LLC',
    workspaceId: 'ws-oman',
    compartments: [
      { id: 1, capacity: 6000, fuelType: 'DIESEL', currentVolume: 0 },
      { id: 2, capacity: 4000, fuelType: 'PETROL', currentVolume: 0 },
    ],
    capacity: 10000,
    status: 'IDLE',
    currentLat: 23.6100,
    currentLng: 58.5450,
    qrCode: 'QR-TRUCK-002-DEMO',
    createdAt: new Date('2026-01-20'),
  },
  {
    id: 'truck-003',
    registrationNumber: 'OM-9999',
    assignedDriverId:'driver-003',
    tspId: 'tsp-002',
    tspName: 'Express Logistics',
    workspaceId: 'ws-oman',
    compartments: [
      { id: 1, capacity: 8000, fuelType: 'DIESEL', currentVolume: 0 },
    ],
    capacity: 8000,
    status: 'IDLE',
    currentLat: 23.5700,
    currentLng: 58.4000,
    qrCode: 'QR-TRUCK-003-DEMO',
    createdAt: new Date('2026-01-25'),
  },
  {
    id: 'truck-004',
    registrationNumber: 'JHFM4777',
    assignedDriverId:undefined,
    tspId: 'tsp-002',
    tspName: 'Express Logistics',
    workspaceId: 'ws-oman',
    compartments: [
      { id: 1, capacity: 4000, fuelType: 'DIESEL',  currentVolume: 0 },
      { id: 2, capacity: 3000, fuelType: 'PETROL',  currentVolume: 0 },
      { id: 3, capacity: 2000, fuelType: 'PREMIUM', currentVolume: 0 },
    ],
    capacity: 9000,
    status: 'PENDING_INTEGRATION',
    currentLat: 23.5950,
    currentLng: 58.4100,
    createdAt: new Date('2026-02-08'),
  },
];

// ── Demo Sensor Requests ──────────────────────────────────────
const DEMO_SENSOR_REQUESTS:
SensorIntegrationRequest[]=[

{

id:
'sensor-001',

transporterId:
'tsp-002',

transporterName:
'Express Logistics',

workspaceId:
'ws-oman',

sellerId:
'seller-001',

sellerName:
'Oman Fuel',

sellerCode:
'SELLER-OMAN-2026',

truckId:
'truck-004',

truckRegistration:
'JHFM4777',

driverId:
'',

driverName:
'UNASSIGNED',

status:
'PENDING_SELLER_APPROVAL',

requestedAt:
new Date(),

sensorIntegrationComplete:
false,

}

];

const DEMO_CONNECTIONS:
SellerConnectionRequest[]=[];

const DEMO_CODES:
SellerOnboarding[]=[

{

sellerId:
'seller-001',

sellerCode:
'SELLER-OMAN-2026',

enabled:
true,

createdAt:
new Date(),

}

];


const getDemoKYC = (): KYCDocument[] => {

return [

{

id:'kyc-demo-001',

userId:'tsp-001',

userName:'Mohammed Al-Balushi',

userEmail:'swift@transport.om',

sellerCode:'SELLER-OMAN-2026',

documentType:'Transport Business License',

documentUrl:'',

reviewStatus:'PENDING',

uploadedAt:new Date('2026-01-15'),

reviewedAt:undefined,

reviewedBy:undefined,

},

{

id:'kyc-demo-002',

userId:'tsp-002',

userName:'Salem Al-Hinai',

userEmail:'express@logistics.om',

sellerCode:'SELLER-OMAN-2026',

documentType:'Transport Business License',

documentUrl:'',

reviewStatus:'PENDING',

uploadedAt:new Date('2026-01-20'),

reviewedAt:undefined,

reviewedBy:undefined,

},

{

id:'kyc-demo-003',

userId:'client-001',

userName:'John Smith',

userEmail:'client@shell.om',

sellerCode:'SELLER-OMAN-2026',

documentType:'Client Business Registration',

documentUrl:'',

reviewStatus:'PENDING',

uploadedAt:new Date('2026-01-22'),

reviewedAt:undefined,

reviewedBy:undefined,

},

];

};
// ── Initialize storage ────────────────────────────────────────
const initializeStorage = () => {

  if (typeof window === 'undefined')
    return;

  if (!localStorage.getItem(STORAGE_KEYS.USERS))
    localStorage.setItem(
      STORAGE_KEYS.USERS,
      JSON.stringify(DEMO_USERS)
    );

  if (!localStorage.getItem(STORAGE_KEYS.WORKSPACES))
    localStorage.setItem(
      STORAGE_KEYS.WORKSPACES,
      JSON.stringify(DEMO_WORKSPACES)
    );

  if (!localStorage.getItem(STORAGE_KEYS.TRUCKS))
    localStorage.setItem(
      STORAGE_KEYS.TRUCKS,
      JSON.stringify(DEMO_TRUCKS)
    );

  if (!localStorage.getItem(STORAGE_KEYS.SENSOR_REQUESTS))
    localStorage.setItem(
      STORAGE_KEYS.SENSOR_REQUESTS,
      JSON.stringify(DEMO_SENSOR_REQUESTS)
    );

  if (!localStorage.getItem(STORAGE_KEYS.ORDERS))
    localStorage.setItem(
      STORAGE_KEYS.ORDERS,
      JSON.stringify([])
    );

  // KYC
  if (!localStorage.getItem(STORAGE_KEYS.KYC))
    localStorage.setItem(
      STORAGE_KEYS.KYC,
      JSON.stringify(getDemoKYC())
    );

  if (!localStorage.getItem(STORAGE_KEYS.TICKETS))
    localStorage.setItem(
      STORAGE_KEYS.TICKETS,
      JSON.stringify([])
    );

  if (!localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS))
    localStorage.setItem(
      STORAGE_KEYS.NOTIFICATIONS,
      JSON.stringify([])
    );

  if (!localStorage.getItem(STORAGE_KEYS.DRIVERS))
    localStorage.setItem(
      STORAGE_KEYS.DRIVERS,
      JSON.stringify(DEMO_DRIVERS)
    );

  // ✅ Seller connections
  if (
    !localStorage.getItem(
      STORAGE_KEYS.SELLER_CONNECTIONS
    )
  ) {

    localStorage.setItem(

      STORAGE_KEYS.SELLER_CONNECTIONS,

      JSON.stringify(
        DEMO_CONNECTIONS
      )

    );

  }

  // ✅ Seller codes
  if (
    !localStorage.getItem(
      STORAGE_KEYS.SELLER_CODES
    )
  ) {

    localStorage.setItem(

      STORAGE_KEYS.SELLER_CODES,

      JSON.stringify(
        DEMO_CODES
      )

    );

  }

};

if (typeof window !== 'undefined') {

  initializeStorage();

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

export const
getSellerConnections=
():
SellerConnectionRequest[]=>{

if(
typeof window
===
'undefined'
)

return [];

return JSON.parse(

localStorage.getItem(
STORAGE_KEYS
.SELLER_CONNECTIONS
)

||

'[]'

);

};

export const
getSellerCodes=
():
SellerOnboarding[]=>{

if(
typeof window
===
'undefined'
)

return [];

return JSON.parse(

localStorage.getItem(
STORAGE_KEYS
.SELLER_CODES
)

||

'[]'

);

};

export const
findSellerByCode=
(
sellerCode:string
)=>{

const users=
getUsers();

return users.find(

(user:any)=>

user.role===
'SELLER_MANAGER'

&&

user.sellerCode===
sellerCode

);

};


export const
activateSensorIntegration=(

requestId:string

)=>{

const requests=
getSensorRequests();

const target=
requests.find(
r=>
r.id===requestId
);

if(
!target
)
return;

updateSensorRequest(

requestId,

{

status:
'ADMIN_APPROVED',

adminApproved:
true,

adminReviewedAt:
new Date(),

sensorIntegrationComplete:
true,

activatedAt:
new Date(),

}

);

if(
target.truckId
){

updateTruck(

target.truckId,

{

sensorConfigured:true,

commercialApproval:true,

safetyApproval:true,

status:'ACTIVE',

}

);

}

};

export const
getVisibleSellers=(
userId:string
)=>{

const user=
getUserById(
userId
);

if(
user?.role
===
'TRANSPORT_ADMIN'
)

return [];

return getUsers()

.filter(
u=>
u.role===
'SELLER_MANAGER'
);

};


export const
canRequestSensor=(

transporterId:
string,

sellerId:
string

)=>{

return getSellerConnections()

.some(

r=>

r.transporterId
===

transporterId

&&

r.sellerId
===

sellerId

&&

r.status
===

'APPROVED'

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
export const
generateSellerCode=
(
companyName:string
)=>{

const prefix=

companyName
.replace(/\s/g,'')

.substring(0,5)

.toUpperCase();

const random=
Math.floor(
1000+
Math.random()*9000
);

return `SELLER-${prefix}-${random}`;

};
// ── Add functions ─────────────────────────────────────────────
export const addUser = (
user: User
) => {

const users =
getUsers();

const sellerCode =

user.role ===
'SELLER_MANAGER'

?

generateSellerCode(

user.companyName
||

user.firstName
||

'Seller'

)

:

undefined;

const updatedUser = {

...user,

sellerCode,

};

users.push(
updatedUser
);

saveToStorage(
STORAGE_KEYS.USERS,
users
);

// ── Save Seller Code ──

if(

user.role ===
'SELLER_MANAGER'

&&

sellerCode

){

const codes =
getSellerCodes();

codes.push({

sellerId:
updatedUser.id,

sellerCode,

enabled:true,

createdAt:
new Date(),

});

saveToStorage(

STORAGE_KEYS.SELLER_CODES,

codes

);

}

};
                     
export const addWorkspace     = (workspace: Workspace)              => { const d = getWorkspaces();     d.push(workspace);    saveToStorage(STORAGE_KEYS.WORKSPACES,      d); };
export const addTruck         = (truck: Truck)                      => { const d = getTrucks();          d.push(truck);        saveToStorage(STORAGE_KEYS.TRUCKS,          d); };
export const addOrder         = (order: Order)                      => { const d = getOrders();          d.push(order);        saveToStorage(STORAGE_KEYS.ORDERS,          d); };
export const addKYCDocument   = (doc: KYCDocument)                  => { const d = getKYCDocuments();   d.push(doc);          saveToStorage(STORAGE_KEYS.KYC,             d); };
export const addTicket        = (ticket: Ticket)                    => { const d = getTickets();         d.push(ticket);       saveToStorage(STORAGE_KEYS.TICKETS,         d); };
export const addNotification  = (notification: Notification)        => { const d = getNotifications();  d.push(notification); saveToStorage(STORAGE_KEYS.NOTIFICATIONS,   d); };
export const addSensorRequest = (request: SensorIntegrationRequest) => { const d = getSensorRequests(); d.push(request);      saveToStorage(STORAGE_KEYS.SENSOR_REQUESTS, d); };
export const addDriver        = (driver: Driver)                    => { const d = getDrivers();         d.push(driver);       saveToStorage(STORAGE_KEYS.DRIVERS,         d); };

// ── Update functions ──────────────────────────────────────────
export const updateUser          = (id: string, updates: Partial<User>)                        => { saveToStorage(STORAGE_KEYS.USERS,           getUsers().map(u          => u.id === id ? { ...u, ...updates } : u)); };
export const updateWorkspace     = (id: string, updates: Partial<Workspace>)                   => { saveToStorage(STORAGE_KEYS.WORKSPACES,      getWorkspaces().map(w     => w.id === id ? { ...w, ...updates } : w)); };
export const updateOrder         = (id: string, updates: Partial<Order>)                       => { saveToStorage(STORAGE_KEYS.ORDERS,          getOrders().map(o         => o.id === id ? { ...o, ...updates } : o)); };
export const updateKYCDocument   = (id: string, updates: Partial<KYCDocument>)                 => { saveToStorage(STORAGE_KEYS.KYC,             getKYCDocuments().map(d   => d.id === id ? { ...d, ...updates } : d)); };
export const updateTicket        = (id: string, updates: Partial<Ticket>)                      => { saveToStorage(STORAGE_KEYS.TICKETS,         getTickets().map(t        => t.id === id ? { ...t, ...updates } : t)); };
export const updateSensorRequest = (id: string, updates: Partial<SensorIntegrationRequest>)    => { saveToStorage(STORAGE_KEYS.SENSOR_REQUESTS, getSensorRequests().map(r => r.id === id ? { ...r, ...updates } : r)); };
export const updateDriver        = (id: string, updates: Partial<Driver>)                      => { saveToStorage(STORAGE_KEYS.DRIVERS,         getDrivers().map(d        => d.id === id ? { ...d, ...updates } : d)); };

export const updateTruck = (truckId: string, updates: Partial<Truck>) => {
  const trucks = getTrucks();
  const idx = trucks.findIndex(t => t.id === truckId);
  if (idx === -1) { console.error('❌ Truck not found:', truckId); return; }
  saveToStorage(STORAGE_KEYS.TRUCKS, trucks.map(t => t.id === truckId ? { ...t, ...updates } : t));
};

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