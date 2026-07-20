package postgres

import (
	"context"
	"fmt"

	"github.com/anptco/location-geofence-service/internal/repository"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type tripRepository struct {
	db *sqlx.DB
}

// NewTripRepository returns a repository.TripRepository backed by pool.
func NewTripRepository(pool *sqlx.DB) repository.TripRepository {
	return &tripRepository{db: pool}
}

func (r *tripRepository) AdvanceToArrived(ctx context.Context, tripID uuid.UUID) error {
	q := fromCtx(ctx, r.db)

	// Advance the trip itself.
	const qTrip = `
		UPDATE trips SET status = 'ARRIVED', updated_at = now()
		WHERE  id = $1 AND status = 'EN_ROUTE'`
	if _, err := q.ExecContext(ctx, qTrip, tripID); err != nil {
		return fmt.Errorf("trip: advance %s to ARRIVED: %w", tripID, err)
	}

	// Phase 1 backward-compat: also advance the linked order so Mode A clients
	// see the correct status on their orders.
	const qOrder = `
		UPDATE orders SET status = 'ARRIVED', updated_at = now()
		WHERE  id = (SELECT order_id FROM trips WHERE id = $1 AND order_id IS NOT NULL)
		  AND  status = 'EN_ROUTE'`
	if _, err := q.ExecContext(ctx, qOrder, tripID); err != nil {
		return fmt.Errorf("trip: advance order for trip %s to ARRIVED: %w", tripID, err)
	}
	return nil
}

func (r *tripRepository) CompleteAssignment(ctx context.Context, assignmentID *uuid.UUID, truckID uuid.UUID) error {
	q := fromCtx(ctx, r.db)

	// Complete the order_assignment row for Mode A trips.
	if assignmentID != nil {
		const qAssignment = `
			UPDATE order_assignments SET status = 'JOURNEY_COMPLETE', updated_at = now()
			WHERE  id = $1`
		if _, err := q.ExecContext(ctx, qAssignment, *assignmentID); err != nil {
			return fmt.Errorf("trip: complete assignment %s: %w", *assignmentID, err)
		}
	}

	// Set the truck IDLE regardless of mode.
	const qTruck = `UPDATE trucks SET status = 'IDLE', updated_at = now() WHERE id = $1`
	if _, err := q.ExecContext(ctx, qTruck, truckID); err != nil {
		return fmt.Errorf("trip: set truck %s idle: %w", truckID, err)
	}
	return nil
}

func (r *tripRepository) TryComplete(ctx context.Context, tripID uuid.UUID, orderID *uuid.UUID) (bool, error) {
	q := fromCtx(ctx, r.db)

	// Complete the trip unconditionally (it is the single unit; there is no
	// "multiple assignments per trip" concept).
	const qTrip = `
		UPDATE trips SET status = 'COMPLETED', updated_at = now()
		WHERE  id = $1 AND status = 'DELIVERY_ACCEPTED'`
	result, err := q.ExecContext(ctx, qTrip, tripID)
	if err != nil {
		return false, fmt.Errorf("trip: complete %s: %w", tripID, err)
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return false, nil
	}

	// Phase 1 backward-compat: also complete the linked order when all its
	// assignments are done (same guard as before — NOT EXISTS subquery).
	if orderID != nil {
		const qOrder = `
			UPDATE orders SET status = 'COMPLETED', updated_at = now()
			WHERE  id     = $1
			  AND  status != 'COMPLETED'
			  AND  NOT EXISTS (
				  SELECT 1 FROM order_assignments
				  WHERE  order_id = $1 AND status != 'JOURNEY_COMPLETE'
			  )`
		if _, err := q.ExecContext(ctx, qOrder, *orderID); err != nil {
			// Non-fatal: the trip is already complete; failing to complete the
			// order is bad but should not roll back the transaction.
			return true, fmt.Errorf("trip: complete order for trip %s: %w", tripID, err)
		}
	}

	return true, nil
}
