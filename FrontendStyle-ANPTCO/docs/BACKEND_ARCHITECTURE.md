# Fuel Ordering & Monitoring Platform — Backend Architecture

**Status:** Design baseline for MVP backend
**Canonical source of truth:** the **dashboard as-built** (post-refactor) flow, not the original Design Proposal where the two disagree.
**Scope:** end-to-end backend design — telemetry ingestion, geofencing, order lifecycle, APIs, multi-tenancy, and AWS deployment with cost optimization.

---

## 1. Executive Summary

This backend powers a multi-tenant SaaS that connects fuel **sellers** (depots) with fuel **clients** (stations) via **Transportation Service Providers (TSPs)**. Trucks carry **Galileosky GPS + fuel sensors**, which publish through **flespi**. The backend ingests that telemetry, runs **geofence** logic to drive the order lifecycle (arrival, delivery, return-to-depot), and serves dashboards over a REST/JSON API.

The headline design decisions for this build:

1. **flespi is the MQTT broker — we do not add AWS IoT Core.** We subscribe to flespi directly.
2. **One ingestion path** (`flespi webhook → API Gateway → Lambda`) handles persistence + geofencing. No two-subscriber split.
3. **The browser never talks to flespi directly.** All live data goes through the backend (tenant-scoped).
4. **Latest-state is separated from telemetry history**, and history is partitioned/retained.
5. **Plain RDS Postgres over Aurora Serverless v2** at current scale for cost.

Estimated cost at current scale (5–10 devices, 100–200 orders/day): **~$40–70/month** vs the proposal's $240–340.

---

## 2. As-Designed vs As-Built (what is canonical)

The original Design Proposal predates the dashboard. The dashboard was refactored later and is the **correct** behavior. Key reconciliations the backend must honor:

| Concern | Proposal (older) | Dashboard (canonical) |
|---|---|---|
| TSP onboarding | Email invite + token | **Seller-code + connection request** |
| Sensor integration | 1-step (TSP → Admin) | **2-step: Seller approve → Admin approve** |
| Truck/compartments | Arbitrary per-compartment capacity | **Fixed 4 × 9,100 L; whole-compartment orders** |
| QR payload | `{truck_id, workspace_id}` JSON | **Raw `truck_id` string** |
| Roles | adds `CLIENT_VIEWER` | adds **`DRIVER`** |
| Order statuses | smaller set | **superset incl. `LOADING`/`LOADED`** |
| Tenancy (MVP) | many workspaces | **single workspace `ws-anptco`, one depot** (scales out later) |

> The schema and APIs below keep `workspace_id` everywhere so multi-tenancy turns on without a rewrite, even though MVP runs a single workspace.

---

## 3. High-Level Architecture

```
                          ┌───────────────────────────────────────────┐
                          │              Client Web Browser             │
                          │  Seller / TSP / Client / Admin / Driver UI  │
                          └───────────────┬─────────────────────────────┘
                                          │ HTTPS (JWT)
                          ┌───────────────▼─────────────────────────────┐
                          │      API Gateway (HTTP API) + Authorizer     │
                          └───────┬───────────────────────┬─────────────┘
                                  │ REST/query            │ WebSocket (optional, live)
                          ┌───────▼────────┐      ┌────────▼─────────┐
                          │  Core API      │      │ Live fan-out      │
                          │ (Fargate/Go    │      │ (API GW WS conns) │
                          │  or Lambda)    │      └────────▲─────────┘
                          └───────┬────────┘               │ push
                                  │                         │
                          ┌───────▼─────────────────────────┴─────────┐
                          │              PostgreSQL (RDS)               │
                          │  workspaces, users, trucks, orders,         │
                          │  truck_live_state, truck_telemetry (part.), │
                          │  geofences, geofence_events, ...            │
                          └───────▲─────────────────────────────────────┘
                                  │ writes (telemetry, events, state)
                          ┌───────┴──────────────────────────────────┐
                          │   Ingestion Lambda (device→truck,         │
                          │   persist, geofence eval, emit events)    │
                          └───────▲───────────────────────────────────┘
                                  │ HTTPS POST (batched, buffered, retried)
                          ┌───────┴───────┐
                          │ flespi stream │  ◀── MQTT ◀── Galileosky G-10 (GPS + fuel sensors)
                          │  (webhook)    │
                          └───────────────┘
```

Supporting AWS services: **S3 + CloudFront** (QR PNGs, KYC docs), **Cognito** (auth/JWT), **SES** (email), **Secrets Manager** (DB creds, flespi token, JWT key), **CloudWatch** (logs/metrics/alarms).

---

## 4. Telemetry Ingestion (the core of this build)

### 4.1 Path: flespi webhook → API Gateway → Lambda

flespi already brokers the Galileosky MQTT traffic. We attach a flespi **stream of type `webhook`** that batches device messages and HTTP-POSTs them to our endpoint.

```
Galileosky G-10  ──MQTT──▶  flespi device  ──stream──▶  HTTPS POST  ──▶  API Gateway  ──▶  Ingestion Lambda
   (GPS + fuel,                (broker +                  (batched,
    every 10–30s)              calibration)               buffered)
```

