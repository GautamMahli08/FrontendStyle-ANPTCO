package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/anptco/core-api/internal/domain"
	"github.com/anptco/core-api/internal/repository"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type onboardingRepo struct{ db *sqlx.DB }

func NewOnboardingRepository(db *sqlx.DB) repository.OnboardingRepository {
	return &onboardingRepo{db: db}
}

// ─── Seller connections ───────────────────────────────────────────────────────

func (r *onboardingRepo) CreateConnection(ctx context.Context, c *domain.SellerConnection) error {
	const q = `
		INSERT INTO seller_connections
			(id, workspace_id, transporter_id, seller_code, status)
		VALUES ($1, $2, $3, $4, 'PENDING')`
	if _, err := r.db.ExecContext(ctx, q, c.ID, c.WorkspaceID, c.TransporterID, c.SellerCode); err != nil {
		return fmt.Errorf("connections: create: %w", err)
	}
	return nil
}

func (r *onboardingRepo) ListConnections(ctx context.Context, workspaceID uuid.UUID) ([]*domain.SellerConnection, error) {
	const q = `
		SELECT id, workspace_id, transporter_id, seller_code, status,
		       requested_at, resolved_at, resolved_by
		FROM   seller_connections
		WHERE  workspace_id = $1
		ORDER  BY requested_at DESC`
	var rows []*domain.SellerConnection
	if err := r.db.SelectContext(ctx, &rows, q, workspaceID); err != nil {
		return nil, fmt.Errorf("connections: list: %w", err)
	}
	return rows, nil
}

func (r *onboardingRepo) GetConnectionByID(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID) (*domain.SellerConnection, error) {
	const q = `
		SELECT id, workspace_id, transporter_id, seller_code, status,
		       requested_at, resolved_at, resolved_by
		FROM   seller_connections
		WHERE  id = $1 AND workspace_id = $2`
	var c domain.SellerConnection
	if err := r.db.GetContext(ctx, &c, q, id, workspaceID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("connections: get %s: %w", id, err)
	}
	return &c, nil
}

func (r *onboardingRepo) ResolveConnection(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID, status string, resolvedBy string) error {
	const q = `
		UPDATE seller_connections
		SET    status = $1, resolved_by = $2, resolved_at = now()
		WHERE  id = $3 AND workspace_id = $4 AND status = 'PENDING'`
	res, err := r.db.ExecContext(ctx, q, status, resolvedBy, id, workspaceID)
	if err != nil {
		return fmt.Errorf("connections: resolve: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("connections: %s not found or already resolved", id)
	}
	return nil
}

func (r *onboardingRepo) GetWorkspaceBySellerCode(ctx context.Context, code string) (uuid.UUID, error) {
	const q = `SELECT id FROM workspaces WHERE seller_code = $1`
	var id uuid.UUID
	if err := r.db.GetContext(ctx, &id, q, code); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return uuid.UUID{}, nil
		}
		return uuid.UUID{}, fmt.Errorf("connections: lookup seller code: %w", err)
	}
	return id, nil
}

// ─── Sensor requests ──────────────────────────────────────────────────────────

func (r *onboardingRepo) CreateSensorRequest(ctx context.Context, sr *domain.SensorRequest) error {
	const q = `
		INSERT INTO sensor_requests
			(id, workspace_id, submitted_by, device_imei, registration_no, status)
		VALUES ($1, $2, $3, $4, $5, 'PENDING_SELLER')`
	if _, err := r.db.ExecContext(ctx, q,
		sr.ID, sr.WorkspaceID, sr.SubmittedBy, sr.DeviceIMEI, sr.RegistrationNo); err != nil {
		return fmt.Errorf("sensor_requests: create: %w", err)
	}
	return nil
}

func (r *onboardingRepo) ListSensorRequests(ctx context.Context, workspaceID uuid.UUID, status string) ([]*domain.SensorRequest, error) {
	q := `
		SELECT id, workspace_id, submitted_by, device_imei, registration_no, status,
		       seller_reviewed_by, seller_reviewed_at, admin_reviewed_by, admin_reviewed_at,
		       rejection_reason, created_at
		FROM   sensor_requests
		WHERE  workspace_id = $1`
	args := []interface{}{workspaceID}
	if status != "" {
		q += ` AND status = $2`
		args = append(args, status)
	}
	q += ` ORDER BY created_at DESC`
	var rows []*domain.SensorRequest
	if err := r.db.SelectContext(ctx, &rows, q, args...); err != nil {
		return nil, fmt.Errorf("sensor_requests: list: %w", err)
	}
	return rows, nil
}

func (r *onboardingRepo) GetSensorRequestByID(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID) (*domain.SensorRequest, error) {
	const q = `
		SELECT id, workspace_id, submitted_by, device_imei, registration_no, status,
		       seller_reviewed_by, seller_reviewed_at, admin_reviewed_by, admin_reviewed_at,
		       rejection_reason, created_at
		FROM   sensor_requests
		WHERE  id = $1 AND workspace_id = $2`
	var sr domain.SensorRequest
	if err := r.db.GetContext(ctx, &sr, q, id, workspaceID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("sensor_requests: get %s: %w", id, err)
	}
	return &sr, nil
}

func (r *onboardingRepo) AdvanceSensorRequest(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID, newStatus string, reviewerSub string) error {
	now := time.Now()
	var q string
	var args []interface{}

	switch newStatus {
	case "PENDING_ADMIN":
		q = `UPDATE sensor_requests SET status=$1, seller_reviewed_by=$2, seller_reviewed_at=$3, updated_at=now()
			 WHERE id=$4 AND workspace_id=$5 AND status='PENDING_SELLER'`
		args = []interface{}{newStatus, reviewerSub, now, id, workspaceID}
	case "APPROVED":
		q = `UPDATE sensor_requests SET status=$1, admin_reviewed_by=$2, admin_reviewed_at=$3, updated_at=now()
			 WHERE id=$4 AND workspace_id=$5 AND status='PENDING_ADMIN'`
		args = []interface{}{newStatus, reviewerSub, now, id, workspaceID}
	case "REJECTED":
		q = `UPDATE sensor_requests SET status=$1, updated_at=now()
			 WHERE id=$2 AND workspace_id=$3 AND status IN ('PENDING_SELLER','PENDING_ADMIN')`
		args = []interface{}{newStatus, id, workspaceID}
	default:
		return fmt.Errorf("sensor_requests: unknown target status %q", newStatus)
	}

	res, err := r.db.ExecContext(ctx, q, args...)
	if err != nil {
		return fmt.Errorf("sensor_requests: advance: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("sensor_requests: %s not found or wrong current status", id)
	}
	return nil
}
