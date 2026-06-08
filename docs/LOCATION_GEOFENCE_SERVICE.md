# Location & Geofence Service

**Scope:** the **durable ingestion path only** — receive Galileosky/flespi telemetry, persist location, detect geofence entry/exit, and emit events that drive the order workflow.

**Explicitly out of scope:** live/real-time dashboard fleet monitoring (WebSocket/polling fan-out). This document is the **source-of-truth ingestion pipeline**; the live view is a separate, best-effort concern handled elsewhere.

---

## 1. Responsibility

This service is the single consumer of truck telemetry. It is the **system of record** for where every truck is and what happened on its journey. Everything else (order state, dashboards, reports) reads from what this service writes.

It is **one deployable** with **two internal modules**:

- **Location module** — device→truck mapping, persist telemetry, update latest-state.
- **Geofence module** — stateful enter/exit detection against depot + active-order destination, emit events, advance order state.

> These are packages in one process, **not** two services and **not** two flespi subscriptions. One subscription, one parse, ordered handling.

---

## 2. Data Flow

```
Galileosky G-10 (GPS + fuel sensors, every 10–30s)
        │  MQTT
        ▼
   flespi device (broker + optional calibration)
        │  stream = webhook (batched, store-and-forward, retried)
        ▼
   API Gateway (HTTPS POST)
        ▼
┌─────────────────────────────────────────────────────────┐
│           Ingestion Lambda  (per message, in order)      │
│                                                          │
│  1. device_id → truck_id        (cached lookup)          │
│  2. LOCATION: write truck_telemetry (history)            │
│  3. LOCATION: upsert truck_live_state (if newer)         │
│  4. GEOFENCE: evaluate vs depot + active-order dest.     │
│  5. GEOFENCE: emit ENTER/EXIT into geofence_events       │
│  6. GEOFENCE: advance order/assignment state             │
└─────────────────────────────────────────────────────────┘
        │ writes
        ▼
   PostgreSQL (RDS)
```

---

## 3. Location Module

### 3.1 Steps per message

1. **Map device → truck.** Look up `trucks.galileosky_device_id`. Keep an **in-memory cache** (refresh on miss / TTL) so the common path is zero DB hits. Unknown device → log + drop (do not fail the batch).
2. **Persist history.** Insert into `truck_telemetry` (partitioned by month). Store device `timestamp`, GPS, speed, ignition, per-compartment sensors, total fuel.
3. **Update latest-state.** Upsert `truck_live_state` **only if `message.timestamp > last_message_at`** (guard against out-of-order/duplicate delivery).

### 3.2 Schemas

```sql
CREATE TABLE truck_live_state (
  truck_id            UUID PRIMARY KEY REFERENCES trucks(id) ON DELETE CASCADE,
  workspace_id        UUID NOT NULL,
  latitude            DECIMAL(10,8),
  longitude           DECIMAL(11,8),
  speed               INT,
  total_fuel_liters   DECIMAL(10,2),
  compartment_fuel    JSONB,
  last_message_at     TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE truck_telemetry (
  id                  UUID DEFAULT gen_random_uuid(),
  truck_id            UUID NOT NULL,
  workspace_id        UUID NOT NULL,
  timestamp           TIMESTAMPTZ NOT NULL,
  latitude            DECIMAL(10,8) NOT NULL,
  longitude           DECIMAL(11,8) NOT NULL,
  speed               INT,
  ignition_on         BOOLEAN,
  compartment_sensors JSONB,
  total_fuel_liters   DECIMAL(10,2),
  created_at          TIMESTAMPTZ DEFAULT now()
) PARTITION BY RANGE (timestamp);

-- e.g. monthly partitions
CREATE TABLE truck_telemetry_2026_06 PARTITION OF truck_telemetry
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE INDEX idx_telemetry_truck_time ON truck_telemetry (truck_id, timestamp DESC);
```

### 3.3 Why separate latest-state from history

The dashboard asks "where is truck X **now**" constantly. Reading that from `truck_live_state` is **O(1)**. If we instead queried the latest row out of millions of telemetry rows, reads get expensive as history grows. The `truck_live_state` upsert is the single most important performance decision in this service.

---

## 4. Geofence Module

### 4.1 What we test against (dynamic, not static)

The geofences that drive the workflow are **per-order destinations** + the **depot** — destinations change every order, so we evaluate **in code against the order's coordinates**, not flespi's static geofences.

Definitions live in the DB (stations + depot already known):

```sql
CREATE TABLE geofences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  type            VARCHAR(20) NOT NULL,   -- 'DEPOT' | 'STATION'
  ref_id          VARCHAR(64),
  name            VARCHAR(255),
  latitude        DECIMAL(10,8) NOT NULL,
  longitude       DECIMAL(11,8) NOT NULL,
  radius_meters   INT NOT NULL            -- depot 200, station ~100–250
);
```

### 4.2 Detection rules (Haversine distance)

For a truck's reading, evaluate the relevant zones:

- Truck → **active order destination < 100m** ⇒ **ENTER(STATION)** ⇒ order → `ARRIVED`.
- Truck → **depot < 200m** after delivery accepted ⇒ **ENTER(DEPOT)** ⇒ assignment `JOURNEY_COMPLETE`, truck `IDLE`; if all trucks done ⇒ order `COMPLETED`.

