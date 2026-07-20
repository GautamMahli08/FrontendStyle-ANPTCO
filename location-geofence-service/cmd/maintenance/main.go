package main

import (
	"context"
	"log"

	"github.com/anptco/location-geofence-service/internal/config"
	"github.com/anptco/location-geofence-service/internal/db"
	"github.com/anptco/location-geofence-service/internal/logger"
	"github.com/anptco/location-geofence-service/internal/maintenance"
	"github.com/anptco/location-geofence-service/internal/secrets"
	"github.com/aws/aws-lambda-go/lambda"
	"go.uber.org/zap"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	if cfg.SecretsARN != "" {
		sec, err := secrets.Fetch(context.Background(), cfg.SecretsARN)
		if err != nil {
			log.Fatalf("secrets: %v", err)
		}
		cfg.DatabaseURL = sec.DatabaseURL
		cfg.FlespiWebhookSecret = sec.FlespiWebhookSecret
	}
	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL is not set (set directly or via SECRETS_ARN)")
	}

	zlog, err := logger.New(cfg.LogLevel)
	if err != nil {
		log.Fatalf("logger: %v", err)
	}
	defer zlog.Sync() //nolint:errcheck

	pool, err := db.Connect(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}

	lambda.Start(func(ctx context.Context) error {
		zlog.Info("maintenance run started",
			zap.Int("retention_days", cfg.TelemetryRetentionDays),
		)

		// Ensure partitions exist for the current month and the next 3.
		if err := maintenance.EnsureUpcomingPartitions(ctx, pool, 3, zlog); err != nil {
			return err
		}

		// Drop partitions whose entire range is outside the retention window.
		if err := maintenance.DropOldPartitions(ctx, pool, cfg.TelemetryRetentionDays, zlog); err != nil {
			return err
		}

		zlog.Info("maintenance run complete",
			zap.Int("retention_days", cfg.TelemetryRetentionDays),
		)
		return nil
	})
}
