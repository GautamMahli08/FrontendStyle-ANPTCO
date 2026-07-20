package auth

import "strings"

// Role names match Cognito group names exactly.
const (
	RolePlatformAdmin  = "PLATFORM_ADMIN"
	RoleSellerManager  = "SELLER_MANAGER"
	RoleTransportAdmin = "TRANSPORT_ADMIN"
	RoleClient         = "CLIENT"
	RoleDriver         = "DRIVER"
	RoleERPClient      = "ERP_CLIENT" // Mode B client portal users
)

// Claims holds the parsed JWT claims injected by the API Gateway JWT authorizer.
type Claims struct {
	WorkspaceID string
	Groups      []string // from cognito:groups
	Email       string
	Sub         string
}

// ParseClaims extracts the fields we care about from the raw JWT claims map
// provided by API Gateway's authorizer context.
func ParseClaims(raw map[string]string) Claims {
	c := Claims{
		WorkspaceID: raw["custom:workspace_id"],
		Email:       raw["email"],
		Sub:         raw["sub"],
	}
	// API Gateway passes the Cognito groups array as a bracketed string:
	// "[ROLE_A, ROLE_B]" or "[ROLE_A]". Strip brackets before splitting.
	if g := raw["cognito:groups"]; g != "" {
		g = strings.TrimSpace(g)
		g = strings.TrimPrefix(g, "[")
		g = strings.TrimSuffix(g, "]")
		for _, grp := range strings.Split(g, ",") {
			if t := strings.TrimSpace(grp); t != "" {
				c.Groups = append(c.Groups, t)
			}
		}
	}
	return c
}

// HasAnyRole reports whether the caller belongs to at least one of the given roles.
func (c Claims) HasAnyRole(roles ...string) bool {
	for _, ug := range c.Groups {
		for _, r := range roles {
			if ug == r {
				return true
			}
		}
	}
	return false
}
