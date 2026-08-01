package domain

import (
	"time"

	"github.com/google/uuid"
)

type DeliveryNote struct {
	ID          uuid.UUID  `db:"id"           json:"id"`
	TripID      uuid.UUID  `db:"trip_id"      json:"trip_id"`
	OrderID     *uuid.UUID `db:"order_id"     json:"order_id,omitempty"`
	WorkspaceID uuid.UUID  `db:"workspace_id" json:"workspace_id"`
	QRConfirmed bool       `db:"qr_confirmed" json:"qr_confirmed"`
	NoteData    JSONB      `db:"note_data"    json:"note_data"`
	S3Key       *string    `db:"s3_key"       json:"s3_key,omitempty"`
	GeneratedAt time.Time  `db:"generated_at" json:"generated_at"`
}
