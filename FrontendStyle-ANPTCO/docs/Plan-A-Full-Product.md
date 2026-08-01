# Plan A — Full Product (Ordering + Monitoring)

**Owner:** Backend
**Status:** Engineering plan to harden Mode A into a shippable product
**Canonical baseline:** the dashboard as-built; `BACKEND_ARCHITECTURE.md` + `LOCATION_GEOFENCE_SERVICE.md` are the system of record for ingestion, geofence, and order lifecycle.

> Plan A is the marketplace product: a client places an order, a seller accepts and assigns a transporter, a truck runs the load, and monitoring proves delivery. The ordering module is **on**. This is *not* a greenfield build — the ingestion + geofence + order lifecycle already exist. This plan scopes what remains to make Mode A a clean, complete product and how the finished system fits together.

---

## 1. Scope & non-goals

**In scope**
- The full order lifecycle: place → accept → assign TSP → assign truck/driver → load → en route → arrive → QR delivery → return → complete.
- Trip as the physical unit monitoring runs on (via the Order→Trip decoupling), with the order as the commercial record on top.
- Delivery proof: QR-confirmed acceptance + a delivery note (expected vs loaded vs delivered per compartment).
- Reuse of the built flespi → Lambda → RDS ingestion and the stateful geofence engine.
- Module switch set to `{ ordering: on, monitoring: on }` per workspace.

**Non-goals (explicitly out)**
- Mode B (dispatch API / monitoring-only) — covered by its own plan; Plan A must not block it, but does not build it.
- Real-time dashboard fan-out (WebSocket) beyond best-effort polling — the durable path is the system of record; live view is separate and disposable.
- Re-architecting ingestion (no Kafka, no TimescaleDB, no custom TCP gateway). The built Lambda + RDS shape stands.

---

## 2. Current state (what's already built)

| Area | Status | Notes |
|---|---|---|
| Telemetry ingestion | **Built** | flespi webhook → API GW → Ingestion Lambda → RDS. Store-and-forward, timestamp-gated. |
| Location module | **Built** | `device→truck`, `truck_telemetry` (partitioned), `truck_live_state` (O(1)). |
| Geofence engine | **Built, Order-coupled** | Haversine, stateful ENTER/EXIT, drives the **order** state machine directly. |
| Order lifecycle | **Built** | Full status set incl. `LOADING`/`LOADED`; advanced by geofence + API actions. |
| 2-step sensor integration | **Built** | Seller approve → Admin approve; sets `device_id`, QR (raw `truck_id`), `INTEGRATION_ACTIVE`. |
| Multi-tenancy / auth | **Built** | `workspace_id` + Postgres RLS; Cognito JWT with `workspace_id` + roles. |
| Trip abstraction | **Missing** | Geofence advances `order` directly; no `Trip` seam yet. |
| Delivery note (proof) | **Missing** | Fuel material exists; the expected-vs-measured artifact does not. |
| Module switch | **Missing** | Ordering is implicitly always-on; needs to become an explicit per-workspace flag. |

The remaining Plan A work is the last three rows: introduce Trip, generate the delivery note, and formalize the module switch.

---

## 3. Target architecture (Plan A)

```
Client Browser (Seller / TSP / Client / Admin / Driver)
        │  HTTPS + JWT (workspace_id + roles)
        ▼
API Gateway (HTTP API) + Cognito authorizer
        │
        ▼
Core API  ──────────────┐
  ├─ Ordering module     │   marketplace: place / accept / assign / KYC  (module: ordering ON)
  ├─ Trip module         │   CreateTrip seam · trip state machine
  ├─ Fleet module        │   trucks, drivers, 2-step sensor integration, QR
  ├─ Delivery-proof       │   QR verify · delivery note (expected vs delivered)
  └─ Identity/AuthZ       │   workspace, users, roles, tenant.modules switch
        │
        ▼
PostgreSQL (RDS)  ◀── writes ──  Ingestion Lambda  ◀── webhook ── flespi ◀── MQTT ── Galileosky G-10
  workspaces, users, trucks, orders, order_truck_assignments,
  trips, trip_compartments, truck_live_state, truck_telemetry (part.),
  geofences, geofence_events, delivery_notes, qr_codes,
  kyc_records, kyc_documents
```

Ingestion (right side) is untouched. The change is on the API side: the ordering workflow now produces a **Trip**, geofence advances the **Trip**, and the order mirrors the trip's physical progress.

