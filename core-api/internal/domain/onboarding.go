package domain

import (
	"time"

	"github.com/google/uuid"
)

// SellerConnection is a TSP's request to connect with a seller (workspace).
type SellerConnection struct {
	ID                uuid.UUID  `db:"id"                 json:"id"`
	WorkspaceID       uuid.UUID  `db:"workspace_id"       json:"workspace_id"`
	TransporterID     string     `db:"transporter_id"     json:"transporter_id"` // Cognito sub
	TransporterEmail  string     `db:"transporter_email"  json:"transporter_email"`
	SellerCode        string     `db:"seller_code"        json:"seller_code"`
	Status            string     `db:"status"             json:"status"`
	RequestedAt       time.Time  `db:"requested_at"       json:"requested_at"`
	ResolvedAt        *time.Time `db:"resolved_at"        json:"resolved_at"`
	ResolvedBy        *string    `db:"resolved_by"        json:"resolved_by"`
}

// SensorRequest is a truck integration request awaiting 2-step approval.
type SensorRequest struct {
	ID                 uuid.UUID  `db:"id"                   json:"id"`
	WorkspaceID        uuid.UUID  `db:"workspace_id"         json:"workspace_id"`
	SubmittedBy        string     `db:"submitted_by"         json:"submitted_by"`
	DeviceIMEI         string     `db:"device_imei"          json:"device_imei"`
	RegistrationNo     *string    `db:"registration_no"      json:"registration_no"`
	Status             string     `db:"status"               json:"status"`
	SellerReviewedBy   *string    `db:"seller_reviewed_by"   json:"seller_reviewed_by"`
	SellerReviewedAt   *time.Time `db:"seller_reviewed_at"   json:"seller_reviewed_at"`
	AdminReviewedBy    *string    `db:"admin_reviewed_by"    json:"admin_reviewed_by"`
	AdminReviewedAt    *time.Time `db:"admin_reviewed_at"    json:"admin_reviewed_at"`
	RejectionReason    *string    `db:"rejection_reason"     json:"rejection_reason"`
	CreatedAt          time.Time  `db:"created_at"           json:"created_at"`
}
