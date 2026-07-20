package config

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setenv sets env vars for the duration of the test and restores them on cleanup.
func setenv(t *testing.T, pairs ...string) {
	t.Helper()
	if len(pairs)%2 != 0 {
		t.Fatal("setenv: pairs must be key-value pairs")
	}
	for i := 0; i < len(pairs); i += 2 {
		t.Setenv(pairs[i], pairs[i+1])
	}
}

// minimalEnv sets the env vars that are required in every code path.
func minimalEnv(t *testing.T) {
	t.Helper()
	setenv(t,
		"APP_WORKSPACE_DEFAULT", "ws-test",
		"DATABASE_URL", "postgres://localhost/test",
		"FLESPI_WEBHOOK_SECRET", "secret",
	)
}

func TestLoad_AllDirectEnvVars(t *testing.T) {
	minimalEnv(t)
	setenv(t,
		"GEOFENCE_DEST_RADIUS_M", "150",
		"GEOFENCE_DEPOT_RADIUS_M", "300",
		"LOG_LEVEL", "debug",
	)

	cfg, err := Load()
	require.NoError(t, err)

	assert.Equal(t, "ws-test", cfg.AppWorkspaceDefault)
	assert.Equal(t, "postgres://localhost/test", cfg.DatabaseURL)
	assert.Equal(t, "secret", cfg.FlespiWebhookSecret)
	assert.Equal(t, 150, cfg.GeofenceDestRadiusM)
	assert.Equal(t, 300, cfg.GeofenceDepotRadiusM)
	assert.Equal(t, "debug", cfg.LogLevel)
	assert.Equal(t, "", cfg.SecretsARN)
}

func TestLoad_Defaults(t *testing.T) {
	minimalEnv(t)

	cfg, err := Load()
	require.NoError(t, err)

	assert.Equal(t, 100, cfg.GeofenceDestRadiusM)
	assert.Equal(t, 200, cfg.GeofenceDepotRadiusM)
	assert.Equal(t, "info", cfg.LogLevel)
}

func TestLoad_SecretsARN_SkipsSensitiveEnvVars(t *testing.T) {
	// When SECRETS_ARN is set, DATABASE_URL and FLESPI_WEBHOOK_SECRET need
	// not be present — they are resolved later via Secrets Manager.
	setenv(t,
		"APP_WORKSPACE_DEFAULT", "ws-test",
		"SECRETS_ARN", "arn:aws:secretsmanager:eu-west-1:123456789012:secret:my-secret",
	)
	// DATABASE_URL and FLESPI_WEBHOOK_SECRET intentionally absent.

	cfg, err := Load()
	require.NoError(t, err)

	assert.Equal(t, "arn:aws:secretsmanager:eu-west-1:123456789012:secret:my-secret", cfg.SecretsARN)
	assert.Equal(t, "", cfg.DatabaseURL, "DatabaseURL should remain empty until secrets.Fetch populates it")
	assert.Equal(t, "", cfg.FlespiWebhookSecret, "FlespiWebhookSecret should remain empty until secrets.Fetch populates it")
}

func TestLoad_MissingAppWorkspaceDefault_ReturnsError(t *testing.T) {
	setenv(t,
		"DATABASE_URL", "postgres://localhost/test",
		"FLESPI_WEBHOOK_SECRET", "secret",
	)
	// APP_WORKSPACE_DEFAULT intentionally absent.

	_, err := Load()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "APP_WORKSPACE_DEFAULT")
}

func TestLoad_MissingDatabaseURL_NoSecretsARN_ReturnsError(t *testing.T) {
	setenv(t,
		"APP_WORKSPACE_DEFAULT", "ws-test",
		"FLESPI_WEBHOOK_SECRET", "secret",
	)
	// DATABASE_URL intentionally absent; SECRETS_ARN also absent.

	_, err := Load()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "DATABASE_URL")
}

func TestLoad_MissingFlespiSecret_NoSecretsARN_AllowedForLocalDev(t *testing.T) {
	setenv(t,
		"APP_WORKSPACE_DEFAULT", "ws-test",
		"DATABASE_URL", "postgres://localhost/test",
	)
	// FLESPI_WEBHOOK_SECRET intentionally absent — empty disables auth (dev only).

	cfg, err := Load()
	require.NoError(t, err)
	assert.Equal(t, "", cfg.FlespiWebhookSecret)
}

func TestLoad_InvalidGeofenceRadius_IgnoredFallsBackToDefault(t *testing.T) {
	minimalEnv(t)
	setenv(t, "GEOFENCE_DEST_RADIUS_M", "not-a-number")

	cfg, err := Load()
	require.NoError(t, err)
	assert.Equal(t, 100, cfg.GeofenceDestRadiusM, "non-numeric radius should fall back to the default")
}
