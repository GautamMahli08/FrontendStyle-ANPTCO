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

type deviceRepo struct{ db *sqlx.DB }

func NewDeviceRepository(db *sqlx.DB) repository.DeviceRepository {
	return &deviceRepo{db: db}
}

// ── GPS Devices ───────────────────────────────────────────────────────────────

func (r *deviceRepo) ListDevices(ctx context.Context, status string) ([]*domain.Device, error) {
	q := `SELECT id, imei, model, firmware, sim_iccid, sim_phone, status, purchased_at, notes, created_at, updated_at FROM devices`
	args := []interface{}{}
	if status != "" {
		q += " WHERE status=$1"
		args = append(args, status)
	}
	q += " ORDER BY created_at DESC"
	var rows []*domain.Device
	if err := r.db.SelectContext(ctx, &rows, q, args...); err != nil {
		return nil, fmt.Errorf("devices: list: %w", err)
	}
	return rows, nil
}

func (r *deviceRepo) GetDevice(ctx context.Context, id uuid.UUID) (*domain.Device, error) {
	const q = `SELECT id, imei, model, firmware, sim_iccid, sim_phone, status, purchased_at, notes, created_at, updated_at FROM devices WHERE id=$1`
	var d domain.Device
	if err := r.db.GetContext(ctx, &d, q, id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("devices: get: %w", err)
	}
	return &d, nil
}

func (r *deviceRepo) CreateDevice(ctx context.Context, d *domain.Device) error {
	if d.ID == (uuid.UUID{}) {
		d.ID = uuid.New()
	}
	const q = `
		INSERT INTO devices (id, imei, model, firmware, sim_iccid, sim_phone, purchased_at, notes)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`
	if _, err := r.db.ExecContext(ctx, q, d.ID, d.IMEI, d.Model, d.Firmware, d.SIMICCID, d.SIMPhone, d.PurchasedAt, d.Notes); err != nil {
		return fmt.Errorf("devices: create: %w", err)
	}
	return nil
}

func (r *deviceRepo) UpdateDevice(ctx context.Context, d *domain.Device) error {
	const q = `
		UPDATE devices SET model=$1, firmware=$2, sim_iccid=$3, sim_phone=$4, status=$5, notes=$6, updated_at=now()
		WHERE  id=$7`
	if _, err := r.db.ExecContext(ctx, q, d.Model, d.Firmware, d.SIMICCID, d.SIMPhone, d.Status, d.Notes, d.ID); err != nil {
		return fmt.Errorf("devices: update: %w", err)
	}
	return nil
}

func (r *deviceRepo) AssignDevice(ctx context.Context, deviceID, truckID uuid.UUID, actorID string, notes *string) (*domain.DeviceAssignment, error) {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("devices: assign: begin: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	// Check device is AVAILABLE.
	var devStatus string
	if err := tx.QueryRowContext(ctx, `SELECT status FROM devices WHERE id=$1 FOR UPDATE`, deviceID).Scan(&devStatus); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("devices: assign: device not found")
		}
		return nil, fmt.Errorf("devices: assign: check device: %w", err)
	}
	if devStatus != "AVAILABLE" {
		return nil, repository.ErrAlreadyAssigned
	}

	// Check truck doesn't already have an active device.
	var existingCount int
	if err := tx.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM device_assignments WHERE truck_id=$1 AND unassigned_at IS NULL`,
		truckID,
	).Scan(&existingCount); err != nil {
		return nil, fmt.Errorf("devices: assign: check truck: %w", err)
	}
	if existingCount > 0 {
		return nil, repository.ErrAlreadyAssigned
	}

	// Look up IMEI for the device.
	var imei string
	if err := tx.QueryRowContext(ctx, `SELECT imei FROM devices WHERE id=$1`, deviceID).Scan(&imei); err != nil {
		return nil, fmt.Errorf("devices: assign: get imei: %w", err)
	}

	// Insert assignment row.
	a := &domain.DeviceAssignment{
		ID:         uuid.New(),
		DeviceID:   deviceID,
		TruckID:    truckID,
		AssignedBy: actorID,
		Notes:      notes,
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO device_assignments (id, device_id, truck_id, assigned_by, notes) VALUES ($1,$2,$3,$4,$5)`,
		a.ID, a.DeviceID, a.TruckID, a.AssignedBy, a.Notes,
	); err != nil {
		return nil, fmt.Errorf("devices: assign: insert assignment: %w", err)
	}

	// Update device status.
	if _, err := tx.ExecContext(ctx, `UPDATE devices SET status='ASSIGNED', updated_at=now() WHERE id=$1`, deviceID); err != nil {
		return nil, fmt.Errorf("devices: assign: update device status: %w", err)
	}

	// Write IMEI into trucks.
	if _, err := tx.ExecContext(ctx, `UPDATE trucks SET galileosky_device_id=$1, updated_at=now() WHERE id=$2`, imei, truckID); err != nil {
		return nil, fmt.Errorf("devices: assign: update truck imei: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("devices: assign: commit: %w", err)
	}
	return a, nil
}

