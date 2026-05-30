export type UserRole = 'PLATFORM_ADMIN' | 'SELLER_MANAGER' | 'TRANSPORT_ADMIN' | 'CLIENT' | 'DRIVER';

export type OrderStatus =
  | 'PLACED'
  | 'ACCEPTED'
  | 'PENDING'
  | 'ACCEPTED_BY_SELLER'
  | 'ASSIGNED_TO_TSP'
  | 'ASSIGNED'
  | 'TRUCKS_ASSIGNED'
  | 'EN_ROUTE'
  | 'ARRIVED'
  | 'DELIVERY_ACCEPTED'
  | 'OFFLOADING_IN_PROGRESS'
  | 'OFFLOADING_COMPLETE'
  | 'COMPLETED'
  | 'CANCELLED';

export type TruckStatus =
  | 'PENDING_INTEGRATION'
  | 'IDLE'
  | 'ASSIGNED'
  | 'EN_ROUTE'
  | 'ARRIVED'
  | 'OFFLOADING'
  | 'RETURNING';

export type TicketStatus = 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'ON_HOLD';

export type KYCStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type FuelType = 'DIESEL' | 'PETROL' | 'CNG' | 'PREMIUM';

export type Urgency = 'NORMAL' | 'URGENT';

// ── User ──────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  workspaceId?: string;
  verified: boolean;
  username?: string;
  password?: string;
  name?: string;
  companyName?: string;
  // Seller onboarding
sellerCode?: string;

  // transporter connection
  connectedSellerIds?: string[];

  sellerApproved?: boolean;
  phone?: string;
  createdAt?: Date;
}

// ── Workspace ─────────────────────────────────────────────────
export interface Workspace {
  id: string;
  name: string;
  slug?:    string;
  type?:    'SELLER' | 'TRANSPORT';
  ownerId?: string;
  country?: string;
  status?:  string;
  createdAt: Date;
}

// ── Depot ─────────────────────────────────────────────────────
export interface Depot {
  id: string;
  workspaceId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  geofenceRadius: number;
}

// ── Compartment ───────────────────────────────────────────────
export interface Compartment {
  id:               number | string;
  truckId?:         string;
  index?:           number;
  capacity:         number;
  fuelType?:        FuelType | string;
  currentFuel?:     number;
  currentFuelType?: FuelType;
  currentVolume?:   number;
}

// ── Truck ─────────────────────────────────────────────────────
export interface Truck {
  id: string;

  workspaceId?: string;
  tspId?: string;
  tspName?: string;

  registrationNumber: string;

  // Driver mapping only
  assignedDriverId?: string;

  status: TruckStatus | string;

  compartments: Compartment[];

  galileoskyDeviceId?: string;

  qrCodeId?: string;
  qrCodeUrl?: string;
  qrCode?: string;

  commercialApproval?: boolean;
  safetyApproval?: boolean;

  currentLat?: number;
  currentLng?: number;

  totalFuel?: number;

  capacity?: number;

  fuelType?: string;

  model?: string;

  sensorConfigured?: boolean;

  sensorIntegrationComplete?: boolean;

  activatedAt?: Date;

  createdAt?: Date;
}

// ── KYC ───────────────────────────────────────────────────────
export interface KYCDocument {
  id:           string;

  // ✅ Primary fields — required by kyc-review, transport & client signup
  userId:       string;
  userName:     string;
  userEmail:    string;
  documentType: string;
  documentUrl:  string;
  reviewStatus: KYCStatus;
  workspaceId?: string;
  uploadedAt:   Date;
  reviewedAt?:  Date;
  reviewedBy?:  string;

  // ✅ Legacy fields — kept for backwards compatibility
  tspUserId?:   string;
  sellerId?:    string;
  sellerName?:  string;
  sellerCode?:  string;

  // ✅ Extended fields from detailed KYC upload form
  businessName?:       string;
  registrationNumber?: string;
  taxId?:              string;
  address?:            string;
  reviewNotes?:        string;
  adminNotes?:         string;
  documentName?:       string;
  fileUrl?:            string;
  documents?: {
    businessLicense?: string;
    insurance?:       string;
    taxCertificate?:  string;
  };
}

// ── Ticket ────────────────────────────────────────────────────
export interface Ticket {
  id: string;
  ticketType: 'SENSOR_INTEGRATION';
  status: TicketStatus;
  title: string;
  description: string;
  createdBy: string;
  relatedTruckId: string;
  truck?: Truck;
  metadata: any;
  createdAt: Date;
  resolvedAt?: Date;
}

// ── Order ─────────────────────────────────────────────────────
export interface Order {
  id: string;
  clientId: string;
  clientName?: string;
  workspaceId?: string;
  fuelType: FuelType | string;
  volume: number;
  status: OrderStatus | string;
  urgency?: Urgency;
  notes?: string;