---

## 4. Domain model — deltas on top of the built schema

Only additive changes. Existing tables (`orders`, `order_truck_assignments`, `truck_live_state`, `truck_telemetry`, `geofences`, `geofence_events`) keep their columns; two tables are added and one FK is re-pointed.

- **`trips`** — one truck's monitored journey for one load. `source = ORDERING` for Plan A. `order_ref` = the internal order id. Carries destination coords + `dest_geofence_id`.
- **`trip_compartments`** — `expected_volume` (the promise, MVP default 9,100 per loaded compartment), `loaded_volume`, `delivered_volume`. This is where the delivery-note proof is computed.
- **`geofence_events.trip_id`** — added; dual-written with `order_id` during migration, then `order_id` dropped.
- **`delivery_notes`** — `trip_id`, `qr_confirmed`, `generated_at`, `pdf_url`. The proof artifact.
- **`qr_codes`** — versioned QR per truck: `truck_id`, `version`, `status` (`ACTIVE`/`REVOKED`), `token_hash`, `created_by`, `reason`, `created_at`. Exactly one `ACTIVE` row per truck. Backs QR versioning, revocation, and the regeneration audit trail (§8.2).
- **`kyc_records`** — per party (TSP or Client): `workspace_id`, `party_type` (`TSP`/`CLIENT`), `status` (`NOT_SUBMITTED`/`PENDING_REVIEW`/`APPROVED`/`REJECTED`/`EXPIRED`), `approved_at`, `expires_at`, `reviewed_by`, `reason`, plus a `kyc_documents` child (doc type, private-S3 key). Drives the KYC gate + audit (§7.1).

(Full DDL and the migration steps are in the Order→Trip decoupling plan; this document consumes it.)

---

## 5. End-to-end lifecycle (the Plan A state machine)

The order enum splits into a **commercial** half (owned by the order) and a **physical** half (owned by the trip). The order mirrors the physical half via a listener.

| Step | Actor | Order (commercial) | Trip (physical) | Trigger |
|---|---|---|---|---|
| Place order | Client | `PLACED` | — | API |
| Accept | Seller Mgr | `ACCEPTED_BY_SELLER` | — | API |
| Assign TSP | Seller Mgr | `ASSIGNED_TO_TSP` | — | API |
| Assign truck + driver | TSP | `ASSIGNED` | **`CreateTrip`** → `CREATED` | API (seam) |
| Load | TSP / sensors | (mirror) | `LOADING` → `LOADED` | API + fuel rise |
| Start trip | TSP | (mirror) | `EN_ROUTE` (truck `EN_ROUTE`) | API |
| Arrive | — | `ARRIVED` (mirror) | `ARRIVED` | **geofence** ENTER(STATION) < 100 m |
| Accept delivery | Client | (mirror) | delivered | **QR scan** (truck match + within 100 m) |
| Offload | sensors | — | `delivered_volume` captured | fuel drop |
| Return | — | `COMPLETED` when all trips done | `COMPLETE` (truck `IDLE`) | **geofence** ENTER(DEPOT) < 200 m |
| Delivery note | system | — | note generated | on offload complete |

The **seam** is "assign truck + driver" → `CreateTrip`. Everything below that row is the shared monitoring tail, already built (geofence, QR, fuel), now advancing the trip instead of the order.

---

## 6. Roles & permissions (module-gated)

Roles are the canonical five and do not change. Effective permission = `role grants action AND owning module is on`. For a Plan A workspace (`ordering: on`), all marketplace actions are live.

| Role | Plan A capabilities |
|---|---|
| `PLATFORM_ADMIN` | Onboard trucks, approve sensor integration (step 2), generate + **regenerate/revoke QR** (§8.2), workspace config. |
| `SELLER_MANAGER` | Accept orders, assign TSP, approve sensor integration (step 1), KYC review, fleet view. |
| `TRANSPORT_ADMIN` (TSP) | Assign trucks to orders, pick truck + driver (creates trip), manage trucks/drivers, fleet monitor. |
| `CLIENT` | Place orders, track, accept delivery by QR scan, view delivery notes/history. |
| `DRIVER` | Active delivery, present truck QR. |