The ingestion Lambda performs, per message, **in order**:

1. **`device_id → truck_id`** lookup (in-memory cache; `trucks.galileosky_device_id`).
2. **Persist** the raw reading into `truck_telemetry` (partitioned).
3. **Update `truck_live_state`** (latest position + per-compartment fuel + total) — only if the message timestamp is newer.
4. **Geofence evaluation** against the truck's active-order destination and the depot.
5. **Emit `geofence_events`** (ENTER/EXIT) and drive the **order state machine**.
6. *(Optional)* push the new position to permitted WebSocket connections for live tracking.

> Location and geofence are **modules inside one deployable**, not two network services. The seam exists for future scale-out; we don't pay for it now.

### 4.2 Why these choices

- **Why not AWS IoT Core?** flespi *is* the broker. IoT Core would be a second broker + rules engine + certs to pay for and operate, for 5–10 devices. Pure overhead — removed.
- **Why one consumer, not two subscribers?** Two flespi subscriptions = double connections, double parsing, and geofence needs the location anyway. At <1 msg/sec aggregate there is nothing to shard.
- **Why webhook over a persistent MQTT container (for MVP)?**
  - **Reliability:** the webhook stream is **store-and-forward** — if our endpoint is down/non-2xx, flespi **buffers and replays**. A raw MQTT subscriber loses messages during any outage unless you add persistent sessions + QoS.
  - **Cost:** no always-on box; pay per (batched) invocation — near-zero at this scale.
  - **Latency is a non-issue:** the device only reports every 10–30s, so shaving transport latency from ~2s to ~0.2s changes nothing the user can see.
- **When to revisit a container consumer:** at **hundreds of trucks**, millions of tiny Lambda invocations cost more than a fixed batching container. We're years from that line.

---

## 5. Live Tracking (fleet monitor)

**Rule: the dashboard never subscribes to flespi directly.** Doing so would (a) leak the flespi token into the browser, (b) bypass tenant isolation (a client could watch every truck), and (c) hit flespi connection limits.

Live data flows **through the backend**, filtered by what the user may see. Two options, upgrade-in-place:

1. **Poll** `GET /trucks/{id}/current-position` every 2–3s. Dead simple, and indistinguishable from push given the 15s device interval. **Start here.**
2. **WebSocket fan-out:** API Gateway holds the WS connections; the ingestion Lambda pushes new positions to permitted connections via the API Gateway Management API. Add only if polling feels insufficient.

> **Durability vs liveness separation:** the webhook→Lambda path is the **source of truth**. Any live/WS path is **best-effort and disposable** — if it drops a frame, the next reading arrives in seconds and the DB already has the truth.

---

## 6. Geofencing & Order State Machine

### 6.1 What the geofence drives

The geofences that matter are **dynamic**: the **active order's destination** (a client station) and the **depot**. Because destinations vary per order, geofence is evaluated **in our backend against the order's coords**, not in flespi's static geofences.

Distance test (Haversine), per the canonical flow:

