# Order → Trip Decoupling Plan

**Context:** the ingestion + geofence + order-lifecycle backend is already built and canonical (flespi webhook → Ingestion Lambda → RDS Postgres, `workspace_id` + RLS, Order-centric geofence). This plan describes the **one targeted refactor** that unblocks Mode B (monitoring-only / dispatch) without rewriting any of it.

> This is not a greenfield. It re-points an existing, working geofence module. Most of the built system does not move.

---

## 1. The gap in one line

The built geofence module advances the **order** state machine directly (`geofence_events.order_id`, "ENTER(STATION) ⇒ order `ARRIVED`"). A Mode B dispatch has **no order**, so today its geofence events would carry `order_id = null` and nothing would advance. We introduce a **`Trip`** as the physical unit monitoring runs on, and re-point geofence at the trip. Order becomes an optional upstream producer of trips.

---

## 2. What does NOT change (most of the system)

These are already built and stay exactly as they are:

- **Location module** — `device_id → truck_id`, `truck_telemetry` (partitioned history), `truck_live_state` (O(1) latest), timestamp gating against `last_message_at`. Untouched.
- **The flespi → webhook → API Gateway → Ingestion Lambda → RDS path.** Untouched.
- **Haversine detection + stateful inside/outside** per (truck, geofence). The *algorithm* is unchanged — only the source of the destination coords and the thing being advanced change.
- **`geofences` table** (DEPOT / STATION, coords, radius). Untouched.
- **Multi-tenancy** (`workspace_id`, RLS), **roles** (PLATFORM_ADMIN, SELLER_MANAGER, TRANSPORT_ADMIN, CLIENT, DRIVER), **QR = raw `truck_id`**, **fixed 4 × 9,100 L compartments**, single-workspace MVP. Untouched.
- **AWS shape and cost** (Lambda + RDS `t4g`). Untouched.

The refactor touches three things only: the geofence event's foreign key, where the geofence reads its destination coords, and which state machine the event advances.

---

## 3. The insight: the order status enum is really two enums

The built `orders` status set mixes **commercial** states with **physical** states:

| Commercial (stays on `orders`) | Physical (moves to `trips`) |
|---|---|
| `PLACED` | `LOADING` |
| `ACCEPTED_BY_SELLER` | `LOADED` |
| `ASSIGNED_TO_TSP` | `EN_ROUTE` |
| `ASSIGNED` | `ARRIVED` |
| | `DELIVERY_ACCEPTED` → delivered |
| | `JOURNEY_COMPLETE` / `COMPLETED` |

The decoupling is literally splitting that enum. The physical half becomes `trips.status`; the commercial half stays on `orders`. In Mode A the order *mirrors* the trip's physical progress via a listener. In Mode B there is no commercial half at all — only the trip.

---

## 4. The new abstraction: Trip

One truck's monitored journey for one load. Always present; the unit geofence and monitoring run on.

```sql
CREATE TABLE trips (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL,
  truck_id          UUID NOT NULL REFERENCES trucks(id),
  driver_id         UUID,
  order_ref         VARCHAR(64),           -- Mode A: internal order id · Mode B: client's order#
  source            VARCHAR(12) NOT NULL,  -- 'ORDERING' | 'DISPATCH'
  status            VARCHAR(20) NOT NULL,  -- CREATED→LOADING→LOADED→EN_ROUTE→ARRIVED→DELIVERED→RETURNING→COMPLETE
  origin_lat        DECIMAL(10,8),
  origin_lng        DECIMAL(11,8),
  dest_lat          DECIMAL(10,8) NOT NULL,
  dest_lng          DECIMAL(11,8) NOT NULL,
  dest_geofence_id  UUID,                  -- known STATION, or null → evaluate against dest coords + default radius
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE trip_compartments (
  trip_id           UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  index             INT NOT NULL,          -- 1..4
  fuel_type         VARCHAR(20),
  expected_volume   DECIMAL(10,2),         -- the promise (order/dispatch); MVP default 9,100
  loaded_volume     DECIMAL(10,2),         -- sensor at origin
  delivered_volume  DECIMAL(10,2)          -- sensor after offload
);
```

Note `order_ref` is a plain string, not a FK — so a trip can exist with no order (Mode B). `trip_compartments` is where the **expected-vs-loaded-vs-delivered** proof lives; the raw sensor material already flows in via `truck_live_state.compartment_fuel` / `truck_telemetry.compartment_sensors`.

---

## 5. The geofence-event change (the actual coupling point)

Re-point the foreign key from order to trip:

```sql
ALTER TABLE geofence_events ADD COLUMN trip_id UUID;   -- new
-- keep order_id during transition for back-compat, then drop once trips is authoritative
CREATE INDEX idx_geofence_events_trip ON geofence_events (trip_id, occurred_at);
```

`order_id` on `geofence_events` stays temporarily (dual-write) so nothing in the current Mode A reporting breaks mid-migration, then is dropped once `trip_id` is authoritative.

