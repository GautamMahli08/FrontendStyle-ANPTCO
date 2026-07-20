package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/anptco/core-api/internal/domain"
	"github.com/anptco/core-api/internal/repository"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type adminRepo struct{ db *sqlx.DB }

func NewAdminRepository(db *sqlx.DB) repository.AdminRepository {
	return &adminRepo{db: db}
}

// ── Workspace admin ───────────────────────────────────────────────────────────

func (r *adminRepo) ListWorkspaces(ctx context.Context) ([]*domain.Workspace, error) {
	const q = `
		SELECT id::text, slug, name, type, seller_code, modules, is_sandbox, created_at
		FROM   workspaces
		ORDER  BY name`
	var rows []*domain.Workspace
	if err := r.db.SelectContext(ctx, &rows, q); err != nil {
		return nil, fmt.Errorf("admin: list workspaces: %w", err)
	}
	return rows, nil
}

func (r *adminRepo) CreateWorkspace(ctx context.Context, w *domain.Workspace) error {
	const q = `
		INSERT INTO workspaces (id, slug, name, type, is_sandbox)
		VALUES ($1, $2, $3, $4, $5)`
	if _, err := r.db.ExecContext(ctx, q, w.ID, w.Slug, w.Name, w.Type, w.IsSandbox); err != nil {
		return fmt.Errorf("admin: create workspace: %w", err)
	}
	return nil
}

func (r *adminRepo) UpdateWorkspaceModules(ctx context.Context, workspaceID uuid.UUID, modules domain.JSONB) error {
	const q = `UPDATE workspaces SET modules = $1, updated_at = now() WHERE id = $2`
	if _, err := r.db.ExecContext(ctx, q, []byte(modules), workspaceID); err != nil {
		return fmt.Errorf("admin: update workspace modules: %w", err)
	}
	return nil
}

// ── Workspace profiles ────────────────────────────────────────────────────────

func (r *adminRepo) UpsertProfile(ctx context.Context, p *domain.WorkspaceProfile) error {
	const q = `
		INSERT INTO workspace_profiles
			(workspace_id, company_name, company_reg_no, tax_id, country,
			 city, address, contact_name, contact_email, contact_phone, notes)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		ON CONFLICT (workspace_id) DO UPDATE SET
			company_name   = EXCLUDED.company_name,
			company_reg_no = EXCLUDED.company_reg_no,
			tax_id         = EXCLUDED.tax_id,
			country        = EXCLUDED.country,
			city           = EXCLUDED.city,
			address        = EXCLUDED.address,
			contact_name   = EXCLUDED.contact_name,
			contact_email  = EXCLUDED.contact_email,
			contact_phone  = EXCLUDED.contact_phone,
			notes          = EXCLUDED.notes,
			updated_at     = now()`
	_, err := r.db.ExecContext(ctx, q,
		p.WorkspaceID, p.CompanyName, p.CompanyRegNo, p.TaxID, p.Country,
		p.City, p.Address, p.ContactName, p.ContactEmail, p.ContactPhone, p.Notes,
	)
	if err != nil {
		return fmt.Errorf("admin: upsert profile: %w", err)
	}
	return nil
}

func (r *adminRepo) GetProfile(ctx context.Context, workspaceID uuid.UUID) (*domain.WorkspaceProfile, error) {
	const q = `
		SELECT workspace_id, company_name, company_reg_no, tax_id, country,
		       city, address, contact_name, contact_email, contact_phone, notes,
		       created_at, updated_at
		FROM   workspace_profiles
		WHERE  workspace_id = $1`
	var p domain.WorkspaceProfile
	if err := r.db.GetContext(ctx, &p, q, workspaceID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("admin: get profile: %w", err)
	}
	return &p, nil
}

// ── Subscriptions ─────────────────────────────────────────────────────────────

