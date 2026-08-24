package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/anptco/location-geofence-service/internal/domain"
	"github.com/anptco/location-geofence-service/internal/repository"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

type stopRepo struct{ db *sqlx.DB }

// NewStopRepository returns a StopRepository backed by pool.
func NewStopRepository(pool *sqlx.DB) repository.StopRepository {
	return &stopRepo{db: pool}
}

func (r *stopRepo) Upsert(ctx context.Context, s *domain.VehicleStop) error {
	reasons := pq.StringArray(s.Reasons)
	if reasons == nil {
		reasons = pq.StringArray{}
	}

	const q = `
		INSERT INTO vehicle_stops
		  (workspace_id, vehicle_id, trip_id,
		   lat, lng, started_at, ended_at, duration_s,
		   inside_geofence, geofence_id, geofence_name,
		   classification, reasons, dedup_key)
		VALUES
		  ($1, $2, $3,
		   $4, $5, $6, $7, $8,
		   $9, $10, $11,
		   $12, $13, $14)
		ON CONFLICT (workspace_id, dedup_key) DO UPDATE SET
		  ended_at        = COALESCE(EXCLUDED.ended_at,       vehicle_stops.ended_at),
		  duration_s      = COALESCE(EXCLUDED.duration_s,     vehicle_stops.duration_s),
		  inside_geofence = EXCLUDED.inside_geofence,
		  geofence_id     = COALESCE(EXCLUDED.geofence_id,    vehicle_stops.geofence_id),
		  geofence_name   = COALESCE(EXCLUDED.geofence_name,  vehicle_stops.geofence_name),
		  classification  = EXCLUDED.classification,
		  reasons         = EXCLUDED.reasons`

	if _, err := fromCtx(ctx, r.db).ExecContext(ctx, q,
		s.WorkspaceID, s.VehicleID, s.TripID,
		s.Lat, s.Lng, s.StartedAt, s.EndedAt, s.DurationS,
		s.InsideGeofence, s.GeofenceID, s.GeofenceName,
		s.Classification, reasons, s.DedupKey,
	); err != nil {
		return fmt.Errorf("stop: upsert for vehicle %s: %w", s.VehicleID, err)
	}
	return nil
}

func (r *stopRepo) GetOpen(ctx context.Context, vehicleID uuid.UUID) (*domain.VehicleStop, error) {
	const q = `
		SELECT id, workspace_id, vehicle_id, trip_id,
		       lat, lng, started_at, ended_at, duration_s,
		       inside_geofence, geofence_id, geofence_name,
		       classification, reasons, dedup_key
		FROM   vehicle_stops
		WHERE  vehicle_id = $1 AND ended_at IS NULL
		ORDER  BY started_at DESC
		LIMIT  1`

	var row stopRow
	if err := r.db.GetContext(ctx, &row, q, vehicleID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("stop: get open for vehicle %s: %w", vehicleID, err)
	}
	return row.toDomain(), nil
}

func (r *stopRepo) DeleteOpen(ctx context.Context, vehicleID uuid.UUID) error {
	const q = `DELETE FROM vehicle_stops WHERE vehicle_id = $1 AND ended_at IS NULL`
	if _, err := r.db.ExecContext(ctx, q, vehicleID); err != nil {
		return fmt.Errorf("stop: delete open for vehicle %s: %w", vehicleID, err)
	}
	return nil
}

// stopRow handles pq.StringArray scanning for the reasons text[] column,
// which sqlx cannot scan into []string directly.
type stopRow struct {
	ID             uuid.UUID      `db:"id"`
	WorkspaceID    uuid.UUID      `db:"workspace_id"`
	VehicleID      uuid.UUID      `db:"vehicle_id"`
	TripID         *uuid.UUID     `db:"trip_id"`
	Lat            float64        `db:"lat"`
	Lng            float64        `db:"lng"`
	StartedAt      time.Time      `db:"started_at"`
	EndedAt        *time.Time     `db:"ended_at"`
	DurationS      *int           `db:"duration_s"`
	InsideGeofence bool           `db:"inside_geofence"`
	GeofenceID     *uuid.UUID     `db:"geofence_id"`
	GeofenceName   *string        `db:"geofence_name"`
	Classification string         `db:"classification"`
	Reasons        pq.StringArray `db:"reasons"`
	DedupKey       string         `db:"dedup_key"`
}

func (row *stopRow) toDomain() *domain.VehicleStop {
	return &domain.VehicleStop{
		ID:             row.ID,
		WorkspaceID:    row.WorkspaceID,
		VehicleID:      row.VehicleID,
		TripID:         row.TripID,
		Lat:            row.Lat,
		Lng:            row.Lng,
		StartedAt:      row.StartedAt,
		EndedAt:        row.EndedAt,
		DurationS:      row.DurationS,
		InsideGeofence: row.InsideGeofence,
		GeofenceID:     row.GeofenceID,
		GeofenceName:   row.GeofenceName,
		Classification: row.Classification,
		Reasons:        []string(row.Reasons),
		DedupKey:       row.DedupKey,
	}
}
