# Fuel Platform — Sandbox / Integration-Testing Build Guide

**Goal:** let an incoming Mode B company integrate their ERP against the platform's dispatch API and see a real delivery note **before** they touch production — while keeping all sandbox-only code in one isolated folder so that going to the real company later is a single, visible change.

---

## 1. The one rule that makes this work

> **Share the tested code path. Isolate only what must never run in production.**

The incoming company must call the **same** `POST /trucks/{id}/dispatch` endpoint, hit the **same** validation, create the **same** `Trip`, and run through the **same** monitoring engine that production uses. Only the tenant flag and the API-key scope differ. If any of that is duplicated into a demo folder, the sandbox stops proving anything about production.

So the folder split is **not** "sandbox vs production business logic." It is:

| Category | Where it lives | Runs in prod? |
|---|---|---|
| Dispatch endpoint, validation, Trip, monitoring, delivery note | shared core modules | ✅ yes — same code for real + sandbox tenants |
| **Telemetry simulator** (fake GPS + fuel packets) | `sandbox/` | ❌ never |
| **Seeders / fixtures** (test truck, QR, sandbox key) | `sandbox/` | ❌ never |
| **Reset / teardown / TTL cleanup** | `sandbox/` | ❌ never |
| **Sandbox-only routes** (trigger sim, reset) | `sandbox/` | ❌ never |

A sandbox tenant is just a normal **workspace** with `modules { ordering: off, dispatchApi: on }` and an `is_sandbox: true` flag. The **data** is isolated by that flag plus the existing Postgres RLS on `workspace_id`; the **code** that processes it is shared.

---

## 2. Folder structure

```
src/
  modules/                      # SHARED production code — used by real AND sandbox tenants
    identity/                   # tenants, users, roles, module switch, is_sandbox flag
    fleet/                      # trucks, drivers, QR provisioning, sensor binding
    trip/                       # Trip aggregate + CreateTrip handler (the seam)
    ordering/                   # Mode A marketplace (gated off for Mode B)
    dispatch/                   # POST /trucks/{id}/dispatch — the REAL contract
    monitoring/                 # geofence (Haversine, stateful), trip state machine
    ingest-telemetry/           # the flespi webhook Lambda — POST /ingest/telemetry
    delivery-proof/             # QR verify, delivery note generation
    integration/                # outbound status webhooks

  sandbox/                      # ISOLATED — sandbox/demo ONLY, excluded from prod build
    telemetry-simulator/        # POSTs flespi-shaped batches to /ingest/telemetry
    seeders/                    # provision sandbox workspace, test truck, QR, sandbox key
    reset/                      # teardown + TTL cleanup for sandbox workspaces
    sandbox.routes.ts           # sandbox-only endpoints (run trip sim, reset tenant)
    sandbox.guard.ts            # 404s everything here unless SANDBOX_ENABLED=true
    sandbox.module.ts           # the single wire-in point

  main.ts                       # mounts sandbox.module ONLY when SANDBOX_ENABLED=true
```

**The dependency rule (this is the whole trick):**

```
sandbox/  ───imports──▶  modules/        ✅ allowed
modules/  ───imports──▶  sandbox/        ❌ FORBIDDEN — fail the build
```

`sandbox/` calls into the real pipeline (the simulator POSTs to the real `ingest-telemetry` webhook endpoint). But nothing under `modules/` may ever reference anything under `sandbox/`. That one-way arrow is what guarantees the production code is untouched by the sandbox and the diff at go-live is trivial.

Enforce it automatically, not by discipline — add an import-boundary check to CI (e.g. `dependency-cruiser`, `eslint-plugin-boundaries`, ArchUnit, or a Go build-tag) that **fails the build** if `modules/` imports from `sandbox/`.

---

## 3. The isolation switch

Three layers, so demo code can't leak into production even by accident:

1. **Runtime flag** — `SANDBOX_ENABLED` (default `false`). `main.ts` registers `SandboxModule` only when true. In production it's never set, so the sandbox routes, simulator, and seeders are not wired in at all.
2. **Build exclusion** — exclude `src/sandbox/**` from the production build target (tsconfig `exclude`, a separate build profile, or a `//go:build sandbox` tag). Demo code isn't even shipped in the prod artifact.
3. **CI boundary check** — the import rule above. A stray `import` from core into sandbox breaks the pipeline.

**Why this satisfies "we can see the change later":** going from sandbox-capable to a clean production company is literally:

```
SANDBOX_ENABLED = false        (or: build without the sandbox profile)
```

Nothing in `modules/` changes. The diff is one flag / one build flag, and the entire sandbox surface is a self-contained folder you can point at and say "none of this ships."

---

## 4. The telemetry simulator (the make-or-break piece)

Sandbox trucks have **no real Galileosky devices publishing through flespi**, so with nothing else they produce no fuel readings, no geofence crossings, no load/offload events — and therefore **no delivery note**, which is the one artifact the company came to see. The simulator fills that gap by impersonating flespi.

Requirements, anchored to the as-built ingestion path:

