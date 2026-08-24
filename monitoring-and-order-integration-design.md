# Order Integration & Telemetry Anomaly Detection — Design

**Scope:** Ordering-system integration + five telemetry-driven monitoring subsystems (suspected-delivery inference, stop recording, sensor tampering, fuel draining, external power tampering).
**Assumed stack:** Go ingestion service, PostgreSQL (workspace-scoped RLS), direct Galileosky ingestion pipeline, Haversine geofence engine, Trip/Order abstractions.
**Status:** Design draft for review.

---

## 0. Framing & shared concepts

This document assumes the platform runs in the **monitoring-heavy mode** ("Plan B" — the ordering system is external and authoritative for the commercial record; we consume its output and add telemetry-based verification and anomaly detection on top).

Three abstractions stay decoupled throughout:

- **Order** — commercial record owned by *their* ordering system. Synced into us, never authored by us.
- **Trip** — physical journey of a vehicle (depot → destination → return). Authored by us from telemetry. A Trip may exist with no Order (fallback) or be linked to one.
- **Delivery event** — the fulfillment moment. Either *confirmed* (from the order workflow / QR gates) or *suspected* (inferred from telemetry).

Every detection subsystem below emits into one **unified alert model** rather than bespoke tables per feature. This keeps the UI, notification fan-out, and acknowledgement workflow uniform.

### 0.1 Unified alert model

```sql
CREATE TYPE alert_type AS ENUM (
  'ORDER_SYNC_FAILURE',
  'SUSPECTED_DELIVERY',
  'SUSPICIOUS_STOP',
  'SENSOR_TAMPERING',
  'FUEL_DRAINING_SUSPECTED',
  'EXTERNAL_POWER_TAMPERING'
);

CREATE TYPE alert_status AS ENUM ('OPEN','ACKNOWLEDGED','RESOLVED','FALSE_POSITIVE');

CREATE TABLE alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL,
  type            alert_type NOT NULL,
  status          alert_status NOT NULL DEFAULT 'OPEN',
  severity        smallint NOT NULL DEFAULT 3,          -- 1 (critical) .. 5 (info)
  vehicle_id      uuid,
  device_imei     text,
  trip_id         uuid,
  order_id        uuid,
  sensor_id       text,
  occurred_at     timestamptz NOT NULL,                 -- event time (telemetry ts)
  detected_at     timestamptz NOT NULL DEFAULT now(),   -- when we raised it
  last_location   geography(Point,4326),
  geofence_id     uuid,
  confidence      numeric(4,3),                         -- 0.000 .. 1.000 (inferred alerts)
  dedup_key       text NOT NULL,                        -- see §0.3
  payload         jsonb NOT NULL DEFAULT '{}',          -- type-specific evidence
  UNIQUE (workspace_id, dedup_key)
);
```

### 0.2 Telemetry assumptions

The detection logic reads a normalized telemetry row per device fix. Map these to your Galileosky parser fields:

| Logical field       | Meaning                                        | Notes |
|---------------------|------------------------------------------------|-------|
| `ts`                | Fix timestamp (device clock, UTC)              | Trust device time; also store server-receive time to catch buffered/replayed records |
| `lat`, `lon`        | Position                                       | Reject when `hdop` high / `sats` low |
| `speed`             | Ground speed                                   | km/h |
| `ignition`          | Ignition / engine on                           | Boolean digital input |
| `ext_voltage`       | External (main) supply voltage                 | For §6 |
| `batt_voltage`      | Internal backup battery voltage                | For §6 |
| `fuel_level[]`      | One or more fuel readings (RS485 / BLE)         | Litres or raw ADC → calibrated litres |
| `fuel_sensor_meta[]`| Per-sensor presence / status / RSSI            | For §4 |
| `sats`, `hdop`      | GPS quality                                    | Gate all geometric logic on this |

**Quality gate (applies everywhere):** discard or down-weight fixes with `sats < MIN_SATS` or `hdop > MAX_HDOP`. Never raise a geofence-dependent alert on a low-quality fix.

### 0.3 Dedup keys