func (r *deviceRepo) UnassignDevice(ctx context.Context, deviceID uuid.UUID, actorID string) error {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return fmt.Errorf("devices: unassign: begin: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	// Close active assignment and capture truck_id.
	var truckID uuid.UUID
	if err := tx.QueryRowContext(ctx,
		`UPDATE device_assignments SET unassigned_at=now(), unassigned_by=$1
		 WHERE device_id=$2 AND unassigned_at IS NULL
		 RETURNING truck_id`,
		actorID, deviceID,
	).Scan(&truckID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil // already unassigned — idempotent
		}
		return fmt.Errorf("devices: unassign: close assignment: %w", err)
	}

	// Free the device.
	if _, err := tx.ExecContext(ctx, `UPDATE devices SET status='AVAILABLE', updated_at=now() WHERE id=$1`, deviceID); err != nil {
		return fmt.Errorf("devices: unassign: free device: %w", err)
	}

	// Clear IMEI from truck.
	if _, err := tx.ExecContext(ctx, `UPDATE trucks SET galileosky_device_id='', updated_at=now() WHERE id=$1`, truckID); err != nil {
		return fmt.Errorf("devices: unassign: clear truck imei: %w", err)
	}

	return tx.Commit()
}

func (r *deviceRepo) ListDeviceAssignments(ctx context.Context, truckID uuid.UUID) ([]*domain.DeviceAssignment, error) {
	const q = `
		SELECT id, device_id, truck_id, assigned_by, unassigned_by, assigned_at, unassigned_at, notes
		FROM   device_assignments
		WHERE  truck_id=$1
		ORDER  BY assigned_at DESC`
	var rows []*domain.DeviceAssignment
	if err := r.db.SelectContext(ctx, &rows, q, truckID); err != nil {
		return nil, fmt.Errorf("devices: list assignments: %w", err)
	}
	return rows, nil
}

// ── Fuel sensors ──────────────────────────────────────────────────────────────

func (r *deviceRepo) ListSensors(ctx context.Context, status string) ([]*domain.FuelSensor, error) {
	q := `SELECT id, serial_no, model, status, purchased_at, notes, created_at, updated_at FROM fuel_sensors`
	args := []interface{}{}
	if status != "" {
		q += " WHERE status=$1"
		args = append(args, status)
	}
	q += " ORDER BY created_at DESC"
	var rows []*domain.FuelSensor
	if err := r.db.SelectContext(ctx, &rows, q, args...); err != nil {
		return nil, fmt.Errorf("devices: list sensors: %w", err)
	}
	return rows, nil
}

func (r *deviceRepo) GetSensor(ctx context.Context, id uuid.UUID) (*domain.FuelSensor, error) {
	const q = `SELECT id, serial_no, model, status, purchased_at, notes, created_at, updated_at FROM fuel_sensors WHERE id=$1`
	var s domain.FuelSensor
	if err := r.db.GetContext(ctx, &s, q, id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("devices: get sensor: %w", err)
	}
	return &s, nil
}

