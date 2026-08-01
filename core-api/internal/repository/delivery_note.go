package repository

import (
	"context"

	"github.com/anptco/core-api/internal/domain"
	"github.com/google/uuid"
)

type DeliveryNoteRepository interface {
	GetByTripID(ctx context.Context, tripID uuid.UUID) (*domain.DeliveryNote, error)
	GetByOrderID(ctx context.Context, orderID uuid.UUID) (*domain.DeliveryNote, error)
	Insert(ctx context.Context, note *domain.DeliveryNote) error
}
