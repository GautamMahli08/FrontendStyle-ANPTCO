# Fuel Ordering & Monitoring Platform — Design (As-Built)

**Status:** Canonical design, reflecting the current dashboard.
**Supersedes:** `Fuel_Platform_Design.pdf` (the original proposal). Where the two
disagree, **this document and the dashboard are correct** — the PDF is kept only as
historical context.
**Companion docs:** [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) and
[LOCATION_GEOFENCE_SERVICE.md](LOCATION_GEOFENCE_SERVICE.md) (production backend),
[PRODUCT_MODES.md](PRODUCT_MODES.md) (full vs monitoring-only product split).

---

## 1. Executive Summary

A multi-tenant SaaS that connects fuel **sellers** (depots) with fuel **clients**
(stations / industrial customers) through **Transportation Service Providers (TSPs)**.
Trucks carry Galileosky GPS + fuel sensors (via flespi); the platform manages the
**order lifecycle**, tracks **per-compartment fuel**, verifies delivery by **QR scan**,
and monitors the fleet live with **fuel-anomaly (theft) detection**.

The dashboard in this repo is a fully interactive **front-end demo**: all state lives
in the browser (`localStorage`, seeded by [src/lib/demo-data.ts](../src/lib/demo-data.ts))
and journeys/fuel are driven by **simulators** that mimic the cadence of the real
flespi feed. The production backend that replaces those simulators is specified in the
companion backend docs.

### What changed from the original proposal

| Concern | Proposal (PDF, older) | **As-built (canonical)** |
|---|---|---|
| Roles | adds `CLIENT_VIEWER` | adds **`DRIVER`** (no `CLIENT_VIEWER`) |
| TSP onboarding | Email invite + token | **Seller-code + connection request** |
| Sensor integration | 1-step (TSP → Admin) | **2-step: Seller approve → Admin approve** |
| Truck / compartments | Arbitrary per-compartment capacity | **Fixed 4 × 9,100 L generic compartments** |
| Order units | arbitrary litres | **Whole-compartment units (multiples of 9,100 L)** |
| QR payload | `{truck_id, workspace_id}` JSON | **Raw `truck_id` string** |
| Order statuses | smaller set | **superset incl. `LOADING` / `LOADED`** |
| Driver | implicit (name on truck) | **First-class `DRIVER` role + driver app** |
| Tenancy (MVP) | many workspaces | **single workspace `ws-anptco`, one depot** (multi-tenant-ready) |
| Theft detection | Phase 3 (future) | **fuel-anomaly alerts live in Fleet Monitor** |

---

## 2. Roles

Five roles (`UserRole` in [src/types/index.ts](../src/types/index.ts)):

| Role | Does |
|---|---|
| **PLATFORM_ADMIN** *(us)* | Onboard/operate the platform; final sensor-integration approval; configure Galileosky devices; generate truck QR; oversight. |
| **SELLER_MANAGER** | Owns a depot/workspace; issues a **seller code**; approves TSP connection requests; reviews TSP/client **KYC**; **first-stage** sensor-integration approval; **accepts orders & assigns them to a TSP**; full fleet monitor. |
| **TRANSPORT_ADMIN (TSP)** | Connects to a seller via code; uploads KYC; registers trucks & drivers; requests sensor integration; **assigns a truck to an order**, triggers loading & trip start; fleet monitor (own fleet). |
| **CLIENT** | Places orders; tracks them; **accepts delivery by scanning the truck QR**; manages storage tanks & delivery locations. |
| **DRIVER** | Mapped 1:1 to a truck; sees the active trip; can start the trip and follow delivery from the driver app. |

> Demo logins (personas) are listed in `DEMO_PERSONAS` in
> [src/lib/demo-data.ts](../src/lib/demo-data.ts).

---

## 3. Fixed Truck & Fuel Model

A deliberate simplification that removes a class of validation:

- **Every truck = 4 generic compartments × 9,100 L = 36,400 L** (`makeStandardCompartments`).
- Compartments carry **no preset fuel type**. The **order** decides which fuel fills
  each compartment at dispatch.
- **Orders are placed in whole-compartment units** (multiples of 9,100 L) and capped at
  4 compartments — so any truck can carry any valid order and **no per-truck capacity
  check is needed** (it was removed on purpose).
- Fuel types: **DIESEL, PETROL, CNG, PREMIUM** (orders may be single-fuel or `MIXED`
  with a per-type `fuelItems` breakdown).

A single depot and two stations are seeded:

- **Depot:** Central Depot — Seeb, Muscat (geofence radius 200 m).
- **Stations:** Station A (Qurum) and Station B (Al Khuwair), each with per-fuel
  **stored level + capacity**. A station's live level = seed `base` + everything
  received from completed deliveries (capped at capacity) — the single source of truth
  for both the client tank view and order-capacity (headroom) validation.