func (r *deviceRepo) CreateSensor(ctx context.Context, s *domain.FuelSensor) error {
	if s.ID == (uuid.UUID{}) {
		s.ID = uuid.New()
	}
	const q = `INSERT INTO fuel_sensors (id, serial_no, model, purchased_at, notes) VALUES ($1,$2,$3,$4,$5)`
	if _, err := r.db.ExecContext(ctx, q, s.ID, s.SerialNo, s.Model, s.PurchasedAt, s.Notes); err != nil {
		return fmt.Errorf("devices: create sensor: %w", err)
	}
	return nil
}

func (r *deviceRepo) UpdateSensor(ctx context.Context, s *domain.FuelSensor) error {
	const q = `UPDATE fuel_sensors SET model=$1, status=$2, notes=$3, updated_at=now() WHERE id=$4`
	if _, err := r.db.ExecContext(ctx, q, s.Model, s.Status, s.Notes, s.ID); err != nil {
		return fmt.Errorf("devices: update sensor: %w", err)
	}
	return nil
}

func (r *deviceRepo) AssignSensor(ctx context.Context, sensorID, truckID uuid.UUID, compartmentNo int, actorID string, notes *string) (*domain.FuelSensorAssignment, error) {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("devices: assign sensor: begin: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	var sensStatus string
	if err := tx.QueryRowContext(ctx, `SELECT status FROM fuel_sensors WHERE id=$1 FOR UPDATE`, sensorID).Scan(&sensStatus); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("devices: assign sensor: sensor not found")
		}
		return nil, fmt.Errorf("devices: assign sensor: check: %w", err)
	}
	if sensStatus != "AVAILABLE" {
		return nil, repository.ErrAlreadyAssigned
	}

	a := &domain.FuelSensorAssignment{
		ID:            uuid.New(),
		SensorID:      sensorID,
		TruckID:       truckID,
		CompartmentNo: compartmentNo,
		AssignedBy:    actorID,
		Notes:         notes,
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO fuel_sensor_assignments (id, sensor_id, truck_id, compartment_no, assigned_by, notes) VALUES ($1,$2,$3,$4,$5,$6)`,
		a.ID, a.SensorID, a.TruckID, a.CompartmentNo, a.AssignedBy, a.Notes,
	); err != nil {
		return nil, fmt.Errorf("devices: assign sensor: insert: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `UPDATE fuel_sensors SET status='ASSIGNED', updated_at=now() WHERE id=$1`, sensorID); err != nil {
		return nil, fmt.Errorf("devices: assign sensor: update status: %w", err)
	}

	return a, tx.Commit()
}

func (r *deviceRepo) UnassignSensor(ctx context.Context, sensorID uuid.UUID, actorID string) error {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return fmt.Errorf("devices: unassign sensor: begin: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	var dummy uuid.UUID
	if err := tx.QueryRowContext(ctx,
		`UPDATE fuel_sensor_assignments SET unassigned_at=now(), unassigned_by=$1
		 WHERE sensor_id=$2 AND unassigned_at IS NULL RETURNING id`,
		actorID, sensorID,
	).Scan(&dummy); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return fmt.Errorf("devices: unassign sensor: close: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `UPDATE fuel_sensors SET status='AVAILABLE', updated_at=now() WHERE id=$1`, sensorID); err != nil {
		return fmt.Errorf("devices: unassign sensor: update status: %w", err)
	}

	return tx.Commit()
}

func (r *deviceRepo) ListSensorAssignments(ctx context.Context, truckID uuid.UUID) ([]*domain.FuelSensorAssignment, error) {
	const q = `
		SELECT id, sensor_id, truck_id, compartment_no, assigned_by, unassigned_by, assigned_at, unassigned_at, notes
		FROM   fuel_sensor_assignments
		WHERE  truck_id=$1
		ORDER  BY assigned_at DESC`
	var rows []*domain.FuelSensorAssignment
	if err := r.db.SelectContext(ctx, &rows, q, truckID); err != nil {
		return nil, fmt.Errorf("devices: list sensor assignments: %w", err)
	}
	return rows, nil
}
