---
name: fleet-monitor-order-coupling
description: Fleet monitoring is currently tightly coupled to the Order entity (the monitored unit IS the order)
metadata:
  type: reference
---

In the current dashboard, fleet monitoring is keyed entirely off the `Order` entity, not the truck. `FleetMonitorView` loads `getOrders()`; `TruckFocusPanel` derives the map/journey from `order.tripStartedAt` + `destinationCoords(order)`; `CompartmentFuel` computes fuel via `orderFuelTelemetry(order, now)`; the timeline is `OrderTimeline order={order}`. A truck with no active order just shows "Idle at depot." The mixed `OrderStatus` enum jams commercial states (PLACED, ACCEPTED_BY_SELLER, ASSIGNED_TO_TSP) together with physical states (LOADING, EN_ROUTE, ARRIVED, OFFLOADING) — that fusion is the coupling.

This is the thing the decoupling plan [[product-modes-decoupling]] addresses by introducing a Trip entity the monitoring UI consumes instead of Order.
