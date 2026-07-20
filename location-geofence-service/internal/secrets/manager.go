// Package secrets fetches runtime credentials from AWS Secrets Manager.
// It is only called during Lambda cold-start so the SDK round-trip cost is
// amortised across all warm invocations.
package secrets

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/secretsmanager"
)

// Values is the JSON shape expected inside the Secrets Manager secret.
// Store the secret as a single JSON string with these keys:
//
//	{
//	  "database_url":          "postgres://user:pass@host:5432/db?sslmode=require",
//	  "flespi_webhook_secret": "shared-hmac-secret"
//	}
type Values struct {
	DatabaseURL         string `json:"database_url"`
	FlespiWebhookSecret string `json:"flespi_webhook_secret"`
}

// Fetch retrieves the secret at arn and unmarshals it into Values.
// Authentication uses the ambient IAM role attached to the Lambda execution
// environment — no explicit credentials are required in the code.
func Fetch(ctx context.Context, arn string) (*Values, error) {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("secrets: load AWS config: %w", err)
	}

	client := secretsmanager.NewFromConfig(cfg)
	out, err := client.GetSecretValue(ctx, &secretsmanager.GetSecretValueInput{
		SecretId: aws.String(arn),
	})
	if err != nil {
		return nil, fmt.Errorf("secrets: get secret %q: %w", arn, err)
	}
	if out.SecretString == nil {
		return nil, fmt.Errorf("secrets: secret %q has no SecretString value (binary secrets not supported)", arn)
	}

	var v Values
	if err := json.Unmarshal([]byte(*out.SecretString), &v); err != nil {
		return nil, fmt.Errorf("secrets: unmarshal secret %q: %w", arn, err)
	}
	if v.DatabaseURL == "" {
		return nil, fmt.Errorf("secrets: secret %q missing required key database_url", arn)
	}
	if v.FlespiWebhookSecret == "" {
		return nil, fmt.Errorf("secrets: secret %q missing required key flespi_webhook_secret", arn)
	}
	return &v, nil
}