- truck → **destination < 100m**  ⇒ order `ARRIVED`, notify client (replaces the dashboard's `JOURNEY_DURATION_MS` timer).
- truck → **depot < 200m** after delivery ⇒ assignment `JOURNEY_COMPLETE`, truck `IDLE`; if all trucks done ⇒ order `COMPLETED`.

### 6.2 Stateful detection (no duplicate events)

Geofence detection is **stateful** per truck:

- Store **last inside/outside** state per (truck, geofence).
- Emit exactly **one ENTER** on outside→inside transition, **one EXIT** on inside→outside.
- Use the **message timestamp**; ignore stale/out-of-order readings. Telemetry duplicates and reordering happen — design for them.

### 6.3 Events feed the workflow

`geofence_events` are the real-world triggers that advance orders and notify users (ARRIVED → client; depot return → seller/TSP). The current dashboard fakes these with timers; the backend replaces the timers with real events.

---

## 7. Data Model (backend-relevant)

Carries `workspace_id` throughout for tenant isolation. Highlights beyond the proposal's schema:

```sql
-- Latest state: O(1) "where is it now" — separated from history.
CREATE TABLE truck_live_state (
  truck_id            UUID PRIMARY KEY REFERENCES trucks(id) ON DELETE CASCADE,
  workspace_id        UUID NOT NULL,
  latitude            DECIMAL(10,8),
  longitude           DECIMAL(11,8),
  speed               INT,
  total_fuel_liters   DECIMAL(10,2),
  compartment_fuel    JSONB,         -- per-compartment liters
  last_message_at     TIMESTAMPTZ,   -- device time; gate updates on this
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- History: high-volume time-series, partitioned by month (or TimescaleDB).
CREATE TABLE truck_telemetry (
  id                  UUID DEFAULT gen_random_uuid(),
  truck_id            UUID NOT NULL,
  workspace_id        UUID NOT NULL,
  timestamp           TIMESTAMPTZ NOT NULL,   -- device time
  latitude            DECIMAL(10,8) NOT NULL,
  longitude           DECIMAL(11,8) NOT NULL,
  speed               INT,
  ignition_on         BOOLEAN,
  compartment_sensors JSONB,
  total_fuel_liters   DECIMAL(10,2),
  created_at          TIMESTAMPTZ DEFAULT now()
) PARTITION BY RANGE (timestamp);

-- Geofences: depot + per-station zones (stations already known in DB).
CREATE TABLE geofences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  type            VARCHAR(20) NOT NULL,   -- 'DEPOT' | 'STATION'
  ref_id          VARCHAR(64),            -- depot/station id
  name            VARCHAR(255),
  latitude        DECIMAL(10,8) NOT NULL,
  longitude       DECIMAL(11,8) NOT NULL,
  radius_meters   INT NOT NULL
);

-- Entry/exit events that drive the order workflow.
CREATE TABLE geofence_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  truck_id        UUID NOT NULL,
  order_id        UUID,                   -- nullable: idle movement
  geofence_id     UUID NOT NULL,
  geofence_type   VARCHAR(20) NOT NULL,   -- DEPOT | STATION
  event_type      VARCHAR(10) NOT NULL,   -- ENTER | EXIT
  latitude        DECIMAL(10,8),
  longitude       DECIMAL(11,8),
  occurred_at     TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

**Storage rules**
- Telemetry ≈ 30k–60k rows/day at current scale. Postgres handles it; **partition by month**, set **retention** (drop/downsample raw points after 30–90 days).
- The `truck_live_state` read pattern is the single most important perf decision — the dashboard's "current position" never scans history.

---

## 8. Multi-Tenancy & Security

- **DB-level:** every table carries `workspace_id`; Postgres **RLS** policies (`USING (workspace_id = current_setting('app.workspace_id')::uuid)`). Backend sets `SET app.workspace_id` per request/connection.
- **App-level:** JWT (Cognito) carries `sub`, `email`, `workspace_id`, `roles`. API validates the URL `workspaceId` against the token. Cross-workspace denied except for genuinely multi-workspace users.
- **Roles (canonical):** `PLATFORM_ADMIN`, `SELLER_MANAGER`, `TRANSPORT_ADMIN`, `CLIENT`, `DRIVER`.
- **Secrets:** DB creds, **flespi token**, JWT signing key, SES creds in **Secrets Manager** — never in the browser.
- **Encryption:** RDS at rest (KMS), S3 SSE for KYC/QR, TLS 1.2+ in transit. KYC = private bucket + signed URLs; QR = public/CloudFront.

---

## 9. AWS Deployment & Cost Optimization

| Component | Choice | Rationale |
|---|---|---|
| Ingestion | **flespi webhook → API GW (HTTP API) → Lambda** | Cheapest, buffered, no always-on box |
| Telemetry broker | **flespi only (no AWS IoT Core)** | flespi is already the broker |
| Core API | **Fargate (Go)** or Lambda + API GW | Start simple; Fargate if you want a long-lived service |
| Database | **RDS Postgres `db.t4g.micro/small`** | Aurora Serverless v2 floor (~0.5 ACU ≈ $40+/mo idle) is wasteful at this scale |
| Live tracking | **Poll first; API GW WebSocket later** | Device interval makes push latency moot for now |
| Storage | **S3 + CloudFront** (QR, KYC, exports) | Standard |
| Auth | **Cognito** | Free tier covers this scale |
| Email | **SES** | $0.10 / 1k emails |
| Secrets | **Secrets Manager** | flespi token, DB, JWT |
| Observability | **CloudWatch** | Logs, metrics, alarms |

**Indicative monthly cost (current scale): ~$40–70** (RDS small + Lambda/API GW pennies + S3/SES/CloudWatch). Compare to proposal's $240–340 (which assumed Aurora + IoT Core + Fargate baseline).

**Cost crossover to revisit:** when device count reaches the **hundreds**, switch ingestion to a **batching container consumer** (Fargate/EC2) and reconsider Aurora for spiky load.

---

## 10. Decision Log (for the talk track)

1. **Dashboard flow is canonical** — proposal is historical context.
2. **No AWS IoT Core** — flespi is the broker; removing IoT Core cuts a whole service.
3. **One ingestion consumer, modular internally** — location + geofence as packages, not microservices.
4. **Webhook (durable, buffered) over MQTT container (MVP)** — reliability + cost; latency irrelevant at 10–30s device cadence.
5. **Browser → backend → (optional) flespi, never browser → flespi** — token safety + tenant isolation.
6. **Latest-state table separate from partitioned history** — read O(1), bounded storage.
7. **Geofence evaluated in backend against dynamic order destination**, stateful, event-driven; replaces dashboard timers.
8. **Plain RDS over Aurora Serverless** at current scale.

---

## 11. Open Items to Confirm Before Build

- **flespi stream config + buffering guarantees** — confirm webhook retry/replay behavior matches the reliability claim above (linchpin of the whole ingestion design).
- **Calibration** — confirm whether `raw → liters` calibration is applied in flespi or in our Lambda (`fuel_sensors.calibration_table`).
- **Retention policy** — choose raw telemetry retention window (30/60/90 days) and downsample target.
- **Live tracking trigger** — define the threshold at which we add WebSocket fan-out over polling.
