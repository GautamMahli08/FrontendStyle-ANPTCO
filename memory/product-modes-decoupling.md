---
name: product-modes-decoupling
description: Plan to decouple ordering from monitoring so the platform serves full (order+monitor) and monitoring-only clients
metadata:
  type: project
---

The platform is being split into two products from one codebase, driven by a per-client `modules` switch (Ordering on/off; Monitoring always on; Dispatch API on for monitoring-only).

**Core decoupling:** separate the commercial **Order** from the physical **Trip**. Monitoring runs only on the Trip. A Trip is created either by an Order (full product) or by a client's own ordering system via a **dispatch API** (`POST /trucks/{id}/dispatch` with orderRef, origin, destination, expected fuel per compartment, driver). The truck must already exist in our DB (its Galileosky sensors + QR are onboarded by us).

**Roles stay exactly as they are** (PLATFORM_ADMIN, SELLER_MANAGER, TRANSPORT_ADMIN, CLIENT, DRIVER) — the user explicitly loves them. Monitoring-only just hides marketplace screens (place order, accept/assign, KYC); the same roles keep their monitoring + QR-delivery capabilities.

**Delivery proof** (QR scan + delivery note showing expected vs loaded vs delivered fuel per compartment) is shared by both products and largely already built.

**Why:** a client already has their own ordering system and wants only fleet monitoring + delivery notes; other clients may want the full thing. **How to apply:** don't fork the codebase; build Trip + dispatch API + manual-create-trip screen as additive work. Full stakeholder doc: docs/PRODUCT_MODES.md. Current monitoring is tightly coupled to the Order entity — see [[fleet-monitor-order-coupling]].