- **Emits the real flespi webhook payload.** The simulator POSTs **batched, flespi-stream-shaped messages** (`device_id`, `timestamp`, `position.latitude/longitude/speed`, per-compartment sensor channels, `ignition`) to the real endpoint **`POST /ingest/telemetry`**, carrying the `FLESPI_WEBHOOK_SECRET` header exactly as flespi would. It uses the sandbox truck's `galileosky_device_id` so the Lambda's `device_id → truck_id` lookup resolves normally.
- **Goes through the real Ingestion Lambda.** It does **not** short-circuit into the geofence module or fabricate a delivery note. Same endpoint, same `device→truck` lookup, same `truck_telemetry` insert, same `truck_live_state` upsert, same Haversine geofence eval, same event emission. If it doesn't flow through that Lambda, the test proves nothing.
- **Replays a scripted trip against a live trip record.** Given an active sandbox trip (see §6), it emits a timed sequence honoring device timestamps: at origin → fuel level for LOAD → positions en route → a reading **inside the destination radius** (triggering `ENTER(STATION)` ⇒ trip `ARRIVED`) → a post-scan fuel drop for OFFLOAD → a reading **inside the depot radius** (`ENTER(DEPOT)` ⇒ trip `COMPLETE`, truck `IDLE`). The stateful geofence reacts exactly as it would to real hardware.
- **Configurable outcomes.** Let the caller script the delivered per-compartment volume so the company sees both a clean delivery and a shortfall — proving the `expected_volume` vs `delivered_volume` gap actually surfaces on the note.
- **Respects the reliability contract.** Since `/ingest/telemetry` only returns 2xx after successful handling, the simulator should treat non-2xx as a real failure and retry, the same way flespi's store-and-forward would — so the sandbox exercises the same ordering/idempotency guarantees as production.
- **Triggered by a sandbox route** — e.g. `POST /sandbox/trips/{id}/simulate` (gated by `sandbox.guard`), returning once the delivery note is generated.

This is the component that lets the sandbox demonstrate a completed, sensor-backed delivery note without waiting on a physical truck — while running through the identical flespi → Lambda → geofence path production uses.

---

## 5. Build sequence

Order matters — the "truck must exist" rule means the company can't dispatch until you've provisioned a truck for them.

1. **Add the `is_sandbox` flag** to the workspace model; make sure `modules` already drives endpoint mounting and permissions (from the core architecture).
2. **Build the shared dispatch endpoint to production quality** — validation, `truckId` existence check, **idempotency on `(workspace, orderRef)`**, correct error codes (404 unknown truck, 409 duplicate). This is the contract the company integrates against; it lives in `modules/dispatch`, not in sandbox.
3. **Create the `sandbox/` folder and its module**, wired behind `SANDBOX_ENABLED`.
4. **Write the seeders** — provision a sandbox workspace (`ordering: off, dispatchApi: on, is_sandbox: true`), one or more test trucks with a `galileosky_device_id`, raw-`truck_id` QR, and a **sandbox-scoped API key** that cannot reach production data.
5. **Build the telemetry simulator** and its trigger route (section 4).
6. **Write reset/teardown** — wipe a sandbox tenant's trips/telemetry, or expire it on a TTL, so sandboxes don't accumulate.
7. **Add the CI import-boundary check** so `modules/ → sandbox/` can never compile.
8. **Filter `is_sandbox` out of billing and analytics** so test trips never pollute real numbers.

---

## 6. The onboarding path this enables

For an incoming Mode B company:

```
Create sandbox tenant (ordering off, dispatch on, is_sandbox=true)
        │
        ▼
Seed test truck(s) + QR + bound virtual device
        │
        ▼
Issue sandbox-scoped API key + share dispatch docs
        │
        ▼
Company's ERP integrates → POST /trucks/{id}/dispatch  (real endpoint)
        │
        ▼
Run telemetry simulator on the created trip
   → LOAD → geofence → QR scan → OFFLOAD → delivery note
        │
        ▼
Company reviews the delivery note (expected vs measured)
        │
        ▼
ONE physical acceptance trip on a real instrumented truck
        │
        ▼
Provision CLEAN production tenant (carry over validated config)
        │
        ▼
Go live
```

Two test phases prove different things: the **simulated** run proves the *integration contract* (dispatch accepted, idempotency holds, note generated); the **one physical** run proves *hardware + sensor calibration*, which no simulator can validate.

---

## 7. Graduation: sandbox → production

Do **not** flip the sandbox tenant to live. Provision a **separate, clean production tenant** and carry over the config the sandbox validated (trucks, module switch, webhook settings, a fresh production-scoped API key). Reasons:

- Keeps simulated test trips out of the real company's billing and delivery history.
- The sandbox stays available for the company's future ERP changes and regression testing.
- Sandbox and production API keys stay cleanly scoped — a sandbox key can never touch production, and vice versa.

---

## 8. Guardrails checklist

- [ ] `sandbox/` excluded from the production build artifact.
- [ ] `SANDBOX_ENABLED` defaults to `false`; unset in all production environments.
- [ ] CI fails if any `modules/` file imports from `sandbox/`.
- [ ] Sandbox API keys are scoped so they physically cannot reach production data.
- [ ] Simulator POSTs flespi-shaped batches to the real `/ingest/telemetry` — it never fabricates a delivery note directly.
- [ ] `is_sandbox` tenants filtered out of billing and analytics.
- [ ] Sandbox tenants have a reset path or TTL so they don't accumulate.
- [ ] The dispatch endpoint, validation, and idempotency live in `modules/dispatch`, shared with production — never duplicated in `sandbox/`.

---

## 9. One-line summary

Production logic is shared so the test is real; only the simulator, seeders, and reset live in an isolated `sandbox/` folder with a one-way dependency and a single feature flag — so moving a validated integration to a real production company is a clean, visible, one-flag change.
