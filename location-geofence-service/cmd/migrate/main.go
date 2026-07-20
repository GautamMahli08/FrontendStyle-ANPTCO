package main

import (
	"context"
	"fmt"
	"log"

	"github.com/anptco/location-geofence-service/internal/config"
	"github.com/anptco/location-geofence-service/internal/db"
	"github.com/anptco/location-geofence-service/internal/secrets"
	"github.com/anptco/location-geofence-service/migrations"
	"github.com/aws/aws-lambda-go/lambda"
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
		log.Fatal("DATABASE_URL is not set")
	}

	pool, err := db.Connect(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}

	lambda.Start(func(ctx context.Context) (string, error) {
		n, err := migrations.Run(ctx, pool)
		if err != nil {
			return "", fmt.Errorf("migration failed: %w", err)
		}
		return fmt.Sprintf("applied %d migration(s)", n), nil
	})
}
