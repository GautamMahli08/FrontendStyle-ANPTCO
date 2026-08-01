package domain

import (
	"time"

	"github.com/google/uuid"
)

// QRCode tracks the versioned signed QR token for a truck.
// Exactly one ACTIVE row exists per truck at any time (enforced by DB index).
// On regeneration the current ACTIVE row is REVOKED and a new row (version+1) is inserted.
type QRCode struct {
	ID          uuid.UUID  `db:"id"           json:"id"`
	TruckID     uuid.UUID  `db:"truck_id"     json:"truck_id"`
	WorkspaceID uuid.UUID  `db:"workspace_id" json:"workspace_id"`
	Version     int        `db:"version"      json:"version"`
	Status      string     `db:"status"       json:"status"` // ACTIVE | REVOKED
	TokenHash   string     `db:"token_hash"   json:"token_hash"`
	CreatedBy   string     `db:"created_by"   json:"created_by"`
	Reason      *string    `db:"reason"       json:"reason,omitempty"`
	CreatedAt   time.Time  `db:"created_at"   json:"created_at"`
	RevokedAt   *time.Time `db:"revoked_at"   json:"revoked_at,omitempty"`
	RevokedBy   *string    `db:"revoked_by"   json:"revoked_by,omitempty"`
}
