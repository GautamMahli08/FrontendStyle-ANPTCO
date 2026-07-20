// Package main implements the Cognito PostConfirmation trigger Lambda.
// It runs whenever a user confirms their account via self-signup (email link).
// It auto-assigns a new UUID workspace_id and adds the user to the CLIENT group.
// Admin-invited users already have custom:workspace_id set, so they are skipped.
package main

import (
	"context"
	"log"
	"os"

	"github.com/anptco/core-api/internal/auth"
	awscfg "github.com/aws/aws-sdk-go-v2/config"
	cognitosvc "github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/google/uuid"
)

// CognitoEvent is the payload Cognito sends to PostConfirmation triggers.
type CognitoEvent struct {
	TriggerSource string `json:"triggerSource"`
	UserPoolId    string `json:"userPoolId"`
	UserName      string `json:"userName"`
	Request       struct {
		UserAttributes map[string]string `json:"userAttributes"`
	} `json:"request"`
	Response map[string]interface{} `json:"response"`
}

var cognitoClient *auth.CognitoClient

func init() {
	ctx := context.Background()
	cfg, err := awscfg.LoadDefaultConfig(ctx)
	if err != nil {
		log.Fatalf("signup lambda: aws config: %v", err)
	}
	userPoolID := os.Getenv("USER_POOL_ID")
	if userPoolID == "" {
		log.Fatal("signup lambda: USER_POOL_ID env var not set")
	}
	cognitoClient = auth.NewCognitoClient(cognitosvc.NewFromConfig(cfg), userPoolID)
}

func handler(ctx context.Context, event CognitoEvent) (CognitoEvent, error) {
	// Only handle email/self-signup confirmation, not admin-created users.
	if event.TriggerSource != "PostConfirmation_ConfirmSignUp" {
		return event, nil
	}

	// Skip users that already have a workspace_id (invited via invite API).
	if event.Request.UserAttributes["custom:workspace_id"] != "" {
		return event, nil
	}

	workspaceID := uuid.New().String()

	if err := cognitoClient.SetUserWorkspace(ctx, event.UserName, workspaceID); err != nil {
		// Log but don't fail — the user is already confirmed; we can fix attributes later.
		log.Printf("signup: set workspace_id for %s: %v", event.UserName, err)
		return event, nil
	}

	if err := cognitoClient.AddToGroup(ctx, event.UserName, auth.RoleClient); err != nil {
		log.Printf("signup: add %s to CLIENT group: %v", event.UserName, err)
	}

	return event, nil
}

func main() {
	lambda.Start(handler)
}
