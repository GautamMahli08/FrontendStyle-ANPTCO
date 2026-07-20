package secrets

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/secretsmanager"
)

// Values is the JSON shape of the Secrets Manager secret.
// Matches the same secret used by the ingestion service:
//
//	{"database_url": "postgres://...", "flespi_webhook_secret": "..."}
//
// Only database_url is required here; extra keys are ignored.
type Values struct {
	DatabaseURL string `json:"database_url"`
}

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
		return nil, fmt.Errorf("secrets: get %q: %w", arn, err)
	}
	if out.SecretString == nil {
		return nil, fmt.Errorf("secrets: %q has no SecretString", arn)
	}

	var v Values
	if err := json.Unmarshal([]byte(*out.SecretString), &v); err != nil {
		return nil, fmt.Errorf("secrets: unmarshal %q: %w", arn, err)
	}
	if v.DatabaseURL == "" {
		return nil, fmt.Errorf("secrets: %q missing database_url", arn)
	}
	return &v, nil
}