---

## 4. Onboarding Workflows

### 4.1 Seller onboarding
On seller signup the platform mints a **seller code** (e.g. `SELLER-ANPTCO-2026`,
`generateSellerCode`). The code is how TSPs find and request to join the seller — there
are **no email invites**.

### 4.2 TSP ↔ Seller connection (replaces email invite)
```
TSP enters seller code  →  requestSellerConnection()  →  SellerConnectionRequest { PENDING }
Seller reviews          →  APPROVED | REJECTED
```
A TSP can only request sensor integration against a seller it is **APPROVED** with
(`canRequestSensor`). One TSP may connect to multiple sellers; a seller may disable a
partnership (`disabled`).

### 4.3 KYC
TSPs (and clients) upload KYC/compliance documents; the **seller manager** reviews each
to `APPROVED` / `REJECTED`. A TSP is considered KYC-approved once it has at least one
approved document — a gate for operational actions.

### 4.4 Truck registration + 2-step sensor integration (canonical)
Trucks are registered with the fixed 4 × 9,100 L layout, then go through a **two-stage
approval** before they can carry orders (`SensorRequestStatus`):

```
TSP registers truck + requests integration
        │
        ▼
PENDING_SELLER_APPROVAL   ──seller approves──▶  SELLER_APPROVED → PENDING_ADMIN_APPROVAL
        │ (seller rejects)                                │ (admin rejects)
        ▼                                                 ▼
   SELLER_REJECTED                                   ADMIN_REJECTED
                                                          │ admin approves
                                                          ▼
                                  ADMIN_APPROVED → INTEGRATION_ACTIVE
                                  (activateSensorIntegration):
                                    · truck.sensorConfigured = true
                                    · commercial + safety approval = true
                                    · truck.status = ACTIVE (IDLE/available)
                                    · Galileosky device mapped · QR generated
```

The **QR encodes the raw `truck_id` string** (`truckQrPayload`) and is printable as a
PDF ([src/lib/truck-qr.ts](../src/lib/truck-qr.ts)).

---

## 5. Order Lifecycle (core flow)

The canonical status sequence (`ORDER_STATUS_SEQUENCE`) and the actor who drives each
transition:

| # | Status | Trigger / actor | Notes |
|---|---|---|---|
| 1 | **PLACED** | **Client** places order (seller may place on behalf) | fuel type(s), whole-compartment volume, destination station |
| 2 | **ACCEPTED_BY_SELLER** | **Seller** accepts | `acceptedAt` |
| 3 | **ASSIGNED_TO_TSP** | **Seller** assigns to a connected TSP | `assignedToTspAt`; notifies TSP |
| 4 | **ASSIGNED** | **TSP** assigns a specific truck (its mapped driver comes along) | `truckAssignedAt`; truck → `ASSIGNED` |
| 5 | **LOADING** | **TSP** starts loading at depot | `loadStartedAt`; compartments fill over `LOADING_DURATION_MS` |
| 6 | **LOADED** | *automatic* (`advanceLoading`) | fill window elapsed; truck → `LOADED` |
| 7 | **EN_ROUTE** | **TSP or Driver** starts the trip | `tripStartedAt`; truck → `EN_ROUTE` |
| 8 | **ARRIVED** | *automatic* (`advanceJourneys`, geofence in prod) | journey window elapsed; **notifies client to scan QR** |
| 9 | **COMPLETED** | **Client** scans the truck QR | `qrMatchesTruck` → `COMPLETED`; offloading animates; station level rises |

Other states: `CANCELLED`, `DELIVERY_REJECTED`, `OFFLOADING_*` (intermediate).

```
Client            Seller            TSP / Driver        Client
  │ place           │                  │                  │
  ▼                 ▼                  │                  │
PLACED ─▶ ACCEPTED_BY_SELLER ─▶ ASSIGNED_TO_TSP           │
                                  │ assign truck          │
                                  ▼                       │
                               ASSIGNED ─▶ LOADING ─(auto)▶ LOADED
                                              │ start trip │
                                              ▼            │
                                           EN_ROUTE ─(auto/geofence)▶ ARRIVED
                                                                        │ scan QR
                                                                        ▼
                                                                    COMPLETED
```

> In the demo, steps 6 & 8 are driven by **timers** (`advanceLoading`,
> `advanceJourneys`, `JOURNEY_DURATION_MS`). In production these are replaced by **real
> geofence events** from the ingestion pipeline — see
> [LOCATION_GEOFENCE_SERVICE.md](LOCATION_GEOFENCE_SERVICE.md).

### 5.1 QR-verified delivery
The client opens **Accept Delivery → Scan QR**, decodes the truck's QR, and the system
checks the scanned value matches the **assigned truck** (`qrMatchesTruck`). On success
the order moves to `COMPLETED`, offloading animates down per compartment, and the
destination station's stored fuel level increases. The QR scan is the proof that the
right truck delivered at the right place.

