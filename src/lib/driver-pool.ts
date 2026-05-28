// src/lib/driver-pool.ts
import type { Driver } from '@/src/types';

/* ===============================
   DRIVER POOL (30 INDIAN DRIVERS)
   =============================== */

export const DRIVER_POOL: Driver[] = [
  { id: 'driver-001', username: 'ramesh.kumar',    password: 'driver123', firstName: 'Ramesh',  lastName: 'Kumar',    phone: '+91 90000 0001', licenseNumber: 'DL-IN-10001', assignedTruckId: 'truck-pool-001', email: 'ramesh.kumar@fleet.in',    verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-002', username: 'suresh.patel',    password: 'driver123', firstName: 'Suresh',  lastName: 'Patel',    phone: '+91 90000 0002', licenseNumber: 'DL-IN-10002', assignedTruckId: 'truck-pool-002', email: 'suresh.patel@fleet.in',    verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-003', username: 'amit.sharma',     password: 'driver123', firstName: 'Amit',    lastName: 'Sharma',   phone: '+91 90000 0003', licenseNumber: 'DL-IN-10003', assignedTruckId: 'truck-pool-003', email: 'amit.sharma@fleet.in',     verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-004', username: 'rohit.verma',     password: 'driver123', firstName: 'Rohit',   lastName: 'Verma',    phone: '+91 90000 0004', licenseNumber: 'DL-IN-10004', assignedTruckId: 'truck-pool-004', email: 'rohit.verma@fleet.in',     verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-005', username: 'vikas.singh',     password: 'driver123', firstName: 'Vikas',   lastName: 'Singh',    phone: '+91 90000 0005', licenseNumber: 'DL-IN-10005', assignedTruckId: 'truck-pool-005', email: 'vikas.singh@fleet.in',     verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-006', username: 'anil.yadav',      password: 'driver123', firstName: 'Anil',    lastName: 'Yadav',    phone: '+91 90000 0006', licenseNumber: 'DL-IN-10006', assignedTruckId: 'truck-pool-006', email: 'anil.yadav@fleet.in',      verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-007', username: 'deepak.mehta',    password: 'driver123', firstName: 'Deepak',  lastName: 'Mehta',    phone: '+91 90000 0007', licenseNumber: 'DL-IN-10007', assignedTruckId: 'truck-pool-007', email: 'deepak.mehta@fleet.in',    verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-008', username: 'manoj.jain',      password: 'driver123', firstName: 'Manoj',   lastName: 'Jain',     phone: '+91 90000 0008', licenseNumber: 'DL-IN-10008', assignedTruckId: 'truck-pool-008', email: 'manoj.jain@fleet.in',      verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-009', username: 'sunil.gupta',     password: 'driver123', firstName: 'Sunil',   lastName: 'Gupta',    phone: '+91 90000 0009', licenseNumber: 'DL-IN-10009', assignedTruckId: 'truck-pool-009', email: 'sunil.gupta@fleet.in',     verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-010', username: 'rajiv.malhotra',  password: 'driver123', firstName: 'Rajiv',   lastName: 'Malhotra', phone: '+91 90000 0010', licenseNumber: 'DL-IN-10010', assignedTruckId: 'truck-pool-010', email: 'rajiv.malhotra@fleet.in',  verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-011', username: 'arun.kapoor',     password: 'driver123', firstName: 'Arun',    lastName: 'Kapoor',   phone: '+91 90000 0011', licenseNumber: 'DL-IN-10011', assignedTruckId: 'truck-pool-011', email: 'arun.kapoor@fleet.in',     verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-012', username: 'sanjay.agarwal',  password: 'driver123', firstName: 'Sanjay',  lastName: 'Agarwal',  phone: '+91 90000 0012', licenseNumber: 'DL-IN-10012', assignedTruckId: 'truck-pool-012', email: 'sanjay.agarwal@fleet.in',  verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-013', username: 'pradeep.mishra',  password: 'driver123', firstName: 'Pradeep', lastName: 'Mishra',   phone: '+91 90000 0013', licenseNumber: 'DL-IN-10013', assignedTruckId: 'truck-pool-013', email: 'pradeep.mishra@fleet.in',  verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-014', username: 'alok.saxena',     password: 'driver123', firstName: 'Alok',    lastName: 'Saxena',   phone: '+91 90000 0014', licenseNumber: 'DL-IN-10014', assignedTruckId: 'truck-pool-014', email: 'alok.saxena@fleet.in',     verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-015', username: 'harish.rawat',    password: 'driver123', firstName: 'Harish',  lastName: 'Rawat',    phone: '+91 90000 0015', licenseNumber: 'DL-IN-10015', assignedTruckId: 'truck-pool-015', email: 'harish.rawat@fleet.in',    verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-016', username: 'naresh.bansal',   password: 'driver123', firstName: 'Naresh',  lastName: 'Bansal',   phone: '+91 90000 0016', licenseNumber: 'DL-IN-10016', assignedTruckId: 'truck-pool-016', email: 'naresh.bansal@fleet.in',   verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-017', username: 'mahesh.chauhan',  password: 'driver123', firstName: 'Mahesh',  lastName: 'Chauhan',  phone: '+91 90000 0017', licenseNumber: 'DL-IN-10017', assignedTruckId: 'truck-pool-017', email: 'mahesh.chauhan@fleet.in',  verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-018', username: 'vinod.tiwari',    password: 'driver123', firstName: 'Vinod',   lastName: 'Tiwari',   phone: '+91 90000 0018', licenseNumber: 'DL-IN-10018', assignedTruckId: 'truck-pool-018', email: 'vinod.tiwari@fleet.in',    verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-019', username: 'pankaj.joshi',    password: 'driver123', firstName: 'Pankaj',  lastName: 'Joshi',    phone: '+91 90000 0019', licenseNumber: 'DL-IN-10019', assignedTruckId: 'truck-pool-019', email: 'pankaj.joshi@fleet.in',    verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-020', username: 'rahul.khanna',    password: 'driver123', firstName: 'Rahul',   lastName: 'Khanna',   phone: '+91 90000 0020', licenseNumber: 'DL-IN-10020', assignedTruckId: 'truck-pool-020', email: 'rahul.khanna@fleet.in',    verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-021', username: 'naveen.rathi',    password: 'driver123', firstName: 'Naveen',  lastName: 'Rathi',    phone: '+91 90000 0021', licenseNumber: 'DL-IN-10021', assignedTruckId: 'truck-pool-021', email: 'naveen.rathi@fleet.in',    verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-022', username: 'dinesh.soni',     password: 'driver123', firstName: 'Dinesh',  lastName: 'Soni',     phone: '+91 90000 0022', licenseNumber: 'DL-IN-10022', assignedTruckId: 'truck-pool-022', email: 'dinesh.soni@fleet.in',     verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-023', username: 'ravi.bisht',      password: 'driver123', firstName: 'Ravi',    lastName: 'Bisht',    phone: '+91 90000 0023', licenseNumber: 'DL-IN-10023', assignedTruckId: 'truck-pool-023', email: 'ravi.bisht@fleet.in',      verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-024', username: 'kailash.pandey',  password: 'driver123', firstName: 'Kailash', lastName: 'Pandey',   phone: '+91 90000 0024', licenseNumber: 'DL-IN-10024', assignedTruckId: 'truck-pool-024', email: 'kailash.pandey@fleet.in',  verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-025', username: 'ajay.thakur',     password: 'driver123', firstName: 'Ajay',    lastName: 'Thakur',   phone: '+91 90000 0025', licenseNumber: 'DL-IN-10025', assignedTruckId: 'truck-pool-025', email: 'ajay.thakur@fleet.in',     verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-026', username: 'mukesh.chopra',   password: 'driver123', firstName: 'Mukesh',  lastName: 'Chopra',   phone: '+91 90000 0026', licenseNumber: 'DL-IN-10026', assignedTruckId: 'truck-pool-026', email: 'mukesh.chopra@fleet.in',   verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-027', username: 'ashok.lal',       password: 'driver123', firstName: 'Ashok',   lastName: 'Lal',      phone: '+91 90000 0027', licenseNumber: 'DL-IN-10027', assignedTruckId: 'truck-pool-027', email: 'ashok.lal@fleet.in',       verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-028', username: 'bhavesh.desai',   password: 'driver123', firstName: 'Bhavesh', lastName: 'Desai',    phone: '+91 90000 0028', licenseNumber: 'DL-IN-10028', assignedTruckId: 'truck-pool-028', email: 'bhavesh.desai@fleet.in',   verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-029', username: 'nitin.kaushik',   password: 'driver123', firstName: 'Nitin',   lastName: 'Kaushik',  phone: '+91 90000 0029', licenseNumber: 'DL-IN-10029', assignedTruckId: 'truck-pool-029', email: 'nitin.kaushik@fleet.in',   verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
  { id: 'driver-030', username: 'sachin.iyer',     password: 'driver123', firstName: 'Sachin',  lastName: 'Iyer',     phone: '+91 90000 0030', licenseNumber: 'DL-IN-10030', assignedTruckId: 'truck-pool-030', email: 'sachin.iyer@fleet.in',     verified: true, role: 'DRIVER', currentStatus: 'AVAILABLE' },
];

/* ===============================
   TRUCK POOL (30 FIXED TRUCKS)
   =============================== */

export const TRUCK_POOL = [
  {
    id: 'truck-pool-001',
    registrationNumber: 'MH-12-TR-1001',
    model: 'Tata Prima 5530',
    capacity: 20000,
    sensorConfigured: false,
    compartments: [
      { id: 'comp-001-1', capacity: 10000, currentFuel: null },
      { id: 'comp-001-2', capacity: 10000, currentFuel: null },
    ],
  },
  {
    id: 'truck-pool-002',
    registrationNumber: 'MH-12-TR-1002',
    model: 'Ashok Leyland 5525',
    capacity: 20000,
    sensorConfigured: false,
    compartments: [
      { id: 'comp-002-1', capacity: 10000, currentFuel: null },
      { id: 'comp-002-2', capacity: 10000, currentFuel: null },
    ],
  },
  {
    id: 'truck-pool-003',
    registrationNumber: 'DL-01-TR-1003',
    model: 'BharatBenz 5528',
    capacity: 20000,
    sensorConfigured: false,
    compartments: [
      { id: 'comp-003-1', capacity: 10000, currentFuel: null },
      { id: 'comp-003-2', capacity: 10000, currentFuel: null },
    ],
  },
  {
    id: 'truck-pool-030',
    registrationNumber: 'KA-05-TR-1030',
    model: 'Tata Prima 5530',
    capacity: 20000,
    sensorConfigured: false,
    compartments: [
      { id: 'comp-030-1', capacity: 10000, currentFuel: null },
      { id: 'comp-030-2', capacity: 10000, currentFuel: null },
    ],
  },
];

/* ===============================
   HELPER EXPORTS
   =============================== */

export function getAvailableDrivers(tspId: string): Driver[] {
  if (typeof window === 'undefined') return DRIVER_POOL;
  try {
    const raw      = localStorage.getItem('fuelfleet_drivers');
    const saved    = raw ? JSON.parse(raw) : [];
    const savedIds = new Set(saved.map((d: any) => d.id));
    return DRIVER_POOL.filter(
      d => !savedIds.has(d.id) || saved.some((s: any) => s.id === d.id && s.tspId === tspId)
    );
  } catch {
    return DRIVER_POOL;
  }
}

export function getTransporterDriverCount(tspId: string): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw   = localStorage.getItem('fuelfleet_drivers');
    const saved = raw ? JSON.parse(raw) : [];
    return saved.filter((d: any) => d.tspId === tspId).length;
  } catch {
    return 0;
  }
}