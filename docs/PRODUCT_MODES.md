# Fuel Platform — Two Products, One Engine

**Audience:** stakeholders & product.
**Purpose:** explain how the same platform serves clients who want the **full ordering + monitoring** system *and* clients who want **monitoring only** (they already run their own ordering system) — without forking the product, and **without changing the roles we already have**.

---

## 1. The idea in one line

> We split "the commercial order" from "the physical trip." Monitoring runs on the **trip**. Ordering, when a client wants it, simply **feeds** trips. When a client doesn't want it, trips come in over an **API** from their own system instead.

One engine. One set of roles. A switch decides whether the ordering workflow is turned on.

---

## 2. The key concept: Order vs Trip

Today these two ideas are fused into a single thing. We separate them:

| | **Order** (commercial) | **Trip** (physical) |
|---|---|---|
| Answers | *Who is buying, from whom, accepted, assigned* | *Which truck, which driver, load what, drive where, prove delivery* |
| Owns | marketplace workflow, pricing, approvals | route, fuel sensors, geofence, QR, delivery note |
| Required for monitoring? | **No — optional** | **Yes — always** |

**Monitoring only ever needs a Trip.** A Trip can be born two ways:

```
   FULL PRODUCT                          MONITORING-ONLY
   Order placed in our system            Client's own ordering system
            │                                      │
            │  (we create the trip)                │  POST /dispatch  (they send order info)
            ▼                                      ▼
          ┌──────────────────────────────────────────┐
          │                  TRIP                      │
          │   truck · driver · origin · destination    │
          │   expected fuel per compartment · order#   │
          └──────────────────────────────────────────┘
                              │
                              ▼
              ┌──────────────────────────────┐
              │       MONITORING ENGINE        │
              │  track · fuel · geofence ·     │
              │  QR delivery · delivery note   │
              └──────────────────────────────┘
```

The monitoring engine never knows or cares which door the trip came through.

---

## 3. Two products, one platform

A per-client switch (`modules`) decides which capabilities are on:

| Module | Full product | Monitoring-only |
|---|---|---|
| **Monitoring** (track, fuel, geofence, QR, delivery note) | ✅ on | ✅ on |
| **Ordering** (place order, accept, assign to transporter, KYC) | ✅ on | ⬚ off |
| **Dispatch API** (receive trips from client's system) | optional | ✅ on |

Same codebase. Same database. Same screens. We are **not** building a second product — we are turning one workflow off and opening one API.

---

## 4. Roles — unchanged

**We keep the exact roles we have.** Nothing about the role model changes. What changes is only *which menu items light up*, based on the module switch.

| Role | Full product (Order + Monitor) | Monitoring-only |
|---|---|---|
| **Platform Admin** *(us)* | Onboard trucks, integrate sensors, generate QR | **Same** — every truck must be in our system regardless |
| **Transport Admin** *(fleet operator)* | Assign trucks to orders, **Fleet Monitor**, manage trucks & drivers | **Fleet Monitor**, manage trucks & drivers, see incoming dispatches *(no marketplace assignment step)* |
| **Driver** | Active delivery, present truck QR | **Same** |
| **Client** *(receiver)* | Place orders, track, **accept delivery by QR scan** | **Accept delivery by QR scan**, view delivery notes & history *(no "place order")* |
| **Seller Manager** | Accept orders, assign transporter, KYC review, fleet view | Not used in pure monitoring *(no selling involved)* |

**Read this as:** the marketplace actions (place order, accept & assign, KYC) belong to the *Ordering* module. Switch that module off and the same roles simply keep the monitoring + delivery capabilities they already have. No new roles, no renamed roles.

---

## 5. How the flow works

### Shared tail (identical in both products)
Once a Trip exists, the journey is the same:

```
LOAD at origin  →  EN ROUTE  →  ARRIVE (geofence)  →  QR SCAN at delivery
   →  OFFLOAD  →  RETURN  →  DELIVERY NOTE generated
```

- **Load / offload** tracked by the truck's fuel sensors.
- **Arrive / return** detected automatically by geofence (no manual timers).
- **QR scan** confirms the right truck is at the right place before delivery is accepted.

### Full product — the front half
```
Client places order → Seller accepts → assigns Transporter →
Transporter picks truck + driver → [Trip created] → shared tail
```

### Monitoring-only — the front half
```
Client's own system dispatches a load → POST /dispatch to us →
[Trip created, attached to a known truck] → shared tail
```

Same back half. Only the way a trip is *created* differs.

---

## 6. Where the order info comes from (Monitoring-only)

The client's system tells us, per load, the minimum needed to monitor and prove the delivery:

```jsonc
POST /trucks/{truckId}/dispatch
{
  "orderRef":     "SO-48817",              // their order number — appears on the delivery note
  "origin":       { "name": "Depot",     "lat": 23.6702, "lng": 58.1891 },
  "destination":  { "name": "Station A", "lat": 23.6127, "lng": 58.4986 },
  "compartments": [                         // EXPECTED load — what each compartment SHOULD hold
    { "index": 1, "fuelType": "DIESEL", "expectedVolume": 9100 },
    { "index": 2, "fuelType": "DIESEL", "expectedVolume": 9100 }
  ],
  "driver": "Ahmed K."                      // optional
}
```

Two non-negotiables:

1. **The truck must already exist in our system** — its Galileosky sensors and QR are set up by us during onboarding. The dispatch just *attaches an order to a known truck*.
2. **`expectedVolume` is the promise.** Our sensors measure the *actual*. The gap between the two is the proof of delivery.

*(Optionally, we push delivery status back to their system when the trip completes, so their order closes automatically. Decided per client.)*

---

## 7. Delivery proof: QR scan + delivery note

This is what every monitoring client is buying, and it's identical across both products:

1. **Truck arrives** at the destination → geofence unlocks delivery.
2. **Receiver scans the truck's QR** → confirms it is the correct, dispatched truck (not a lookalike), at the correct location.
3. System **captures the fuel reading per compartment** at hand-over and after offload.
4. A **delivery note** is generated automatically, showing per compartment:

   | Compartment | Fuel | Expected | Loaded | Delivered |
   |---|---|---|---|---|
   | 1 | Diesel | 9,100 L | 9,100 L | 9,080 L |
   | 2 | Diesel | 9,100 L | 9,100 L | 9,095 L |

   *Plus:* order reference, truck, driver, destination, timestamps, QR-confirmed flag.

That table is the answer to *"did these compartments actually carry the fuel they were supposed to?"* — backed by sensor data, not paperwork.

---

## 8. Why this is low-risk (the stakeholder summary)

- **One product, not two.** A switch turns the ordering workflow on or off. We maintain a single codebase.
- **Roles are untouched.** The roles we have keep working exactly as they do; monitoring-only just hides the marketplace screens.
- **The hard part already exists.** Sensors, geofence, QR delivery, and the delivery note are built. Monitoring-only reuses all of it.
- **New work is small and additive:** (a) separate "Trip" from "Order" internally, (b) add a dispatch API, (c) a screen to create a trip manually for clients with no API. None of it disturbs existing clients.
- **Stronger sales story for monitoring-only:** we don't compete with the client's ordering system — we sit underneath it as the **delivery-execution and proof layer** (live tracking + verified delivery note).

---

## 9. Glossary

- **Trip** — one truck's monitored journey for one load. The unit monitoring runs on.
- **Dispatch** — the API call from a client's own system that creates a Trip (monitoring-only).
- **Order** — the commercial transaction in our full product. Optional; when present, it creates a Trip.
- **Module switch** — per-client setting that turns the Ordering workflow on or off.
- **Delivery note** — auto-generated proof of delivery: expected vs. loaded vs. delivered fuel per compartment, QR-confirmed.
