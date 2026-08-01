package postgres

import (
	"context"
	"database/sql"
	"errors"

	"github.com/anptco/core-api/internal/domain"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type deliveryNoteRepo struct{ db *sqlx.DB }

func NewDeliveryNoteRepository(db *sqlx.DB) *deliveryNoteRepo {
	return &deliveryNoteRepo{db: db}
}

func (r *deliveryNoteRepo) GetByTripID(ctx context.Context, tripID uuid.UUID) (*domain.DeliveryNote, error) {
	var n domain.DeliveryNote
	err := r.db.GetContext(ctx, &n,
		`SELECT id, trip_id, order_id, workspace_id, qr_confirmed, note_data, s3_key, generated_at
		   FROM delivery_notes WHERE trip_id = $1`, tripID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &n, err
}

func (r *deliveryNoteRepo) GetByOrderID(ctx context.Context, orderID uuid.UUID) (*domain.DeliveryNote, error) {
	var n domain.DeliveryNote
	err := r.db.GetContext(ctx, &n,
		`SELECT id, trip_id, order_id, workspace_id, qr_confirmed, note_data, s3_key, generated_at
		   FROM delivery_notes WHERE order_id = $1`, orderID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &n, err
}

func (r *deliveryNoteRepo) Insert(ctx context.Context, note *domain.DeliveryNote) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO delivery_notes (id, trip_id, order_id, workspace_id, qr_confirmed, note_data, s3_key, generated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 ON CONFLICT (trip_id) DO NOTHING`,
		note.ID, note.TripID, note.OrderID, note.WorkspaceID,
		note.QRConfirmed, note.NoteData, note.S3Key, note.GeneratedAt)
	return err
}
