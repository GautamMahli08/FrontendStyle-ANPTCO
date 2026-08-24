package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/anptco/location-geofence-service/internal/domain"
	"github.com/anptco/location-geofence-service/internal/repository"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type alertRepo struct{ db *sqlx.DB }

// NewAlertRepository returns an AlertRepository backed by pool.
func NewAlertRepository(pool *sqlx.DB) repository.AlertRepository {
	return &alertRepo{db: pool}
}

func (r *alertRepo) Upsert(ctx context.Context, a *domain.Alert) error {
	payload := a.Payload
	if len(payload) == 0 {
		payload = json.RawMessage("{}")
	}

	// On conflict: keep the lowest (most critical) severity seen, merge the
	// payload JSON objects, and refresh the location and detection timestamp.
	// Status is never touched — once ACKNOWLEDGED/RESOLVED it stays that way.
	const q = `
		INSERT INTO alerts
		  (workspace_id, type, severity, vehicle_id, device_imei,
		   trip_id, order_id, sensor_id, occurred_at,
		   last_lat, last_lng, geofence_id, confidence, dedup_key, payload)
		VALUES
		  ($1, $2, $3, $4, $5,
		   $6, $7, $8, $9,
		   $10, $11, $12, $13, $14, $15)
		ON CONFLICT (workspace_id, dedup_key) DO UPDATE SET
		  severity    = LEAST(alerts.severity, EXCLUDED.severity),
		  payload     = alerts.payload || EXCLUDED.payload,
		  last_lat    = COALESCE(EXCLUDED.last_lat,  alerts.last_lat),
		  last_lng    = COALESCE(EXCLUDED.last_lng,  alerts.last_lng),
		  detected_at = now()`

	if _, err := fromCtx(ctx, r.db).ExecContext(ctx, q,
		a.WorkspaceID, string(a.Type), a.Severity, a.VehicleID, a.DeviceIMEI,
		a.TripID, a.OrderID, a.SensorID, a.OccurredAt,
		a.LastLat, a.LastLng, a.GeofenceID, a.Confidence, a.DedupKey, payload,
	); err != nil {
		return fmt.Errorf("alert: upsert %s: %w", a.DedupKey, err)
	}
	return nil
}

func (r *alertRepo) GetConfig(ctx context.Context, workspaceID, vehicleID uuid.UUID) (*domain.MonitoringConfig, error) {
	// Vehicle-specific row wins (ORDER BY vehicle_id NULLS LAST gives it precedence).
	const q = `
		SELECT workspace_id, vehicle_id,
		       fuel_change_l, stationary_speed_kmh,
		       min_stop_duration_s, suspicious_stop_duration_s,
		       drain_window_s, drain_delta_stationary_pct, drain_delta_moving_pct,
		       power_loss_debounce_s, sensor_miss_window_s, power_mode
		FROM   monitoring_config
		WHERE  workspace_id = $1
		  AND  (vehicle_id = $2 OR vehicle_id IS NULL)
		ORDER  BY vehicle_id NULLS LAST
		LIMIT  1`

	var cfg domain.MonitoringConfig
	if err := r.db.GetContext(ctx, &cfg, q, workspaceID, vehicleID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return domain.DefaultMonitoringConfig(workspaceID), nil
		}
		return nil, fmt.Errorf("monitoring config for workspace %s: %w", workspaceID, err)
	}
	return &cfg, nil
}
