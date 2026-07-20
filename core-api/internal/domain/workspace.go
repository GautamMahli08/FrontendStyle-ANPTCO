package domain

import "time"

type WorkspaceType string

const (
	WorkspaceTypeSeller   WorkspaceType = "SELLER"
	WorkspaceTypeTSP      WorkspaceType = "TSP"
	WorkspaceTypeClient   WorkspaceType = "CLIENT"
	WorkspaceTypePlatform WorkspaceType = "PLATFORM"
)

type Workspace struct {
	ID             string        `db:"id"               json:"id"`
	Slug           string        `db:"slug"             json:"slug"`
	Name           string        `db:"name"             json:"name"`
	Type           WorkspaceType `db:"type"             json:"type"`
	SellerCode     *string       `db:"seller_code"      json:"seller_code,omitempty"`
	Modules        JSONB         `db:"modules"          json:"modules,omitempty"`
	DispatchAPIKey *string       `db:"dispatch_api_key" json:"-"` // never returned to clients
	IsSandbox      bool          `db:"is_sandbox"       json:"is_sandbox"`
	CreatedAt      time.Time     `db:"created_at"       json:"created_at"`
}
