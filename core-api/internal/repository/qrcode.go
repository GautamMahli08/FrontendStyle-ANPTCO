package repository

import (
	"context"

	"github.com/anptco/core-api/internal/domain"
	"github.com/google/uuid"
)

type QRCodeRepository interface {
	// GetActiveByTruckID returns the single ACTIVE qr_codes row for the truck,
	// or nil when no QR has been issued yet.
	GetActiveByTruckID(ctx context.Context, truckID uuid.UUID) (*domain.QRCode, error)

	// Issue inserts a new qr_codes row. Callers must have already revoked the
	// previous active version (if any) before calling Issue.
	Issue(ctx context.Context, code *domain.QRCode) error

	// Revoke flips the ACTIVE row to REVOKED for the given truck.
	// Returns nil when no active row exists (idempotent).
	Revoke(ctx context.Context, truckID uuid.UUID, revokedBy string) error
}
