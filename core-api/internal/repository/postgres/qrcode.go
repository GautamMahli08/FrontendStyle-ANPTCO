package postgres

import (
	"context"
	"database/sql"
	"errors"

	"github.com/anptco/core-api/internal/domain"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type qrCodeRepository struct{ db *sqlx.DB }

func NewQRCodeRepository(db *sqlx.DB) *qrCodeRepository {
	return &qrCodeRepository{db: db}
}

func (r *qrCodeRepository) GetActiveByTruckID(ctx context.Context, truckID uuid.UUID) (*domain.QRCode, error) {
	const q = `
		SELECT id, truck_id, workspace_id, version, status, token_hash,
		       created_by, reason, created_at, revoked_at, revoked_by
		FROM   qr_codes
		WHERE  truck_id = $1 AND status = 'ACTIVE'
		LIMIT  1`
	var c domain.QRCode
	if err := r.db.GetContext(ctx, &c, q, truckID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &c, nil
}

func (r *qrCodeRepository) Issue(ctx context.Context, code *domain.QRCode) error {
	const q = `
		INSERT INTO qr_codes (id, truck_id, workspace_id, version, status, token_hash, created_by, reason)
		VALUES (:id, :truck_id, :workspace_id, :version, 'ACTIVE', :token_hash, :created_by, :reason)`
	_, err := r.db.NamedExecContext(ctx, q, code)
	return err
}

func (r *qrCodeRepository) Revoke(ctx context.Context, truckID uuid.UUID, revokedBy string) error {
	const q = `
		UPDATE qr_codes
		SET    status = 'REVOKED', revoked_at = now(), revoked_by = $2
		WHERE  truck_id = $1 AND status = 'ACTIVE'`
	_, err := r.db.ExecContext(ctx, q, truckID, revokedBy)
	return err
}