func (r *adminRepo) ListPlans(ctx context.Context) ([]*domain.SubscriptionPlan, error) {
	const q = `SELECT id, key, name, max_trucks, price_usd, created_at FROM subscription_plans ORDER BY price_usd`
	var rows []*domain.SubscriptionPlan
	if err := r.db.SelectContext(ctx, &rows, q); err != nil {
		return nil, fmt.Errorf("admin: list plans: %w", err)
	}
	return rows, nil
}

func (r *adminRepo) Subscribe(ctx context.Context, workspaceID, planID uuid.UUID) (*domain.WorkspaceSubscription, error) {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("admin: subscribe: begin: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	// Cancel existing active subscription.
	_, err = tx.ExecContext(ctx,
		`UPDATE workspace_subscriptions SET status = 'CANCELLED' WHERE workspace_id = $1 AND status = 'ACTIVE'`,
		workspaceID,
	)
	if err != nil {
		return nil, fmt.Errorf("admin: subscribe: cancel old: %w", err)
	}

	sub := &domain.WorkspaceSubscription{
		ID:          uuid.New(),
		WorkspaceID: workspaceID,
		PlanID:      planID,
		Status:      "ACTIVE",
		StartedAt:   time.Now().UTC(),
	}
	_, err = tx.ExecContext(ctx,
		`INSERT INTO workspace_subscriptions (id, workspace_id, plan_id, status, started_at) VALUES ($1,$2,$3,$4,$5)`,
		sub.ID, sub.WorkspaceID, sub.PlanID, sub.Status, sub.StartedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("admin: subscribe: insert: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("admin: subscribe: commit: %w", err)
	}
	return sub, nil
}

func (r *adminRepo) GetSubscription(ctx context.Context, workspaceID uuid.UUID) (*domain.WorkspaceSubscription, error) {
	const q = `
		SELECT id, workspace_id, plan_id, status, started_at, ends_at, created_at
		FROM   workspace_subscriptions
		WHERE  workspace_id = $1 AND status = 'ACTIVE'
		LIMIT  1`
	var s domain.WorkspaceSubscription
	if err := r.db.GetContext(ctx, &s, q, workspaceID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("admin: get subscription: %w", err)
	}
	return &s, nil
}

// ── Drivers ───────────────────────────────────────────────────────────────────

func (r *adminRepo) ListDrivers(ctx context.Context, workspaceID uuid.UUID) ([]*domain.Driver, error) {
	const q = `
		SELECT id, workspace_id, full_name, phone, license_no, notes, is_active, created_at, updated_at
		FROM   drivers
		WHERE  workspace_id = $1 AND is_active = true
		ORDER  BY full_name`
	var rows []*domain.Driver
	if err := r.db.SelectContext(ctx, &rows, q, workspaceID); err != nil {
		return nil, fmt.Errorf("admin: list drivers: %w", err)
	}
	return rows, nil
}

func (r *adminRepo) CreateDriver(ctx context.Context, d *domain.Driver) error {
	const q = `
		INSERT INTO drivers (id, workspace_id, full_name, phone, license_no, notes)
		VALUES ($1,$2,$3,$4,$5,$6)`
	if _, err := r.db.ExecContext(ctx, q, d.ID, d.WorkspaceID, d.FullName, d.Phone, d.LicenseNo, d.Notes); err != nil {
		return fmt.Errorf("admin: create driver: %w", err)
	}
	return nil
}

func (r *adminRepo) UpdateDriver(ctx context.Context, d *domain.Driver) error {
	const q = `
		UPDATE drivers SET full_name=$1, phone=$2, license_no=$3, notes=$4, updated_at=now()
		WHERE  id=$5 AND workspace_id=$6`
	if _, err := r.db.ExecContext(ctx, q, d.FullName, d.Phone, d.LicenseNo, d.Notes, d.ID, d.WorkspaceID); err != nil {
		return fmt.Errorf("admin: update driver: %w", err)
	}
	return nil
}

func (r *adminRepo) DeactivateDriver(ctx context.Context, driverID uuid.UUID) error {
	const q = `UPDATE drivers SET is_active=false, updated_at=now() WHERE id=$1`
	if _, err := r.db.ExecContext(ctx, q, driverID); err != nil {
		return fmt.Errorf("admin: deactivate driver: %w", err)
	}
	return nil
}

// ── Truck compartments ────────────────────────────────────────────────────────

func (r *adminRepo) ListCompartments(ctx context.Context, truckID uuid.UUID) ([]*domain.TruckCompartment, error) {
	const q = `
		SELECT id, truck_id, compartment_no, capacity_liters, product_type, created_at
		FROM   truck_compartments
		WHERE  truck_id = $1
		ORDER  BY compartment_no`
	var rows []*domain.TruckCompartment
	if err := r.db.SelectContext(ctx, &rows, q, truckID); err != nil {
		return nil, fmt.Errorf("admin: list compartments: %w", err)
	}
	return rows, nil
}

func (r *adminRepo) UpsertCompartments(ctx context.Context, truckID uuid.UUID, compartments []*domain.TruckCompartment) error {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return fmt.Errorf("admin: upsert compartments: begin: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	if _, err := tx.ExecContext(ctx, `DELETE FROM truck_compartments WHERE truck_id=$1`, truckID); err != nil {
		return fmt.Errorf("admin: upsert compartments: delete: %w", err)
	}
	for _, c := range compartments {
		if c.ID == (uuid.UUID{}) {
			c.ID = uuid.New()
		}
		_, err := tx.ExecContext(ctx,
			`INSERT INTO truck_compartments (id, truck_id, compartment_no, capacity_liters, product_type) VALUES ($1,$2,$3,$4,$5)`,
			c.ID, truckID, c.CompartmentNo, c.CapacityLiters, c.ProductType,
		)
		if err != nil {
			return fmt.Errorf("admin: upsert compartments: insert: %w", err)
		}
	}
	return tx.Commit()
}

// ── Truck metadata ────────────────────────────────────────────────────────────

func (r *adminRepo) UpdateTruckMeta(ctx context.Context, truckID uuid.UUID, plate, make, model *string, year *int, notes *string) error {
	const q = `
		UPDATE trucks SET license_plate=$1, make=$2, model=$3, year=$4, notes=$5, updated_at=now()
		WHERE  id=$6`
	if _, err := r.db.ExecContext(ctx, q, plate, make, model, year, notes, truckID); err != nil {
		return fmt.Errorf("admin: update truck meta: %w", err)
	}
	return nil
}

func (r *adminRepo) CreateAdminTruck(ctx context.Context, workspaceID uuid.UUID, deviceIMEI string, plate, make, model *string, year *int) (uuid.UUID, error) {
	id := uuid.New()
	const q = `
		INSERT INTO trucks (id, workspace_id, galileosky_device_id, status, license_plate, make, model, year)
		VALUES ($1,$2,$3,'IDLE',$4,$5,$6,$7)`
	if _, err := r.db.ExecContext(ctx, q, id, workspaceID, deviceIMEI, plate, make, model, year); err != nil {
		return uuid.UUID{}, fmt.Errorf("admin: create truck: %w", err)
	}
	return id, nil
}

// ── ERP integration ───────────────────────────────────────────────────────────

func (r *adminRepo) UpsertIntegration(ctx context.Context, i *domain.WorkspaceIntegration) error {
	if i.ID == (uuid.UUID{}) {
		i.ID = uuid.New()
	}
	const q = `
		INSERT INTO workspace_integrations
			(id, workspace_id, system_type, base_url, auth_type, status, notes)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		ON CONFLICT (workspace_id, system_type) DO UPDATE SET
			base_url   = EXCLUDED.base_url,
			auth_type  = EXCLUDED.auth_type,
			status     = EXCLUDED.status,
			notes      = EXCLUDED.notes,
			updated_at = now()`
	_, err := r.db.ExecContext(ctx, q,
		i.ID, i.WorkspaceID, i.SystemType, i.BaseURL, i.AuthType, i.Status, i.Notes,
	)
	if err != nil {
		return fmt.Errorf("admin: upsert integration: %w", err)
	}
	return nil
}

func (r *adminRepo) GetIntegration(ctx context.Context, workspaceID uuid.UUID, systemType string) (*domain.WorkspaceIntegration, error) {
	const q = `
		SELECT id, workspace_id, system_type, base_url, auth_type, status, verified_at, notes, created_at, updated_at
		FROM   workspace_integrations
		WHERE  workspace_id=$1 AND system_type=$2`
	var i domain.WorkspaceIntegration
	if err := r.db.GetContext(ctx, &i, q, workspaceID, systemType); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("admin: get integration: %w", err)
	}
	return &i, nil
}

func (r *adminRepo) ListIntegrations(ctx context.Context, workspaceID uuid.UUID) ([]*domain.WorkspaceIntegration, error) {
	const q = `
		SELECT id, workspace_id, system_type, base_url, auth_type, status, verified_at, notes, created_at, updated_at
		FROM   workspace_integrations
		WHERE  workspace_id=$1
		ORDER  BY system_type`
	var rows []*domain.WorkspaceIntegration
	if err := r.db.SelectContext(ctx, &rows, q, workspaceID); err != nil {
		return nil, fmt.Errorf("admin: list integrations: %w", err)
	}
	return rows, nil
}

// ── Readiness check ───────────────────────────────────────────────────────────

func (r *adminRepo) GetReadiness(ctx context.Context, workspaceID uuid.UUID) (*domain.ReadinessReport, error) {
	type counts struct {
		Trucks       int `db:"trucks"`
		ActiveKeys   int `db:"active_keys"`
		HasProfile   int `db:"has_profile"`
		HasSub       int `db:"has_sub"`
		AssignedDevs int `db:"assigned_devs"`
	}
	const q = `
		SELECT
			(SELECT COUNT(*) FROM trucks WHERE workspace_id=$1)                                    AS trucks,
			(SELECT COUNT(*) FROM dispatch_api_keys WHERE workspace_id=$1 AND status='ACTIVE')     AS active_keys,
			(SELECT COUNT(*) FROM workspace_profiles WHERE workspace_id=$1)                        AS has_profile,
			(SELECT COUNT(*) FROM workspace_subscriptions WHERE workspace_id=$1 AND status='ACTIVE') AS has_sub,
			(SELECT COUNT(*) FROM device_assignments da
			   JOIN trucks t ON t.id=da.truck_id
			   WHERE t.workspace_id=$1 AND da.unassigned_at IS NULL)                               AS assigned_devs`
	var c counts
	if err := r.db.GetContext(ctx, &c, q, workspaceID); err != nil {
		return nil, fmt.Errorf("admin: readiness: %w", err)
	}

	checks := []domain.ReadinessCheck{
		{Key: "profile", Label: "Company profile filled", Passed: c.HasProfile > 0},
		{Key: "subscription", Label: "Subscription plan set", Passed: c.HasSub > 0},
		{Key: "trucks", Label: "At least one truck registered", Passed: c.Trucks > 0},
		{Key: "devices", Label: "All trucks have a GPS device", Passed: c.Trucks > 0 && c.AssignedDevs >= c.Trucks},
		{Key: "api_key", Label: "Dispatch API key issued", Passed: c.ActiveKeys > 0},
	}

	ready := true
	for i, ch := range checks {
		if !ch.Passed {
			ready = false
			if checks[i].Message == "" {
				checks[i].Message = "not yet completed"
			}
		}
	}

	return &domain.ReadinessReport{
		WorkspaceID: workspaceID,
		Ready:       ready,
		Checks:      checks,
	}, nil
}

// ── Audit log ─────────────────────────────────────────────────────────────────

func (r *adminRepo) WriteAuditLog(ctx context.Context, entry *domain.AuditLog) error {
	if entry.ID == (uuid.UUID{}) {
		entry.ID = uuid.New()
	}
	payload, _ := json.Marshal(entry.Payload)
	const q = `
		INSERT INTO audit_log (id, actor_id, action, target_type, target_id, payload)
		VALUES ($1,$2,$3,$4,$5,$6)`
	if _, err := r.db.ExecContext(ctx, q, entry.ID, entry.ActorID, entry.Action, entry.TargetType, entry.TargetID, payload); err != nil {
		return fmt.Errorf("admin: write audit log: %w", err)
	}
	return nil
}

func (r *adminRepo) ListAuditLog(ctx context.Context, targetType, targetID string, limit int) ([]*domain.AuditLog, error) {
	if limit <= 0 {
		limit = 50
	}
	const q = `
		SELECT id, actor_id, action, target_type, target_id, payload, created_at
		FROM   audit_log
		WHERE  target_type=$1 AND target_id=$2
		ORDER  BY created_at DESC
		LIMIT  $3`
	var rows []*domain.AuditLog
	if err := r.db.SelectContext(ctx, &rows, q, targetType, targetID, limit); err != nil {
		return nil, fmt.Errorf("admin: list audit log: %w", err)
	}
	return rows, nil
}

// ── ERP read endpoints ────────────────────────────────────────────────────────

func (r *adminRepo) ListERPTrucks(ctx context.Context, workspaceID uuid.UUID) ([]*domain.ERPTruck, error) {
	const qTrucks = `
		SELECT id, workspace_id, license_plate, make, model, year
		FROM   trucks
		WHERE  workspace_id = $1
		ORDER  BY COALESCE(license_plate, ''), created_at`
	var trucks []*domain.ERPTruck
	if err := r.db.SelectContext(ctx, &trucks, qTrucks, workspaceID); err != nil {
		return nil, fmt.Errorf("erp: list trucks: %w", err)
	}
	for _, t := range trucks {
		t.Compartments = []*domain.TruckCompartment{}
	}
	if len(trucks) == 0 {
		return trucks, nil
	}

	// Fetch compartments for all trucks in the workspace in one query.
	const qComps = `
		SELECT c.id, c.truck_id, c.compartment_no, c.capacity_liters, c.product_type, c.created_at
		FROM   truck_compartments c
		JOIN   trucks t ON t.id = c.truck_id
		WHERE  t.workspace_id = $1
		ORDER  BY c.truck_id, c.compartment_no`
	var comps []*domain.TruckCompartment
	if err := r.db.SelectContext(ctx, &comps, qComps, workspaceID); err != nil {
		return nil, fmt.Errorf("erp: list compartments: %w", err)
	}

	idx := make(map[uuid.UUID]*domain.ERPTruck, len(trucks))
	for _, t := range trucks {
		idx[t.ID] = t
	}
	for _, c := range comps {
		if t, ok := idx[c.TruckID]; ok {
			t.Compartments = append(t.Compartments, c)
		}
	}
	return trucks, nil
}

// ── Client portal trucks with live state ─────────────────────────────────────

func (r *adminRepo) ListClientTrucks(ctx context.Context, workspaceID uuid.UUID) ([]*domain.ClientTruck, error) {
	const q = `
		SELECT t.id, t.license_plate, t.make, t.model, t.year,
		       ls.latitude, ls.longitude, ls.speed,
		       COALESCE(
		           ls.total_fuel_liters,
		           (SELECT SUM(value::numeric)
		            FROM   jsonb_each_text(ls.compartment_fuel)
		            WHERE  ls.compartment_fuel IS NOT NULL)
		       ) AS total_fuel_liters,
		       ls.ignition_on, ls.last_message_at
		FROM   trucks t
		LEFT   JOIN truck_live_state ls ON ls.truck_id = t.id
		WHERE  t.workspace_id = $1
		ORDER  BY COALESCE(t.license_plate, ''), t.created_at`
	var rows []*domain.ClientTruck
	if err := r.db.SelectContext(ctx, &rows, q, workspaceID); err != nil {
		return nil, fmt.Errorf("client: list trucks: %w", err)
	}
	return rows, nil
}

// ── Asset events (admin view) ─────────────────────────────────────────────────

func (r *adminRepo) ListAssetEvents(ctx context.Context, workspaceID uuid.UUID, limit int) ([]*domain.AssetEvent, error) {
	if limit <= 0 {
		limit = 500
	}
	const q = `
		SELECT id, truck_id, workspace_id, event_type, latitude, longitude,
		       value_before, value_after, occurred_at, created_at
		FROM   asset_events
		WHERE  workspace_id = $1
		ORDER  BY occurred_at DESC
		LIMIT  $2`
	var rows []*domain.AssetEvent
	if err := r.db.SelectContext(ctx, &rows, q, workspaceID, limit); err != nil {
		return nil, fmt.Errorf("admin: list asset events: %w", err)
	}
	return rows, nil
}

func (r *adminRepo) ListUnifiedFeed(ctx context.Context, workspaceID uuid.UUID, limit int) ([]*domain.UnifiedFeedEvent, error) {
	if limit <= 0 {
		limit = 500
	}
	// Merge asset_events (fuel/battery/ignition/movement) with geofence_events
	// (ENTER/EXIT transitions). Geofence event_type is synthesised as
	// GEOFENCE_{ENTER|EXIT}_{STATION|DEPOT} so the frontend can show distinct
	// icons and labels without a separate endpoint.
	const q = `
		SELECT id, truck_id, workspace_id, event_type,
		       latitude, longitude,
		       value_before, value_after,
		       NULL::text   AS geofence_type,
		       NULL::text   AS geofence_zone,
		       NULL::uuid   AS trip_id,
		       occurred_at, created_at
		FROM   asset_events
		WHERE  workspace_id = $1
		UNION ALL
		SELECT ge.id, ge.truck_id, ge.workspace_id,
		       'GEOFENCE_' || ge.event_type || '_' || ge.geofence_type AS event_type,
		       ge.latitude, ge.longitude,
		       NULL::float8 AS value_before,
		       NULL::float8 AS value_after,
		       ge.geofence_type::text       AS geofence_type,
		       COALESCE(g.name, ge.geofence_type::text) AS geofence_zone,
		       ge.trip_id,
		       ge.occurred_at, ge.created_at
		FROM   geofence_events ge
		LEFT   JOIN geofences g ON g.id = ge.geofence_id
		WHERE  ge.workspace_id = $1
		ORDER  BY occurred_at DESC
		LIMIT  $2`
	var rows []*domain.UnifiedFeedEvent
	if err := r.db.SelectContext(ctx, &rows, q, workspaceID, limit); err != nil {
		return nil, fmt.Errorf("admin: unified feed: %w", err)
	}
	return rows, nil
}

// ── Trips (admin view) ────────────────────────────────────────────────────────

func (r *adminRepo) ListAdminTrips(ctx context.Context, workspaceID uuid.UUID) ([]*domain.Trip, error) {
	const q = `
		SELECT id, workspace_id, truck_id, order_id, order_ref,
		       driver_name, origin_name, origin_lat, origin_lng,
		       dest_name, dest_lat, dest_lng, dest_geofence_id,
		       source, status, created_at, updated_at
		FROM   trips
		WHERE  workspace_id = $1
		ORDER  BY created_at DESC
		LIMIT  200`
	var rows []*domain.Trip
	if err := r.db.SelectContext(ctx, &rows, q, workspaceID); err != nil {
		return nil, fmt.Errorf("admin: list trips: %w", err)
	}
	return rows, nil
}