---

## 6. The geofence module: before → after

**Before (built):**

```
reading arrives
  → look up truck's ACTIVE ORDER → get destination station coords
  → haversine vs destination + depot (stateful)
  → ENTER(STATION) while order EN_ROUTE  ⇒ order → ARRIVED
  → ENTER(DEPOT) after DELIVERY_ACCEPTED ⇒ assignment JOURNEY_COMPLETE, truck IDLE, order COMPLETED
```

**After (decoupled):**

```
reading arrives
  → look up truck's ACTIVE TRIP → get destination coords from trip
  → haversine vs destination + depot (stateful — UNCHANGED)
  → ENTER(STATION) while trip EN_ROUTE  ⇒ trip → ARRIVED
  → ENTER(DEPOT) after trip delivered   ⇒ trip → COMPLETE, truck IDLE
  → emit geofence_event with trip_id
```

Two lines change in substance: **"active order" → "active trip"** for the destination lookup, and **advance `trip.status`** instead of `order.status`. The Haversine math, the stateful transition guard, and the timestamp gating are all identical.

---

## 7. Order becomes a listener (Mode A only)

The order state machine no longer *owns* physical transitions — it *subscribes* to them:

```
trip → ARRIVED    ⇒ (if trip.order_ref → order) order → ARRIVED, notify client "scan QR"
trip → COMPLETE   ⇒ if all of the order's trips COMPLETE ⇒ order → COMPLETED, notify seller/TSP
```

When `dispatchApi` is on and `ordering` is off (Mode B), `trip.order_ref` points at no internal order, the listener is a no-op, and only the trip advances. Same code path, the commercial half is simply absent. This is the module switch doing its job.

The QR-scan delivery acceptance is unchanged — it still validates truck-at-destination; it now flips `trip` to delivered (and, in Mode A, the order mirrors).

---

## 8. How a trip is born (both modes)

- **Mode A:** the existing order workflow reaches "TSP assigns truck + driver" → **create a Trip** (`source = ORDERING`, `order_ref = order id`, one trip per `order_truck_assignment`). The order and assignment records stay; the trip is the new physical record they point at.
- **Mode B:** `POST /trucks/{id}/dispatch` → **create a Trip** (`source = DISPATCH`, `order_ref = client's order#`). No order, no assignment.

Both converge on one `CreateTrip` command — the seam. Everything from section 6 down is blind to which door it came through.

---

## 9. One wrinkle: destination coords for Mode B

Today the geofence resolves the destination from a **known STATION** in `geofences` (stations are pre-registered). A Mode B client's destination may not be pre-registered. Handle it on the trip:

- If `trip.dest_geofence_id` is set (known station) → evaluate against that geofence's radius (existing path).
- If null (ad-hoc destination from a dispatch payload) → evaluate against `trip.dest_lat/lng` with the default `GEOFENCE_DEST_RADIUS_M` (100 m).

This keeps the detection algorithm identical and just generalizes where the target coordinates come from.

---

## 10. Migration sequence (additive, zero disruption to live Mode A)

1. **Add `trips` + `trip_compartments`** tables. No behavior change yet.
2. **Backfill** a Trip per active `order_truck_assignment` for in-flight orders (`source = ORDERING`, `order_ref = order id`, copy destination + expected volumes). Now every active order has trips.
3. **Add `trip_id` to `geofence_events`; dual-write** `order_id` + `trip_id`. Reporting still reads `order_id`.
4. **Switch geofence eval** to resolve the active **trip** and read destination from it; advance `trip.status`; add the order-listener that mirrors trip → order for Mode A.
5. **Point the order workflow's "assign truck" step** at `CreateTrip` instead of driving physical order states itself.
6. **Add the dispatch API** (`POST /trucks/{id}/dispatch`) → `CreateTrip` with `source = DISPATCH`. Mode B now works end to end.
7. Once `trip_id` is authoritative everywhere, **drop `geofence_events.order_id`** and retire the physical statuses from the order enum.

Steps 1–3 are invisible to existing clients. Step 4 is the only cutover, and it's behind the same telemetry it already consumes. Nothing about flespi, the Lambda, or the location module is touched.

---

## 11. What this unblocks

- **Mode B** — a dispatched truck now has a Trip for geofence to advance; ARRIVED / delivered / COMPLETE all fire with no order present.
- **The delivery-note proof** — `trip_compartments` gives `expected_volume` (the promise from order or dispatch) a home alongside `loaded`/`delivered` from the sensors, so the expected-vs-measured note can be generated for both modes.
- **The sandbox simulator** — it now replays telemetry for a **trip** (Mode A order-trip or Mode B dispatch-trip) through the real `/ingest/telemetry` path, and the same geofence module produces the same delivery note regardless of which mode created the trip.

The built system stays the system of record. This refactor just gives geofence a mode-agnostic thing to advance.