Every detector computes a deterministic `dedup_key` so a re-processed telemetry batch or a flapping condition does not spawn duplicate alerts. Pattern: `{type}:{vehicle}:{coarse_bucket}` where the bucket is chosen per detector (e.g. the stop's cluster id, or the draining event window). The `UNIQUE(workspace_id, dedup_key)` constraint makes ingestion idempotent — an `INSERT ... ON CONFLICT DO NOTHING` (or `DO UPDATE` to extend `payload`) is the whole write path.

### 0.4 Per-vehicle tunables

Thresholds below are defaults. Store the real values in a `monitoring_config` row keyed by `(workspace_id, vehicle_id NULLABLE)` so a workspace default can be overridden per vehicle (tank capacity, burn rate, and geofence sets differ by truck). All constants named in CAPS resolve through this config.

---

## 1. Integration with the existing ordering system

### 1.1 Direction of integration

Their system is authoritative and event-producing; ours is a consumer. Use **both** channels, primary + reconciliation:

- **Primary — inbound webhook (push).** After Step 4 of their workflow they `POST` the order to our endpoint. This is the low-latency path.
- **Reconciliation — pull (poll).** We periodically pull a "recently changed orders" read endpoint to catch anything the webhook dropped (their outage, our downtime, network loss). This closes the at-least-once gap without depending on their retry discipline.

Relying on push alone means a single failed call silently loses an order; the pull backstop is what makes the integration durable. Request both a webhook target config **and** a read/list API when you obtain access.

### 1.2 Trigger point — "after Step 4"

Pin the trigger to a **named order state**, not to a UI step number, because step numbering drifts. Agree with them on the exact state (e.g. `DISPATCH_CONFIRMED` / `ASSIGNED_TO_VEHICLE`) that Step 4 produces, and have them fire on the state *transition into* it. Key properties to require:

- Fires **once per transition**, but is safe to fire again (idempotent — see §1.5).
- Fires only when the order already has a **vehicle assigned** (otherwise we can't link telemetry). If Step 4 can occur before assignment, we need a *second* trigger on assignment, or the assignment field included later via update events.
- Subsequent status changes (loaded, in-transit, delivered, cancelled) come as **update events** on the same order id, so we track the lifecycle, not just creation.

### 1.3 Data contract (inbound payload)

Minimum fields we need to link order → vehicle → delivery and to drive fallback/anomaly logic:

```jsonc
{
  "event_id": "evt_01H...",            // unique per emission — our idempotency key
  "event_type": "order.dispatched",    // or order.updated / order.cancelled
  "occurred_at": "2026-08-13T09:12:00Z",
  "order": {
    "external_order_id": "SO-2026-88412",   // their stable id (our natural key)
    "status": "DISPATCH_CONFIRMED",
    "customer": { "id": "C-102", "name": "…" },
    "product": { "code": "HSD", "name": "High-Speed Diesel" },
    "quantity_ordered_l": 12000,
    "source": {                              // depot / loading point
      "id": "DEP-MUSCAT-01",
      "geofence_ref": "gf_depot_muscat"      // must map to a geofence we hold
    },
    "destination": {
      "id": "SITE-4471",
      "name": "…",
      "lat": 23.61, "lon": 58.59,
      "geofence_ref": "gf_site_4471"         // if they have one; else we derive from lat/lon
    },
    "vehicle": {
      "plate": "…",
      "device_imei": "8655130720xxxxx"       // strongest link if available
    },
    "driver": { "id": "DRV-55", "name": "…" },
    "scheduled_window": { "from": "…", "to": "…" }
  }
}
```

**Linking rule (order → vehicle):** prefer `device_imei` (unambiguous → our device row). Fall back to `plate` normalized (uppercase, strip spaces/dashes) against a plate→vehicle map. If neither resolves, still persist the order but flag it `UNLINKED` and raise a low-severity `ORDER_SYNC_FAILURE` alert (`payload.reason = "vehicle_unresolved"`) rather than dropping it.

**Linking rule (order → delivery/trip):** on a linked, dispatched order, open or attach a **Trip** for that vehicle whose expected route is `source.geofence → destination.geofence`. The Trip is what telemetry attaches to. Confirmed delivery closes when the order reaches a delivered status *or* the QR gate flow completes; suspected delivery (§2) can pre-fill it when the order channel is silent.

### 1.4 Sync tables

```sql
CREATE TABLE synced_orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL,
  external_order_id text NOT NULL,
  status            text NOT NULL,
  vehicle_id        uuid,                 -- NULL until resolved
  trip_id           uuid,
  product_code      text,
  quantity_ordered_l numeric,
  source_geofence_id uuid,
  dest_geofence_id   uuid,
  dest_point         geography(Point,4326),
  scheduled_from     timestamptz,
  scheduled_to       timestamptz,
  raw               jsonb NOT NULL,       -- last full payload, for audit/replay
  link_state        text NOT NULL DEFAULT 'LINKED',  -- LINKED | UNLINKED
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, external_order_id)
);

-- Idempotency ledger for inbound events
CREATE TABLE order_events (
  workspace_id uuid NOT NULL,
  event_id     text NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, event_id)
);
```

### 1.5 Failure & delayed-sync handling

The contract: **persist durably before acknowledging**, dedup on `event_id`, and never lose an order.

1. **Inbound webhook handler**
   - Verify signature (HMAC shared secret or mTLS) — reject unauthenticated calls.
   - `INSERT` into `order_events` on `event_id`. On conflict → this is a retry; return `200` immediately (idempotent no-op).
   - Upsert `synced_orders` on `external_order_id` (latest event wins by `occurred_at`; ignore out-of-order stale updates).
   - Return `2xx` **only after** the DB commit. Any failure → return `5xx` so *they* retry.

2. **Their retries.** Require exponential backoff with jitter on their side for non-2xx. Document a max retry horizon; anything beyond it is caught by reconciliation.

3. **Reconciliation poll (backstop).** A Go worker calls their "orders changed since T" endpoint every N minutes, upserts anything missing/newer. This is what recovers from *our* downtime and *their* dropped webhooks. Track a per-workspace `sync_cursor` (last successful `updated_at` watermark).

4. **Dead-letter.** Payloads that fail validation/parse go to a `dead_letter` table with the raw body + error, and raise `ORDER_SYNC_FAILURE` (severity 2). Never let a malformed payload block the queue.

5. **Unlinked orders.** Persisted but vehicle unresolved → periodic re-link job retries resolution (plate corrections, device provisioning lag) and clears the alert on success.

6. **Staleness detector.** If the webhook channel produces **zero** events for longer than `ORDER_CHANNEL_SILENCE_MAX` while trucks are demonstrably moving, raise a single `ORDER_SYNC_FAILURE` (severity 2, `reason="channel_silent"`) and **hand over to fallback detection (§2)** so operations continues blind-but-monitored.

---

## 2. Fallback: suspected-delivery detection from telemetry

**Goal:** when the order channel is silent or an order is unlinked, infer that a delivery *probably* happened from vehicle + fuel-sensor behavior. Output is always marked **suspected** with a confidence score — it augments, never overrides, the commercial record.

### 2.1 Signal model

A delivery has a recognizable telemetry fingerprint:

1. **Load** — fuel level rises sharply while inside (or adjacent to) a **depot/source** geofence.
2. **Transit** — vehicle departs the depot and travels with a full-ish tank.
3. **Arrival** — vehicle enters a **customer/destination** geofence and becomes stationary.
4. **Unload** — fuel level drops sharply while stationary inside that destination geofence.
5. **Departure** — fuel stabilizes at the lower level, then the vehicle leaves.

### 2.2 Inferred trip state machine (per vehicle)

```
IDLE
  └─(fuel rises ≥ LOAD_DELTA_L inside depot geofence, stationary)→ LOADING
LOADING
  └─(fuel stable + vehicle exits depot geofence)→ IN_TRANSIT
IN_TRANSIT
  └─(enters a known destination geofence & speed ~0 for ARRIVE_DWELL_MIN)→ AT_DESTINATION
AT_DESTINATION
  └─(fuel drops ≥ UNLOAD_DELTA_L while inside dest geofence, stationary)→ UNLOADING
UNLOADING
  └─(fuel stable for SETTLE_MIN, then exits geofence)→ DELIVERED(suspected)
```

Any state can fall back to `IN_TRANSIT`/`IDLE` if conditions reverse (e.g. fuel rise inside a "destination" was a mis-tagged geofence).

### 2.3 Default thresholds

| Constant | Default | Notes |
|---|---|---|
| `LOAD_DELTA_L` | ≥ 20% of tank capacity | Distinguish a real load from noise/top-up |
| `UNLOAD_DELTA_L` | ≥ 15% of tank capacity | Or a configured minimum drop volume |
| `ARRIVE_DWELL_MIN` | 5 min stationary in dest geofence | Reuses stop detector (§3) |
| `SETTLE_MIN` | 3 min stable reading | Fuel sloshing settles before we read the delta |
| `STATIONARY_SPEED` | < 3 km/h | Shared with §3 |

### 2.4 Confidence scoring

Don't emit a binary. Score `0..1` from the strength of each leg, e.g. weighted sum of: matched a load at a real depot (+), destination geofence is a *known customer* vs unknown polygon (+), unload delta magnitude, dwell duration, whether an unlinked order exists for that vehicle/day (+ strong). Emit `SUSPECTED_DELIVERY` with `confidence` and the leg evidence in `payload`. If an order later syncs and matches, auto-reconcile the suspected event to the confirmed one and drop the alert to `RESOLVED`.

### 2.5 Guardrails

- Never auto-*confirm*. Suspected deliveries are a review queue, not a billing source.
- Require the **unload leg specifically inside a geofence** for a delivery; an unload *outside* any geofence routes to §5 (draining), not here.
- One suspected delivery per (vehicle, destination, arrival-window) — dedup on that bucket.

---

## 3. Vehicle stop recording

**Goal:** persist every significant stop with location, timing, geofence context, and a normal-vs-suspicious classification.

### 3.1 Stop detection algorithm (online, streaming)

Process telemetry per device in time order, maintaining an open-stop candidate:

```
for each fix:
  if not in_stop:
    if speed < STATIONARY_SPEED (and/or ignition off):
        open candidate at fix.location, start = fix.ts, anchor = location
  else:  # in candidate stop
    if speed < STATIONARY_SPEED and dist(fix.location, anchor) <= STOP_RADIUS_M:
        extend candidate (end = fix.ts)             # still stopped
    else:
        # movement resumed
        if (candidate.end - candidate.start) >= MIN_STOP_DURATION:
            finalize stop
        discard/close candidate
```

- **Anchor + radius** absorbs GPS jitter so a parked truck's wandering fixes don't look like movement. Recompute the stop centroid from all member fixes on finalize.
- Prefer **ignition off** as a strong stop signal when available; combine with speed for engine-idling stops (idle-at-gate counts as a stop).
- Emit `MIN_STOP_DURATION` default 3 min so traffic lights / brief halts don't flood the table (tunable).

### 3.2 Schema

```sql
CREATE TABLE vehicle_stops (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL,
  vehicle_id    uuid NOT NULL,
  trip_id       uuid,
  location      geography(Point,4326) NOT NULL,       -- centroid
  started_at    timestamptz NOT NULL,
  ended_at      timestamptz,                          -- NULL while ongoing
  duration_s    integer,
  inside_geofence boolean NOT NULL,
  geofence_id   uuid,
  geofence_name text,
  classification text NOT NULL DEFAULT 'NORMAL',      -- NORMAL | SUSPICIOUS
  reasons       text[] DEFAULT '{}',
  dedup_key     text NOT NULL,
  UNIQUE (workspace_id, dedup_key)
);
```

`dedup_key = 'stop:{vehicle}:{started_at_epoch}'` so re-processing is idempotent.

### 3.3 Geofence resolution

On finalize, run the centroid through the Haversine/polygon geofence engine → `inside_geofence`, `geofence_id`, `geofence_name`. A stop can be inside multiple overlapping geofences; keep the most specific (smallest area) as primary and list the rest in a payload/join if needed.

### 3.4 Normal vs suspicious classification

Flag `SUSPICIOUS` (accumulate `reasons`) when any of:

- Stop is **outside every known geofence** and exceeds `SUSPICIOUS_STOP_DURATION` (e.g. > 15 min in the middle of nowhere).
- Stop is **off the expected route** for a linked Trip (deviation beyond corridor width).
- Stop **coincides with a fuel drop** (join to §5) → strong signal, high severity.
- Stop occurs at an **unusual hour** relative to the vehicle's baseline, or repeatedly at the same unauthorized point.

Suspicious stops raise a `SUSPICIOUS_STOP` alert; normal stops are recorded silently for the trip log. Keep classification *separate* from recording — record every stop regardless; classification is an annotation.

---

## 4. Sensor tampering detection

**Goal:** detect that a fuel sensor was removed, disconnected, covered/blocked, or lost (BLE), or is returning abnormal/inconsistent data — while the tracker itself is still alive. Emit `SENSOR_TAMPERING` with time, vehicle, sensor id, last known location.

The key discriminator: **the device keeps reporting, but the sensor stops making sense.** If the whole device goes dark that's a connectivity/power event (§6), not sensor tampering.

### 4.1 Detection rules (per sensor, debounced)

| Condition | Signal | Interpretation |
|---|---|---|
| **Sensor absent from report** | Device fix present, but this sensor's value/heartbeat missing for ≥ `SENSOR_MISS_WINDOW` | Disconnected / removed |
| **Value pinned to sentinel** | Reading = 0 / max / known error code abruptly, from a healthy prior value | Disconnected / short |
| **Frozen value** | Variance ≈ 0 across many samples **while engine on / vehicle moving** | Covered, blocked, or spoofed with a fixed feed |
| **BLE link lost** | BLE fuel sensor id drops out of advertised set / RSSI → 0 while device on | BLE sensor removed or jammed |
| **Out-of-range** | Reading outside physical bounds (`< 0`, `> capacity × 1.05`) | Fault or manipulation |
| **Impossible jump** | Level change faster than physically possible (not a fill/drain rate) | Signal manipulation |

### 4.2 Debounce & false-positive control

BLE and RS485 links flap. Require the condition to **persist** (`SENSOR_MISS_WINDOW` default 2–3 consecutive expected samples or ~2 min) before raising, and auto-clear if the sensor returns clean within a grace window. Distinguish "device buffered offline then flushed" (whole gap, all fields missing → not sensor tampering) from "device online, only sensor missing" (→ tampering). This is why §4 keys on *device-alive + sensor-missing*, checked against the fix cadence, not wall clock.

### 4.3 Output

```jsonc
// alerts.payload for SENSOR_TAMPERING
{
  "sensor_id": "ble_fuel_1",
  "condition": "frozen_value | absent | sentinel | ble_lost | out_of_range | impossible_jump",
  "last_good_value_l": 8200,
  "last_good_at": "…",
  "samples_missing": 5
}
```

Record `sensor_id`, `vehicle`, `occurred_at` (first bad sample), and `last_location` (last good fix). Severity high (1–2) — tampering with the measurement device is the enabling step for theft, so it should page.

---

## 5. Suspicious fuel draining outside a geofence

**Goal:** detect unauthorized draining — a real fuel loss that is *not* an authorized delivery — with emphasis on losses **outside approved geofences**. Emit `FUEL_DRAINING_SUSPECTED`.

The hard part is separating three things that all reduce fuel: **legitimate delivery/unload**, **normal engine consumption**, and **theft**.

### 5.1 Discriminators

| Cause | Rate | Vehicle state | Location | Order/delivery present |
|---|---|---|---|---|
| Delivery unload | Fast, large | Stationary | Inside a destination geofence | Yes (or suspected §2) |
| Engine consumption | Slow, tracks distance/engine-hours | Moving / idling | Anywhere | N/A |
| **Theft / draining** | **Fast, large** | **Usually stationary** | **Outside approved geofence** | **No** |

### 5.2 Algorithm

1. **Smooth** the raw fuel series (moving vehicles slosh; use a median/rolling filter and only evaluate deltas over `DRAIN_WINDOW`, e.g. 2–5 min).
2. Compute `drop = level(t-Δ) − level(t)` and `rate = drop/Δ`.
3. Compare `rate` against the vehicle's **expected burn rate** for its current state (moving-under-load, idling, off). A drop far exceeding max plausible consumption is the trigger candidate.
4. **Context gates:**
   - Prefer **stationary** (`speed < STATIONARY_SPEED`) — a big drop while parked is far more suspicious than while driving (driving losses are more likely mis-readings/slosh; require a larger threshold when moving).
   - Resolve current geofence. If **inside an approved delivery/depot geofence** *and* a linked or suspected delivery is active → treat as delivery/unload, **not** draining.
   - If **outside all approved geofences** (or inside a non-delivery zone) with no active delivery → **raise `FUEL_DRAINING_SUSPECTED`**.
5. **Corroborate** with §3 (is there a concurrent stop?) and §4 (was the sensor just tampered with immediately before/after? — theft often pairs with sensor manipulation). Concurrent signals raise severity and confidence.

### 5.3 Defaults

| Constant | Default | Notes |
|---|---|---|
| `DRAIN_WINDOW` | 3 min | Evaluation window over smoothed series |
| `DRAIN_DELTA_STATIONARY_L` | ≥ 5–10% capacity | Trigger while parked |
| `DRAIN_DELTA_MOVING_L` | higher (e.g. ≥ 15%) | Guard against slosh/mis-reads in motion |
| `MAX_BURN_RATE` | per vehicle | Consumption ceiling; drops above this aren't consumption |

### 5.4 Output & dedup

One alert per draining **event** (contiguous drop), not per sample — dedup on `drain:{vehicle}:{event_start_bucket}`. Payload carries `drop_l`, `rate_l_per_min`, `speed`, `inside_geofence`, `active_delivery: bool`, and links to any concurrent stop/tamper alerts.

---

## 6. External power tampering / disconnection

**Goal:** detect the main power feed to the tracker being cut or tampered with, distinguished from a normal vehicle shutdown. Emit `EXTERNAL_POWER_TAMPERING` with location + timestamp.

Galileosky-class devices report **external supply voltage** and **internal backup battery voltage**, and keep transmitting on the backup battery for a while after main power is lost — that backup window is exactly what lets us catch and locate the event.

### 6.1 Signals

- **External voltage collapse:** `ext_voltage` falls below `EXT_V_MIN` (below what the vehicle electrical system would ever supply when connected) — i.e. toward ~0, not just a dip.
- **Switch to battery:** device continues reporting while `batt_voltage` sustains it and `ext_voltage` is gone → confirms the feed was cut, not the device dying.

### 6.2 Normal shutdown vs suspicious loss

A parked truck powering down is normal; a feed cut mid-route is not. Classify using ignition + motion + location context:

| Situation | Verdict |
|---|---|
| `ext_voltage` drops **with** ignition-off, vehicle parked at base/depot geofence | Normal shutdown → no alert (or info only) |
| `ext_voltage` drops **while ignition on** or **while moving** | **Suspicious → alert (severity 1–2)** |
| `ext_voltage` drops while parked **outside** any authorized geofence | **Suspicious → alert** |
| Device goes fully dark (no battery-backed reports) unexpectedly | Ambiguous; correlate with last state — raise if it followed movement / off-base |

Note many vehicles keep the tracker on constant (unswitched) power, in which case *any* `ext_voltage` collapse is suspicious regardless of ignition — make "power is ignition-switched vs constant" a per-vehicle config flag, because it flips the normal-shutdown branch.

### 6.3 Capture

Record the event at the **last fix before/at the voltage collapse** — location, timestamp, `ext_voltage`, `batt_voltage`, ignition, speed. That last battery-backed fix is often the most operationally important location in the whole system (where the truck was when someone cut the tracker). Payload:

```jsonc
{
  "ext_voltage": 0.2,
  "batt_voltage": 3.9,
  "on_battery": true,
  "ignition": true,
  "context": "moving | parked_offbase | parked_onbase",
  "power_mode": "constant | ignition_switched"
}
```

### 6.4 Debounce

Ignore momentary sags (cranking, brief dropouts) — require the low-voltage condition to persist `POWER_LOSS_DEBOUNCE` (e.g. 30–60 s) before raising, and auto-resolve if external power returns within a short grace window.

---

## 7. Cross-cutting: how the detectors compose

The high-value detections are **correlations**, not isolated triggers. Theft typically looks like: *suspicious stop outside geofence (§3)* → *external power or sensor tampering (§4/§6)* → *fuel drop (§5)*, in a tight time window. Design the alert layer so related alerts within a short window on the same vehicle get grouped into an **incident** (shared `payload.incident_id`), which is what operations should actually review — a single "possible theft at {location} {time}" card rather than three separate rows.

**Suggested precedence when multiple fire together:**
1. Power/sensor tampering (measurement integrity compromised) — highest, because it undermines every other signal.
2. Fuel draining outside geofence.
3. Suspicious stop.

**Processing order per telemetry batch:** quality-gate → update stop detector (§3) → run power (§6) and sensor (§4) rules → run fuel delta (§5, needs stop + geofence context) → update inferred-delivery state machine (§2) → correlate into incidents → upsert alerts idempotently.

---

## 8. Open questions to resolve with their team / on-site

1. Exact order-state name that "Step 4" produces, and whether vehicle assignment is guaranteed by then.
2. Do they expose a "changed since" read endpoint for the reconciliation pull? Auth mechanism for the webhook (HMAC vs mTLS)?
3. Do they own destination geofences, or must we derive polygons from a delivery point + radius?
4. Per-vehicle: tank capacity, calibration curve (ADC→litres), power wiring (constant vs ignition-switched), sensor type (RS485 vs BLE), expected burn rate.
5. Notification routing/severity policy per alert type (which page, which are digest-only).