  // destination
  destination?:        string;
  destinationName?:    string;
  destinationAddress?: string;
  destinationLat?:     number;
  destinationLng?:     number;

  // tank linkage
  tankId?:   string | null;
  tankName?: string | null;

  // assignment
  assignedTSPId?:             string;
  assignedTSPName?:           string;
  assignedTrucks?:            TruckAssignment[];
  assignedDriverId?:          string;
  assignedDriverName?:        string;
  assignedDriverPhone?:       string;
  assignedTruckId?:           string;
  assignedTruckRegistration?: string;

  // timestamps
  createdAt:      Date;
  assignedAt?:    Date;
  tripStartedAt?: Date;
  arrivedAt?:     Date;
  completedAt?:   Date;
  cancelledAt?:   Date;
  updatedAt?:     Date;
  acceptedAt?:    Date;
  scheduledDeliveryTime?: Date;
}

// ── Truck Assignment ──────────────────────────────────────────
export interface TruckAssignment {
  id: string;
  orderId: string;
  truckId: string;
  truck?: Truck;
  status: string;
  assignedCompartments: AssignedCompartment[];
  preDeliveryFuel?: any;
  postDeliveryFuel?: any;
  actualDeliveredVolume?: number;
  deliveryAcceptedAt?: Date;
}

export interface AssignedCompartment {
  compartmentId:    string;
  compartmentIndex: number;
  fuelType:         FuelType;
  volume:           number;
  capacity:         number;
}

// ── Notification ──────────────────────────────────────────────
export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
}

// ── Telemetry ─────────────────────────────────────────────────
export interface TelemetryData {
  truckId: string;
  lat: number;
  lng: number;
  speed: number;
  timestamp: Date;
  compartmentSensors: {
    compartmentId: string;
    fuelLevel: number;
    fuelType?: FuelType;
  }[];
}

// ── Sensor Request ────────────────────────────────────────────
export type SensorRequestStatus =
  | 'PENDING_SELLER_APPROVAL'
  | 'SELLER_APPROVED'
  | 'SELLER_REJECTED'
  | 'PENDING_ADMIN_APPROVAL'
  | 'ADMIN_APPROVED'
  | 'ADMIN_REJECTED'
  | 'INTEGRATION_ACTIVE';

export interface SensorIntegrationRequest {

id:string;

// transporter

transporterId:string;

transporterName:string;

workspaceId?:string;

// seller

sellerId:string;

sellerName:string;

sellerCode:string;

// truck

truckId:string;

truckRegistration:string;

// driver

driverId?:string;

driverName?:string;

// request

requestedAt:Date;

status:
SensorRequestStatus;

// seller review

sellerReviewedAt?:Date;

sellerReviewedBy?:string;

sellerApproved?:boolean;

sellerNotes?:string;

managerReviewedAt?:Date;

managerReviewedBy?:string;

managerNotes?:string;

forwardedToAdminAt?:Date;

// admin review

adminReviewedAt?:Date;

adminReviewedBy?:string;

adminApproved?:boolean;

adminNotes?:string;

// integration

sensorIntegrationComplete?:boolean;

activatedAt?:Date;

// QR

qrCode?:string;

qrGenerated?:boolean;

qrGeneratedAt?:Date;

// data

compartments?:{
id:number;
capacity:number;
fuelType:string;
}[];

}

export interface SellerConnectionRequest {

id:string;

// transporter

transporterId:string;

transporterName:string;

// seller

sellerId:string;

sellerName:string;

sellerCode:string;

// approval

status:
| 'PENDING'
| 'APPROVED'
| 'REJECTED';

requestedAt:Date;

reviewedAt?:Date;

reviewedBy?:string;

approvedAt?:Date;

notes?:string;

}

export interface SellerOnboarding {

sellerCode:string;

sellerId:string;

enabled:boolean;

createdAt:Date;

}


// ── Driver ────────────────────────────────────────────────────
export interface Driver {
  id: string;

  email: string;

  password?: string;

  username?: string;

  firstName: string;

  lastName: string;

  phone: string;

  licenseNumber: string;

  tspId?: string;

  tspName?: string;

  workspaceId?: string;

  verified: boolean;

  // Single source of truth
  assignedTruckId?: string;

  currentStatus:
    | 'AVAILABLE'
    | 'ON_TRIP'
    | 'OFF_DUTY';

  role?: 'DRIVER';

  createdAt?: Date;
}

// ── Tank ──────────────────────────────────────────────────────
export interface Tank {
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

// ── Delivery Location ─────────────────────────────────────────
export interface DeliveryLocation {
  id: string;
  clientId?: string;
  name: string;
  address: string;
}