### 4.3 Stateful — emit one event per transition

Detection must be **stateful per (truck, geofence)** to avoid an event on every 15s reading while parked inside a zone:

```
last_state = INSIDE | OUTSIDE   (per truck per geofence)

reading arrives:
  inside_now = haversine(reading, geofence) <= radius
  if inside_now and last_state == OUTSIDE -> emit ENTER, set INSIDE
  if !inside_now and last_state == INSIDE -> emit EXIT,  set OUTSIDE
  else: no event
```

State can live on `truck_live_state` (e.g. `current_geofence_id`) or a small `geofence_state` table. Always gate on **device timestamp**; ignore stale/out-of-order readings.

### 4.4 Events table

```sql
CREATE TABLE geofence_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  truck_id        UUID NOT NULL,
  order_id        UUID,                   -- null when not on an active order
  geofence_id     UUID NOT NULL,
  geofence_type   VARCHAR(20) NOT NULL,   -- DEPOT | STATION
  event_type      VARCHAR(10) NOT NULL,   -- ENTER | EXIT
  latitude        DECIMAL(10,8),
  longitude       DECIMAL(11,8),
  occurred_at     TIMESTAMPTZ NOT NULL,   -- device time
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_geofence_events_order ON geofence_events (order_id, occurred_at);
CREATE INDEX idx_geofence_events_truck ON geofence_events (truck_id, occurred_at);
```

### 4.5 Events drive the order state machine

These events are the **real-world triggers** that replace the dashboard's simulated timers (`advanceJourneys`, `JOURNEY_DURATION_MS`):

| Event | Effect on order/assignment | Side effect |
|---|---|---|
| `ENTER(STATION)` while `EN_ROUTE` | order → `ARRIVED` | notify client "truck arrived", prompt QR scan |
| `ENTER(DEPOT)` after `DELIVERY_ACCEPTED`/offload | assignment → `JOURNEY_COMPLETE`, truck → `IDLE` | if all trucks done → order `COMPLETED`; notify seller/TSP |

> The QR-scan delivery acceptance itself is a separate API action; the geofence service only establishes that the truck is **physically at** the destination (the precondition the scan validates against).

---

## 5. Idempotency, Ordering & Reliability

- **Buffered source:** the flespi **webhook stream is store-and-forward** — if the endpoint is down or returns non-2xx, flespi **retries and replays**, so a deploy/crash doesn't lose telemetry. (Confirm exact retry window against flespi docs.)
- **Return 2xx only after successful handling** of the batch (or the messages you accept), so flespi doesn't drop unprocessed data.
- **Out-of-order safe:** every state update (`truck_live_state`, geofence state) is gated on **device timestamp**; older readings are ignored.
- **Duplicate safe:** telemetry inserts are append-only history (dupes acceptable / dedupe on `(truck_id, timestamp)` if desired); state transitions are idempotent because they only fire on a **change** of inside/outside.
- **Unknown device:** log and skip — never fail the whole batch for one bad record.

---

## 6. Configuration

### 6.1 flespi stream (webhook)

- Type: **webhook / HTTP stream**.
- Target: `https://<api-gw-domain>/ingest/telemetry`.
- Auth: shared secret header (verified in Lambda) or signed request.
- Payload: batched device messages — `device_id`, `timestamp`, `position.latitude/longitude`, `position.speed`, sensor channels, ignition.
- Calibration: decide **flespi-side** (calculators) **or** in-Lambda via `fuel_sensors.calibration_table`. Document the choice; don't do it twice.

### 6.2 Environment / secrets (Secrets Manager)

```
DATABASE_URL            # RDS Postgres
FLESPI_WEBHOOK_SECRET   # validate inbound POSTs
APP_WORKSPACE_DEFAULT   # MVP single workspace (ws-anptco)
GEOFENCE_DEST_RADIUS_M  # default 100
GEOFENCE_DEPOT_RADIUS_M # default 200
```

---

## 7. Deployment

| Aspect | Choice |
|---|---|
| Compute | **API Gateway (HTTP API) → Lambda** (no always-on box) |
| Broker | **flespi only** (no AWS IoT Core) |
| DB | **RDS Postgres `db.t4g.micro/small`** |
| Telemetry retention | **partition monthly; drop/downsample raw after 30–90 days** |
| Scale-out trigger | at **hundreds of trucks**, move to a batching container consumer (Fargate/EC2) reading flespi MQTT in bulk |

---

## 8. Throughput & Sizing (current scale)

- Devices: 5–10. Interval: 10–30s ⇒ **< 1 msg/sec aggregate**.
- Telemetry rows: **~30k–60k/day**. Trivial for Postgres with monthly partitions.
- Geofence work: a handful of Haversine comparisons per message (depot + the truck's active destination) — negligible CPU.
- This is comfortably within Lambda + RDS-small; no sharding, no queue needed at MVP.

---

## 9. Summary

A **single, durable, buffered** ingestion service turns Galileosky/flespi telemetry into two things the rest of the platform relies on:

1. **Authoritative location** — fast latest-state + partitioned history.
2. **Authoritative geofence events** — stateful, de-duplicated ENTER/EXIT that drive the order lifecycle.

Live dashboard tracking is deliberately **not** part of this service — it is a separate, best-effort read path layered on top, so a glitch there can never corrupt or lose the system-of-record data this service owns.
