package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	DatabaseURL string
	SecretsARN  string
	LogLevel    string

	// DevWorkspaceID bypasses JWT auth and pins every request to this workspace.
	// For local development only — leave empty in production.
	DevWorkspaceID string

	// S3 / CloudFront
	QRBucket   string
	KYCBucket  string
	CDNBaseURL string // CloudFront base URL for QR PNGs, no trailing slash

	// SES — optional; empty disables email notifications.
	SESFromAddress string

	// Cognito — required for invite API and signup trigger.
	UserPoolID string

	// QRSigningKey is the raw bytes of the HMAC-SHA256 key used to sign/verify
	// versioned QR tokens. Populated from Secrets Manager at startup.
	// Empty disables 4-gate QR verification (falls back to naive truck-id check).
	QRSigningKey []byte
}

func Load() (*Config, error) {
	secretsARN := os.Getenv("SECRETS_ARN")

	cfg := &Config{
		SecretsARN:     secretsARN,
		LogLevel:       envStr("LOG_LEVEL", "info"),
		DevWorkspaceID: os.Getenv("DEV_WORKSPACE_ID"),
		QRBucket:       os.Getenv("QR_BUCKET"),
		KYCBucket:      os.Getenv("KYC_BUCKET"),
		CDNBaseURL:     os.Getenv("CDN_BASE_URL"),
		SESFromAddress: os.Getenv("SES_FROM_ADDRESS"),
		UserPoolID:     os.Getenv("USER_POOL_ID"),
	}

	if secretsARN == "" {
		var err error
		cfg.DatabaseURL, err = requireEnv("DATABASE_URL")
		if err != nil {
			return nil, err
		}
	}

	return cfg, nil
}

func requireEnv(key string) (string, error) {
	v := os.Getenv(key)
	if v == "" {
		return "", fmt.Errorf("required environment variable %q is not set", key)
	}
	return v, nil
}

func envStr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

// suppress unused lint for envInt — kept for future use
var _ = envInt
