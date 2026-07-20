package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/anptco/core-api/internal/domain"
	"github.com/anptco/core-api/internal/repository"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type orderRepo struct{ db *sqlx.DB }

func NewOrderRepository(db *sqlx.DB) repository.OrderRepository {
	return &orderRepo{db: db}
}

const orderCols = `id, workspace_id, client_workspace_id, status,
		destination_station_id, transporter_id, volume_liters, fuel_type,
		created_at, updated_at`

func (r *orderRepo) List(ctx context.Context, workspaceID uuid.UUID, activeOnly bool) ([]*domain.Order, error) {
	q := `SELECT ` + orderCols + ` FROM orders WHERE workspace_id = $1`
	if activeOnly {
		q += ` AND status != 'COMPLETED'`
	}
	q += ` ORDER BY created_at DESC LIMIT 200`

	var orders []*domain.Order
	if err := r.db.SelectContext(ctx, &orders, q, workspaceID); err != nil {
		return nil, fmt.Errorf("orders: list: %w", err)
	}
	return orders, nil
}

func (r *orderRepo) ListByClient(ctx context.Context, clientWorkspaceID uuid.UUID, activeOnly bool) ([]*domain.Order, error) {
	q := `SELECT ` + orderCols + ` FROM orders WHERE client_workspace_id = $1`
	if activeOnly {
		q += ` AND status != 'COMPLETED'`
	}
	q += ` ORDER BY created_at DESC LIMIT 200`

	var orders []*domain.Order
	if err := r.db.SelectContext(ctx, &orders, q, clientWorkspaceID); err != nil {
		return nil, fmt.Errorf("orders: list by client: %w", err)
	}
	return orders, nil
}

func (r *orderRepo) ListByTransporter(ctx context.Context, transporterID string, activeOnly bool) ([]*domain.Order, error) {
	q := `SELECT ` + orderCols + ` FROM orders WHERE transporter_id = $1`
	if activeOnly {
		q += ` AND status != 'COMPLETED'`
	}
	q += ` ORDER BY created_at DESC LIMIT 200`
	var orders []*domain.Order
	if err := r.db.SelectContext(ctx, &orders, q, transporterID); err != nil {
		return nil, fmt.Errorf("orders: list by transporter: %w", err)
	}
	return orders, nil
}

func (r *orderRepo) GetByTransporter(ctx context.Context, id uuid.UUID, transporterID string) (*domain.Order, error) {
	const q = `SELECT ` + orderCols + ` FROM orders WHERE id = $1 AND transporter_id = $2`
	var o domain.Order
	if err := r.db.GetContext(ctx, &o, q, id, transporterID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("orders: get by transporter %s: %w", id, err)
	}
	return &o, nil
}

func (r *orderRepo) GetByID(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID) (*domain.Order, error) {
	q := `SELECT ` + orderCols + ` FROM orders WHERE id = $1 AND workspace_id = $2`

	var o domain.Order
	if err := r.db.GetContext(ctx, &o, q, id, workspaceID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("orders: get %s: %w", id, err)
	}
	return &o, nil
}

func (r *orderRepo) GetByIDRaw(ctx context.Context, id uuid.UUID) (*domain.Order, error) {
	q := `SELECT ` + orderCols + ` FROM orders WHERE id = $1`
	var o domain.Order
	if err := r.db.GetContext(ctx, &o, q, id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("orders: get raw %s: %w", id, err)
	}
	return &o, nil
}

func (r *orderRepo) Create(ctx context.Context, o *domain.Order) error {
	const q = `
		INSERT INTO orders
		  (id, workspace_id, client_workspace_id, status,
		   destination_station_id, volume_liters, fuel_type)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`
	if _, err := r.db.ExecContext(ctx, q,
		o.ID, o.WorkspaceID, o.ClientWorkspaceID, o.Status,
		o.DestinationStationID, o.VolumeLiters, o.FuelType,
	); err != nil {
		return fmt.Errorf("orders: create: %w", err)
	}
	return nil
}

func (r *orderRepo) AdvanceStatusByTransporter(ctx context.Context, id uuid.UUID, transporterID string, from, to domain.OrderStatus) error {
	const q = `
		UPDATE orders
		SET    status = $1, updated_at = now()
		WHERE  id = $2 AND transporter_id = $3 AND status = $4`
	result, err := r.db.ExecContext(ctx, q, to, id, transporterID, from)
	if err != nil {
		return fmt.Errorf("orders: advance by transporter: %w", err)
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return repository.ErrWrongStatus
	}
	return nil
}

func (r *orderRepo) AssignTruck(ctx context.Context, a *domain.OrderAssignment) error {
	const q = `
		INSERT INTO order_assignments (id, order_id, truck_id, status)
		VALUES ($1, $2, $3, $4)`
	if _, err := r.db.ExecContext(ctx, q, a.ID, a.OrderID, a.TruckID, a.Status); err != nil {
		return fmt.Errorf("orders: assign truck: %w", err)
	}
	return nil
}

func (r *orderRepo) AdvanceStatus(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID, from, to domain.OrderStatus) error {
	const q = `
		UPDATE orders
		SET    status = $1, updated_at = now()
		WHERE  id = $2 AND workspace_id = $3 AND status = $4`

	result, err := r.db.ExecContext(ctx, q, to, id, workspaceID, from)
	if err != nil {
		return fmt.Errorf("orders: advance status: %w", err)
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return repository.ErrWrongStatus
	}
	return nil
}

func (r *orderRepo) AssignTransporter(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID, transporterID string) error {
	const q = `
		UPDATE orders
		SET    status = 'ASSIGNED_TO_TSP', transporter_id = $1, updated_at = now()
		WHERE  id = $2 AND workspace_id = $3 AND status = 'ACCEPTED_BY_SELLER'`

	result, err := r.db.ExecContext(ctx, q, transporterID, id, workspaceID)
	if err != nil {
		return fmt.Errorf("orders: assign transporter: %w", err)
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return repository.ErrWrongStatus
	}
	return nil
}

func (r *orderRepo) GetTruckForOrder(ctx context.Context, orderID uuid.UUID) (uuid.UUID, error) {
	var truckID uuid.UUID
	const q = `SELECT truck_id FROM order_assignments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`
	if err := r.db.GetContext(ctx, &truckID, q, orderID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return uuid.UUID{}, nil
		}
		return uuid.UUID{}, fmt.Errorf("orders: get truck for order %s: %w", orderID, err)
	}
	return truckID, nil
}

func (r *orderRepo) UpdateStatus(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID, status domain.OrderStatus) error {
	const q = `
		UPDATE orders
		SET    status = $1, updated_at = now()
		WHERE  id = $2 AND workspace_id = $3`

	result, err := r.db.ExecContext(ctx, q, status, id, workspaceID)
	if err != nil {
		return fmt.Errorf("orders: update status: %w", err)
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return fmt.Errorf("orders: %s not found in workspace", id)
	}
	return nil
}
