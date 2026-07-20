package repository

import (
	"context"

	"github.com/anptco/core-api/internal/domain"
	"github.com/google/uuid"
)

// AdminRepository covers workspace onboarding, profiles, subscriptions,
// drivers, compartments, ERP integrations, and the readiness checklist.
type AdminRepository interface {
	// ── Workspace admin ───────────────────────────────────────────────────────

	// ListWorkspaces returns all workspaces with their profiles (admin view).
	ListWorkspaces(ctx context.Context) ([]*domain.Workspace, error)

	// CreateWorkspace inserts a new workspace row and returns the created record.
	CreateWorkspace(ctx context.Context, w *domain.Workspace) error

	// UpdateWorkspaceModules persists the modules JSONB column.
	UpdateWorkspaceModules(ctx context.Context, workspaceID uuid.UUID, modules domain.JSONB) error

	// ── Workspace profiles ────────────────────────────────────────────────────

	// UpsertProfile creates or updates the workspace_profiles row.
	UpsertProfile(ctx context.Context, p *domain.WorkspaceProfile) error

	// GetProfile returns the profile for a workspace, or nil when not set.
	GetProfile(ctx context.Context, workspaceID uuid.UUID) (*domain.WorkspaceProfile, error)

	// ── Subscriptions ─────────────────────────────────────────────────────────

	// ListPlans returns all subscription plans ordered by price.
	ListPlans(ctx context.Context) ([]*domain.SubscriptionPlan, error)

	// Subscribe sets an ACTIVE subscription for the workspace, cancelling any
	// existing active subscription first.
	Subscribe(ctx context.Context, workspaceID, planID uuid.UUID) (*domain.WorkspaceSubscription, error)

	// GetSubscription returns the current ACTIVE subscription, or nil.
	GetSubscription(ctx context.Context, workspaceID uuid.UUID) (*domain.WorkspaceSubscription, error)

	// ── Drivers ───────────────────────────────────────────────────────────────

	// ListDrivers returns active drivers for the workspace.
	ListDrivers(ctx context.Context, workspaceID uuid.UUID) ([]*domain.Driver, error)

	// CreateDriver inserts a new driver record.
	CreateDriver(ctx context.Context, d *domain.Driver) error

	// UpdateDriver updates mutable driver fields.
	UpdateDriver(ctx context.Context, d *domain.Driver) error

	// DeactivateDriver soft-deletes a driver by setting is_active = false.
	DeactivateDriver(ctx context.Context, driverID uuid.UUID) error

	// ── Truck compartments ────────────────────────────────────────────────────

	// ListCompartments returns all compartments for a truck.
	ListCompartments(ctx context.Context, truckID uuid.UUID) ([]*domain.TruckCompartment, error)

	// UpsertCompartments replaces all compartments for a truck in one shot.
	UpsertCompartments(ctx context.Context, truckID uuid.UUID, compartments []*domain.TruckCompartment) error

	// ── Truck metadata ────────────────────────────────────────────────────────

	// UpdateTruckMeta persists license_plate, make, model, year, notes.
	UpdateTruckMeta(ctx context.Context, truckID uuid.UUID, plate, make, model *string, year *int, notes *string) error

	// CreateTruck inserts a new IDLE truck (admin variant that sets metadata fields).
	CreateAdminTruck(ctx context.Context, workspaceID uuid.UUID, deviceIMEI string, plate, make, model *string, year *int) (uuid.UUID, error)

	// ── ERP integration ───────────────────────────────────────────────────────

	// UpsertIntegration creates or updates an ERP integration record.
	UpsertIntegration(ctx context.Context, i *domain.WorkspaceIntegration) error

	// GetIntegration returns the integration for a workspace+system_type pair.
	GetIntegration(ctx context.Context, workspaceID uuid.UUID, systemType string) (*domain.WorkspaceIntegration, error)

	// ListIntegrations returns all integrations for a workspace.
	ListIntegrations(ctx context.Context, workspaceID uuid.UUID) ([]*domain.WorkspaceIntegration, error)

	// ── Readiness checklist ───────────────────────────────────────────────────

	// GetReadiness evaluates all go-live preconditions for the workspace.
	GetReadiness(ctx context.Context, workspaceID uuid.UUID) (*domain.ReadinessReport, error)

	// ── Audit log ─────────────────────────────────────────────────────────────

	// WriteAuditLog appends one entry to the audit_log table.
	WriteAuditLog(ctx context.Context, entry *domain.AuditLog) error

	// ListAuditLog returns recent audit entries for a target (type + id).
	ListAuditLog(ctx context.Context, targetType, targetID string, limit int) ([]*domain.AuditLog, error)

	// ── ERP read endpoints ────────────────────────────────────────────────────

	// ListERPTrucks returns trucks with their compartments for a workspace.
	// Used by GET /v1/erp/trucks (dispatch API key auth). Never returns device IDs.
	ListERPTrucks(ctx context.Context, workspaceID uuid.UUID) ([]*domain.ERPTruck, error)

	// ListClientTrucks returns trucks joined with their current live state.
	// Used by GET /v1/client/trucks (Cognito JWT auth). Never returns device IDs.
	ListClientTrucks(ctx context.Context, workspaceID uuid.UUID) ([]*domain.ClientTruck, error)

	// ── Trips (admin view) ────────────────────────────────────────────────────

	// ListAdminTrips returns all trips for a workspace ordered by creation time desc.
	ListAdminTrips(ctx context.Context, workspaceID uuid.UUID) ([]*domain.Trip, error)

	// ListAssetEvents returns asset events for a workspace ordered by occurrence time desc.
	ListAssetEvents(ctx context.Context, workspaceID uuid.UUID, limit int) ([]*domain.AssetEvent, error)

	// ListUnifiedFeed returns a merged feed of asset_events and geofence_events
	// for the workspace, sorted by occurred_at DESC. Used by GET /v1/events.
	ListUnifiedFeed(ctx context.Context, workspaceID uuid.UUID, limit int) ([]*domain.UnifiedFeedEvent, error)
}