The `AuthZ` middleware evaluates two gates on every request: the **module gate** (so turning `ordering` off later yields a Mode B workspace with no role edits) and the **KYC gate** (§7.1 — operational actions require the actor's KYC `APPROVED`). Effective permission = `role grants it AND module on AND KYC approved`.

---

## 7. Onboarding within Plan A

Reuses the built 2-step sensor integration; the shared prefix from the onboarding flow applies.

1. Platform Admin creates the workspace with `modules { ordering: on, monitoring: on }`.
2. Create users + assign roles (Seller Mgr, TSP/Transport Admin, Client, drivers).
3. Register fleet (trucks 4×9,100 L, drivers). *(Allowed while KYC pending — see §7.1.)*
4. Install + **calibrate** Galileosky sensors (calibration location — flespi vs Lambda — must be decided once; see risks).
5. **KYC approved** (§7.1) — the gate. Nothing operational binds to production until this passes.
6. 2-step sensor integration: TSP requests → Seller approves → Admin validates + integrates → `device_id` set, **versioned QR (`qr_version` 1, signed token) generated** (§8.2), truck `IDLE`, `INTEGRATION_ACTIVE`. *(Requires TSP KYC `APPROVED`.)*
7. Configure depot + station geofences (`DEPOT` 200 m, `STATION` ~100 m).
8. End-to-end test trip (see §11) → go live.

### 7.1 KYC workflow (two-tier, gates go-live)

KYC is not paperwork filing — it is the **gate that stands between a configured workspace and production operations.** A workspace can be set up while KYC is pending; it cannot *operate* until approved.

**Two tiers — both mandatory, different depth:**

| Party | Level | Collected |
|---|---|---|
| **TSP** (Transport Service Provider) | **Full KYC** | Company registration, commercial license, tax/VAT, authorized representative, fleet-ownership docs; insurance + driver verification optional |
| **Client** (fuel buyer) | **Business verification** | Company registration, VAT/tax number, business address, authorized contact, billing details |

TSP KYC verifies *operational* fitness (they run the trucks); Client KYC prevents *fake companies* placing orders or receiving deliveries. Neither participates in live operations unapproved.

**States (per party's KYC record):**

```
NOT_SUBMITTED → (upload docs) → PENDING_REVIEW
PENDING_REVIEW → APPROVED  |  REJECTED
REJECTED → (resubmit) → PENDING_REVIEW
APPROVED → (12 months) → EXPIRED        (renewal reminder at T-30 days)
EXPIRED → (renew) → PENDING_REVIEW
```

**Actors.** The party (TSP or Client) submits documents; the **Seller Manager** reviews and approves/rejects; **Platform Admin** sees KYC status as part of final sensor-integration validation. Rejection carries a reason; the party can resubmit.

**What KYC gates — operational actions, not just sensors.** While KYC is *not* `APPROVED`, the workspace can configure its profile, register trucks, and upload documents, but **cannot go live.** Specifically:

| Blocked until approved | Unlocked on approval |
|---|---|
| ❌ Accept customer orders (Mode A) | ✅ Order assignment |
| ❌ Receive ERP dispatches (Mode B) | ✅ Dispatch API |
| ❌ Activate live monitoring | ✅ Live GPS |
| ❌ Bind production sensors | ✅ Sensor binding |
| ❌ Confirm deliveries | ✅ Delivery confirmation |

This gate lives in the same `AuthZ` layer as the module switch: an operational action requires `role grants it AND module on AND actor's KYC = APPROVED`.

**Expiry — graceful, not a hard stop.** Approvals are valid **12 months**, with a renewal reminder at **T-30 days**. On expiry:

- **Historical data stays accessible** — past orders, trips, delivery notes are never locked.
- **Active trips run to completion** — an in-flight delivery is not interrupted mid-journey.
- **New operations block** — no new orders, no new dispatches, no new sensor activations until renewed.

So expiry degrades *new* capability without disrupting *in-progress* work or *past* records — the safe failure mode for a live logistics operation.

**Documents & audit.** KYC documents go to the existing **private S3 bucket with signed URLs** (never public); only Seller Manager + Platform Admin can retrieve them. Every decision (submit / approve / reject / renew) is an immutable audit record — who, when, decision, reason — same pattern as the QR audit trail (§8.2).

---

## 8. Key subsystems

**Ordering module** — the marketplace workflow (place / accept / assign TSP / KYC). Built; the one change is that the TSP "assign truck + driver" action now emits `CreateTrip` rather than driving physical order states itself.

**Trip module (new seam)** — owns the `CreateTrip` command and the physical state machine. In Plan A the command is fired by the ordering workflow; the trip carries `order_ref` back to the order so the listener can mirror progress.

**Monitoring (reused)** — the built location + geofence modules, re-pointed to advance the trip. No algorithm change; destination coords now come from the trip, `geofence_events` carries `trip_id`.

**Delivery proof (partly new)** — QR scan (raw `truck_id`, validated as truck-at-destination within 100 m) already gates delivery acceptance. New work: on offload-complete, compute `delivered_volume` per compartment from the fuel drop, compare against `expected_volume`, and generate the **delivery note** (`expected | loaded | delivered`, QR-confirmed flag, order ref, timestamps) to S3, exposed via signed URL.

### 8.1 QR delivery acceptance workflow (client-required)

This is a required flow, written out in full because delivery disputes live in its edge cases.

**Actors.** The **Driver** presents the truck's physical QR sticker. The **Client / receiver** scans it and confirms in their app; the authenticated API call is made under the `CLIENT` role. The driver never accepts on the client's behalf, and a leaked QR alone cannot self-confirm — the scan must come from an authenticated `CLIENT` on that order.

**QR payload — versioned token, not a raw id (decision).** The QR encodes a versioned, signed token (`truck_id.qr_version.<hmac>`), **not** the raw `truck_id` string. This consciously supersedes the older "raw `truck_id`" canonical choice, because a raw id can't carry a version and therefore can't defeat a *copied* QR — an old photographed sticker would validate forever. See §13 for the decision-log entry.

**Precondition — set by geofence, not by the scan.** The trip must already be `ARRIVED`: the geofence engine has emitted `ENTER(STATION) < 100 m`. The scan does **not** establish location — it confirms *identity* against a location the system already trusts. Geofence proves *a* truck is here; the QR proves it is *the* dispatched truck, on *its current* sticker.

**The call.** `POST /orders/{id}/accept-delivery { scannedToken }`

**Four gates — all must pass:**

| # | Gate | Check | Defeats |
|---|---|---|---|
| 1 | QR validity | token's `qr_version` == the truck's `ACTIVE` version in `qr_codes` (HMAC verifies) | a copied / revoked / old sticker |
| 2 | Assignment | the token's truck is the truck assigned to the active trip | a lookalike / wrong truck |
| 3 | Proximity | assigned truck's latest position ≤ configured radius (100–200 m) of destination | a truck that arrived, fired `ARRIVED`, then left |
| 4 | Recency | `truck_live_state.last_message_at` within the last 2–5 min | confirming against a **stale** position (the ghost-truck hole) |

Gate 4 is the one Plan A previously missed: on a 10–30 s cadence with store-and-forward, "within 100 m" is only trustworthy if the reading is fresh. Without recency, a truck can leave and its last-known position still reads "at destination."

**On all-pass:** record the acceptance (`accepted_at`, `accepted_by`, `scanned_qr_version`, `qr_confirmed = true`, distance-at-scan, telemetry-age) → trip flips to **delivered** → offload capture begins → `qr_confirmed` carries onto the delivery note. In Plan A the order mirrors to `DELIVERY_ACCEPTED`.

**Rejection paths — each returns a distinct, logged reason; never a silent failure:**

| Condition | Response |
|---|---|
| Token version ≠ active, HMAC fails, or QR revoked | `422` — "invalid or expired QR" |
| Scanned truck ≠ assigned truck | `422` — "wrong truck for this order" |
| Trip not yet `ARRIVED` | `409` — "truck has not arrived" |
| Truck now beyond proximity radius | `409` — "truck no longer at destination" |
| Latest telemetry older than the recency window | `409` — "truck position is stale — cannot confirm" |
| Trip already delivered | `200` — idempotent: return the existing acceptance, no new transition |
| Caller is not `CLIENT` for this workspace/order | `403` |

**Idempotency.** Acceptance is keyed on the trip. A repeated scan after delivery returns the original acceptance record (`200`), never re-accepting or re-generating the note — receivers double-tap, and a double-accept must be impossible.

**Why all signals are mandatory.** Geofence-without-QR can't tell a lookalike apart; QR-without-geofence can be scanned anywhere; a valid QR against a stale position confirms a ghost. Acceptance requires the geofence precondition **and** a current-version QR match **and** a fresh, in-range position.

### 8.2 QR lifecycle — versioning, regeneration, audit (client-required)

Each truck has exactly **one active QR at a time**, tracked by a monotonic `qr_version` in the `qr_codes` table (one `ACTIVE` row per truck, enforced by a partial unique index).

**Regeneration.** A `POST /trucks/{id}/regenerate-qr { reason }` action, available to `PLATFORM_ADMIN` (and optionally a workspace-scoped admin). It:

1. Marks the current `qr_codes` row `REVOKED`.
2. Inserts a new row with `version = prev + 1`, `status = ACTIVE`, a fresh signed token, `created_by`, `reason`, `created_at`.
3. Renders the new sticker (PNG to S3/CloudFront) for re-printing.

The moment the new version is active, **the previous QR is immediately invalid** — gate 1 rejects it. Only the latest version confirms deliveries.

**Use cases:** damaged/unreadable sticker, lost or removed sticker, security concern (QR copied/compromised), truck replacement or maintenance.

**Audit.** Every regeneration is an immutable audit record: who, when, reason, resulting version. The `qr_codes` table *is* the audit log — versions are never updated in place, only superseded, so the full history is reconstructable per truck.

**Mid-trip regeneration (edge case to decide).** If a truck is `EN_ROUTE` or `ARRIVED`, the receiver may be holding the *old* sticker. Two safe options — **pick one and make it product policy, don't leave it undefined:**
- **Block:** disallow regeneration while the truck has an active (non-delivered) trip; require completing or aborting the trip first. Simplest, safest.
- **Allow + notify:** permit it, but force a re-print and push a notification to the driver/receiver so the delivery uses the new sticker. More flexible, more moving parts.

Recommended default: **block during an active trip** unless the client has a concrete need for hot-swapping, because a mid-trip version bump is a live delivery-blocking event.

---

## 9. API surface (Plan A)

All under `workspaceId`, JWT-authed, RLS-scoped. Representative, not exhaustive.

| Endpoint | Role | Effect |
|---|---|---|
| `POST /orders` | CLIENT | create order → `PLACED` |
| `POST /orders/{id}/accept` | SELLER_MANAGER | → `ACCEPTED_BY_SELLER` |
| `POST /orders/{id}/assign-tsp` | SELLER_MANAGER | → `ASSIGNED_TO_TSP` |
| `POST /orders/{id}/assign-truck` | TRANSPORT_ADMIN | → `ASSIGNED`, **CreateTrip** |
| `POST /orders/{id}/start-loading` / `loaded` | TRANSPORT_ADMIN | trip `LOADING`/`LOADED` |
| `POST /orders/{id}/start-trip` | TRANSPORT_ADMIN | trip `EN_ROUTE` |
| `POST /orders/{id}/accept-delivery` | CLIENT | 4-gate QR scan (§8.1) → delivered |
| `POST /trucks/{id}/regenerate-qr` | PLATFORM_ADMIN | revoke current QR, issue next version (§8.2) |
| `POST /kyc/{party}/submit` | TSP / CLIENT | upload docs → `PENDING_REVIEW` (§7.1) |
| `POST /kyc/{id}/review` | SELLER_MANAGER | `APPROVED` / `REJECTED` (+reason) |
| `POST /kyc/{id}/renew` | TSP / CLIENT | resubmit an expiring/expired KYC → `PENDING_REVIEW` |
| `GET /orders/{id}` / `GET /orders/{id}/delivery-note` | CLIENT/SELLER/TSP | status + proof |
| `GET /trucks/{id}/current-position` | authorized roles | poll live position (backend-scoped, never flespi) |
| `POST /trucks` + sensor-integration endpoints | TSP/SELLER/ADMIN | 2-step integration |

Arrival, offload, and return are **not** API actions — they are geofence/sensor-driven, per the built design.

---

## 10. Multi-tenancy & security (reused)

`workspace_id` on every table + Postgres RLS (`SET app.workspace_id`). Cognito JWT carries `workspace_id` + roles; URL `workspaceId` validated against the token. flespi token, DB creds, JWT key in Secrets Manager — never in the browser. KYC in a private bucket + signed URLs; the QR sticker PNG is public via CloudFront but encodes a **signed, versioned token** (not a raw id), so a copied QR is defeated by version revocation (§8.2). The HMAC signing key lives in Secrets Manager. The browser never talks to flespi directly.

---

## 11. Testing strategy

- **Unit** — order/trip state transitions, geofence stateful ENTER/EXIT, delivery-note computation (expected vs delivered edge cases: exact, shortfall, overage).
- **Integration** — the ordering workflow through `CreateTrip`; geofence advancing the trip; order listener mirroring.
- **End-to-end via the sandbox simulator** — the simulator POSTs flespi-shaped batches to `/ingest/telemetry` to replay a full trip (load → geofence arrive → QR → offload → depot return), producing a real delivery note. This is the go/no-go gate and reuses the sandbox build already specced.
- **One physical acceptance trip** on a real instrumented truck before go-live — the only check that validates sensor calibration.

---

## 12. Milestones & acceptance criteria

| Milestone | Deliverable | Done when |
|---|---|---|
| **M1 — Module + KYC gates** | `tenant.modules` + `kyc_records` on workspace; AuthZ reads both; KYC submit/review/renew + expiry job | Operational actions blocked unless module on AND KYC `APPROVED`; expiry blocks new ops but not in-flight trips or history |
| **M2 — Trip seam** | `trips` + `trip_compartments`; `CreateTrip`; backfill in-flight orders | Every active order has a trip; ordering "assign truck" creates one |
| **M3 — Geofence re-point** | geofence advances trip; `geofence_events.trip_id`; order listener mirrors | A simulated trip reaches `ARRIVED`/`COMPLETE` with the order mirroring correctly |
| **M4 — QR versioning + 4-gate accept** | `qr_codes` table; signed-token QR; regenerate/revoke + audit; the 4 acceptance gates | Old QR rejected after regen; stale-position scan rejected; audit trail complete |
| **M5 — Delivery note** | offload capture + note generation to S3 | Note shows expected/loaded/delivered per compartment + QR-confirmed; retrievable via signed URL |
| **M6 — E2E + hardening** | sandbox simulator green; one physical trip | Full lifecycle passes end to end; physical trip produces a correct sensor-backed note |

M1–M3 are the load-bearing sequence; M4 delivers the client-required QR flow; M5 is the product's proof payoff; M6 is the gate.

---

## 13. Risks, decisions & open items

**Decision — QR payload format (supersedes canonical).** The QR encodes a **signed, versioned token** (`truck_id.qr_version.<hmac>`), not the raw `truck_id` string the built docs marked canonical. Reason: a raw id can't carry a version, so it cannot defeat a *copied* QR — one of the client's stated regeneration use cases. This is a conscious supersede, logged here so the change from the as-built decision is explicit, not silent drift.

**Open items:**

- **Proximity + recency thresholds** — confirm the radius (100–200 m) and the telemetry-recency window (2–5 min) with the client. Too tight blocks legitimate deliveries on a flaky reading; too loose reopens the ghost-truck hole. These are product settings, not hardcoded constants.
- **Mid-trip QR regeneration policy** — block during an active trip (recommended) vs allow + notify (§8.2). Undefined behavior here is a live delivery-blocking bug; pick one.
- **Calibration location** (flespi calculators vs in-Lambda `fuel_sensors.calibration_table`) — decide once; double-applying corrupts `delivered_volume` and silently poisons every delivery note. Highest-impact open item.
- **flespi webhook retry/buffer guarantees** — the reliability story depends on store-and-forward; confirm against current flespi docs before relying on it for delivery-critical events.
- **Geofence re-point migration** — M3 is the only real cutover; dual-write `order_id`/`trip_id` and keep a rollback until `trip_id` is authoritative in reporting.
- **Multi-truck orders** — an order with several assignments produces several trips; `order → COMPLETED` must wait for all trips `COMPLETE`. Cover explicitly in M3 tests.
- **Telemetry retention** — pick the window (30/60/90 d) + downsample target; note the proof (`geofence_events`, `delivery_notes`, `qr_codes`) is retained indefinitely, raw telemetry is not.

---

## 14. Definition of done

A Plan A workspace can take an order from `PLACED` to `COMPLETED` where arrival, delivery, and return are driven by real geofence + sensor events (no timers); every completed order has a QR-confirmed delivery note comparing expected vs delivered fuel per compartment; the ingestion path is unchanged; and flipping `ordering` off would cleanly yield a Mode B workspace with no role or code edits — proving the two products are one engine.
