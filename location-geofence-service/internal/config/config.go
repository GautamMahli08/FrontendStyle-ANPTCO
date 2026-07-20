package config

import (
	"fmt"
	"os"
	"strconv"
)

// Config holds all runtime configuration.
//
// Sensitive values (DatabaseURL, FlespiWebhookSecret) come from one of two sources:
//
//  1. Environment variables DATABASE_URL and FLESPI_WEBHOOK_SECRET — for local
//     development and CI.
//
//  2. AWS Secrets Manager — when SECRETS_ARN is set. In this case the two env
//     vars above may be absent; main resolves them by calling secrets.Fetch and
//     writing the results back into Config before using it.
type Config struct {
	DatabaseURL          string
	FlespiWebhookSecret  string
	AppWorkspaceDefault  string
	GeofenceDestRadiusM  int
	GeofenceDepotRadiusM int
	LogLevel             string

	// SecretsARN, when non-empty, tells main to resolve DatabaseURL and
	// FlespiWebhookSecret from AWS Secrets Manager instead of env vars.
	SecretsARN string

	// EventBusName is the name of the EventBridge custom bus that receives
	// lifecycle notifications (OrderArrived, OrderCompleted). Empty disables
	// notifications (NoopNotifier) — safe for local development.
	EventBusName string

	// DefaultDeviceIdent is the IMEI/ident to use when a flespi message does
	// not include the "ident" field. This happens when the flespi stream plugin
	// is not configured to forward ident. Set via DEFAULT_DEVICE_IDENT env var.
	DefaultDeviceIdent string

	// TelemetryRetentionDays is the number of days to retain raw telemetry rows.
	// The maintenance Lambda drops truck_telemetry partitions whose entire date
	// range falls before now-TelemetryRetentionDays. Default: 90.
	TelemetryRetentionDays int
}

// Load reads configuration from environment variables.
// When SECRETS_ARN is set, DatabaseURL and FlespiWebhookSecret are left empty
// and must be populated by the caller via secrets.Fetch.
// When SECRETS_ARN is not set both fields are required.
func Load() (*Config, error) {
	secretsARN := os.Getenv("SECRETS_ARN")

	cfg := &Config{
		SecretsARN:           secretsARN,
		GeofenceDestRadiusM:  envInt("GEOFENCE_DEST_RADIUS_M", 100),
		GeofenceDepotRadiusM: envInt("GEOFENCE_DEPOT_RADIUS_M", 100),
		LogLevel:               envStr("LOG_LEVEL", "info"),
		EventBusName:           os.Getenv("EVENTS_BUS_NAME"),
		DefaultDeviceIdent:     os.Getenv("DEFAULT_DEVICE_IDENT"),
		TelemetryRetentionDays: envInt("TELEMETRY_RETENTION_DAYS", 90),
	}

	var err error
	cfg.AppWorkspaceDefault, err = requireEnv("APP_WORKSPACE_DEFAULT")
	if err != nil {
		return nil, err
	}

	if secretsARN == "" {
		// No Secrets Manager — DATABASE_URL is required; webhook secret is
		// optional (empty disables auth, useful for local development).
		cfg.DatabaseURL, err = requireEnv("DATABASE_URL")
		if err != nil {
			return nil, err
		}
		cfg.FlespiWebhookSecret = os.Getenv("FLESPI_WEBHOOK_SECRET")
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
