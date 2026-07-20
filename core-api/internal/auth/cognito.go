package auth

import (
	"context"
	"fmt"
	"math/rand"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	cognitoSvc "github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider/types"
)

// CognitoClient wraps the Cognito admin API for user management.
type CognitoClient struct {
	svc        *cognitoSvc.Client
	userPoolID string
}

func NewCognitoClient(svc *cognitoSvc.Client, userPoolID string) *CognitoClient {
	return &CognitoClient{svc: svc, userPoolID: userPoolID}
}

// InviteUser creates a Cognito user with the given email, adds them to the
// role group, and sets custom:workspace_id. Cognito sends a temporary-password
// email automatically.
func (c *CognitoClient) InviteUser(ctx context.Context, email, role, workspaceID string) error {
	_, err := c.svc.AdminCreateUser(ctx, &cognitoSvc.AdminCreateUserInput{
		UserPoolId:        &c.userPoolID,
		Username:          &email,
		TemporaryPassword: aws.String(tempPassword()),
		UserAttributes: []types.AttributeType{
			{Name: aws.String("email"), Value: &email},
			{Name: aws.String("email_verified"), Value: aws.String("true")},
			{Name: aws.String("custom:workspace_id"), Value: &workspaceID},
		},
	})
	if err != nil {
		// If user already exists, treat as success so the call is idempotent.
		if isAlreadyExists(err) {
			return nil
		}
		return fmt.Errorf("cognito: create user %s: %w", email, err)
	}

	_, err = c.svc.AdminAddUserToGroup(ctx, &cognitoSvc.AdminAddUserToGroupInput{
		UserPoolId: &c.userPoolID,
		Username:   &email,
		GroupName:  &role,
	})
	if err != nil {
		return fmt.Errorf("cognito: add %s to group %s: %w", email, role, err)
	}
	return nil
}

// SetUserWorkspace updates the custom:workspace_id attribute on an existing user.
// Used by the PostConfirmation trigger to stamp self-registered clients.
func (c *CognitoClient) SetUserWorkspace(ctx context.Context, username, workspaceID string) error {
	_, err := c.svc.AdminUpdateUserAttributes(ctx, &cognitoSvc.AdminUpdateUserAttributesInput{
		UserPoolId: &c.userPoolID,
		Username:   &username,
		UserAttributes: []types.AttributeType{
			{Name: aws.String("custom:workspace_id"), Value: &workspaceID},
		},
	})
	return err
}

// AddToGroup adds an existing user to a Cognito group.
func (c *CognitoClient) AddToGroup(ctx context.Context, username, group string) error {
	_, err := c.svc.AdminAddUserToGroup(ctx, &cognitoSvc.AdminAddUserToGroupInput{
		UserPoolId: &c.userPoolID,
		Username:   &username,
		GroupName:  &group,
	})
	return err
}

func isAlreadyExists(err error) bool {
	return err != nil && strings.Contains(err.Error(), "UsernameExistsException")
}

// tempPassword generates a random temporary password that satisfies Cognito's
// default policy (upper + lower + digit + symbol, ≥8 chars).
func tempPassword() string {
	const letters = "abcdefghijklmnopqrstuvwxyz"
	const uppers = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
	const digits = "0123456789"
	const symbols = "!@#$"

	b := make([]byte, 12)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	b[0] = uppers[rand.Intn(len(uppers))]
	b[1] = digits[rand.Intn(len(digits))]
	b[2] = symbols[rand.Intn(len(symbols))]
	return string(b)
}