---

## 6. Telemetry, Monitoring & Geofence

### 6.1 Per-compartment fuel (flespi-style)
Production: per-compartment levels arrive from Galileosky sensors via a **flespi
webhook push** — a discrete reading every few seconds, not a continuous stream. The
demo mirrors this: the UI samples a **derived reading every `TELEMETRY_INTERVAL_MS`**
and animates smoothly between samples, so the component already behaves the way it will
once wired to the real feed (`orderFuelTelemetry`, [CompartmentFuel](../src/components/fleet/CompartmentFuel.tsx)).

Fuel phases: `EMPTY → LOADING → LOADED → IN_TRANSIT → OFFLOADING → DELIVERED`.

### 6.2 Fleet Monitor
[FleetMonitorView](../src/components/fleet/FleetMonitorView.tsx) (shared by seller & TSP):
search an order/truck, then watch **one trip at a time** — a live map while
`EN_ROUTE`/`ARRIVED`, the per-compartment fuel strip, and the event timeline. Today it
is **keyed on the Order** (a truck with no active order shows "Idle at depot"); the
planned decoupling onto a Trip entity is described in [PRODUCT_MODES.md](PRODUCT_MODES.md).

### 6.3 Geofence (production)
Dynamic geofences — the active order's **destination** (< 100 m ⇒ `ARRIVED`) and the
**depot** (< 200 m after delivery ⇒ journey complete, truck `IDLE`). Stateful ENTER/EXIT
detection replaces the demo's timers. Full spec in
[LOCATION_GEOFENCE_SERVICE.md](LOCATION_GEOFENCE_SERVICE.md).

### 6.4 Fuel-anomaly (theft) detection
Unexpected fuel drops outside a delivery window raise a `FuelAnomaly`
(`HIGH/MEDIUM/LOW`, `OPEN→REVIEWING→RESOLVED`), surfaced in the Fleet Monitor and merged
into the order timeline. Sellers see all; a TSP sees only its own trucks.

---

## 7. Data Model (entities)

Defined in [src/types/index.ts](../src/types/index.ts); persisted as keyed
`localStorage` collections in the demo, designed to map directly to the backend schema.

- **User** — role, `workspaceId`, plus seller fields (`sellerCode`, `connectedSellerIds`).
- **Workspace** — tenant (MVP: single `ws-anptco`, type `SELLER`).
- **Depot** — location + `geofenceRadius`.
- **Truck** — fixed `compartments` (4 × 9,100 L), `tspId`, `assignedDriverId`,
  `galileoskyDeviceId`, `qrCode`, approval flags, live `currentLat/Lng`, `status`.
- **Compartment** — `capacity`, `currentVolume`, optional current fuel type.
- **Driver** — mapped 1:1 to a truck (`assignedTruckId`), `currentStatus`.
- **Order** — fuel (single or `fuelItems` MIXED), whole-compartment volume, destination,
  assignment (`assignedTSPId`, `assignedTruckId`, `assignedDriverId`), and the full set
  of lifecycle timestamps.
- **TruckAssignment / AssignedCompartment** — truck ↔ order with per-compartment fuel.
- **KYCDocument** — document + `reviewStatus`, reviewer.
- **SensorIntegrationRequest** — the 2-step approval state machine + QR fields.
- **SellerConnectionRequest / SellerOnboarding** — code-based TSP↔seller connection.
- **Ticket** — sensor-integration tickets.
- **Notification**, **TelemetryData**, **Tank**, **DeliveryLocation**, **FuelAnomaly**.

---

## 8. Multi-Tenancy & Security (target)

- Every record carries `workspaceId`; the MVP runs a single workspace (`ws-anptco`) but
  the model is multi-tenant-ready (turns on without a rewrite).
- Production: JWT carries `workspace_id` + roles; Postgres **RLS** enforces isolation;
  the flespi token and secrets stay server-side (never in the browser). See
  [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) §8.

---

## 9. Where the demo ends and the backend begins

| Concern | Demo (this repo) | Production (backend docs) |
|---|---|---|
| State store | browser `localStorage` (`demo-data.ts`) | PostgreSQL (RDS), tenant-scoped |
| Truck movement / arrival | timers (`JOURNEY_DURATION_MS`, `advanceJourneys`) | geofence events from flespi ingestion |
| Per-compartment fuel | derived simulation (`orderFuelTelemetry`) | Galileosky sensors via flespi webhook |
| Live "LIVE" feed | decorative + 3 s poll | poll → WebSocket fan-out (tenant-scoped) |
| Notifications | in-app only | event-driven + email (SES) |

This document describes the **product design**; the two backend docs describe how it is
delivered for real. The original `Fuel_Platform_Design.pdf` is superseded by this file.
