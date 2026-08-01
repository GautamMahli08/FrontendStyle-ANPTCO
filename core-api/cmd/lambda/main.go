package main

import (
	"context"
	"encoding/hex"
	"log"

	"github.com/anptco/core-api/internal/api"
	"github.com/anptco/core-api/internal/auth"
	"github.com/anptco/core-api/internal/config"
	"github.com/anptco/core-api/internal/db"
	"github.com/anptco/core-api/internal/logger"
	"github.com/anptco/core-api/internal/notify"
	pgrepo "github.com/anptco/core-api/internal/repository/postgres"
	"github.com/anptco/core-api/internal/secrets"
	"github.com/anptco/core-api/internal/storage"
	awscfg "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	cognitosvc "github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
	"go.uber.org/zap"
)

func main() {
	ctx := context.Background()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	if cfg.SecretsARN != "" {
		sec, err := secrets.Fetch(ctx, cfg.SecretsARN)
		if err != nil {
			log.Fatalf("secrets: %v", err)
		}
		cfg.DatabaseURL = sec.DatabaseURL
		if sec.QRSigningKey != "" {
			key, decErr := hex.DecodeString(sec.QRSigningKey)
			if decErr != nil {
				log.Fatalf("secrets: qr_signing_key is not valid hex: %v", decErr)
			}
			cfg.QRSigningKey = key
		}
	}

	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL is not set (set directly or via SECRETS_ARN)")
	}

	zlog, err := logger.New(cfg.LogLevel)
	if err != nil {
		log.Fatalf("logger: %v", err)
	}
	defer zlog.Sync() //nolint:errcheck

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}

	// S3 store — optional; disabled when QR_BUCKET is not set.
	var s3Store *storage.S3Store
	if cfg.QRBucket != "" {
		s3Store, err = storage.NewS3Store(ctx, cfg.QRBucket, cfg.KYCBucket, cfg.CDNBaseURL)
		if err != nil {
			log.Fatalf("s3: %v", err)
		}
	}

	// Email sender — optional; noop when SES_FROM_ADDRESS is not set.
	var emailSender notify.EmailSender = notify.NoopEmailSender{}
	if cfg.SESFromAddress != "" {
		emailSender, err = notify.NewSESEmailSender(ctx, cfg.SESFromAddress)
		if err != nil {
			log.Fatalf("ses: %v", err)
		}
	}

	// Cognito client — optional; nil disables invite API.
	var cognitoClient *auth.CognitoClient
	if cfg.UserPoolID != "" {
		awsCfg, err := awscfg.LoadDefaultConfig(ctx)
		if err != nil {
			log.Fatalf("aws config: %v", err)
		}
		cognitoClient = auth.NewCognitoClient(cognitosvc.NewFromConfig(awsCfg), cfg.UserPoolID)
	}

	truckRepo        := pgrepo.NewTruckRepository(pool)
	orderRepo        := pgrepo.NewOrderRepository(pool)
	tripRepo         := pgrepo.NewTripRepository(pool)
	onboardingRepo   := pgrepo.NewOnboardingRepository(pool)
	geofenceRepo     := pgrepo.NewGeofenceRepository(pool)
	workspaceRepo    := pgrepo.NewWorkspaceRepository(pool)
	adminRepo        := pgrepo.NewAdminRepository(pool)
	deviceRepo       := pgrepo.NewDeviceRepository(pool)
	apiKeyRepo       := pgrepo.NewAPIKeyRepository(pool)
	qrCodeRepo       := pgrepo.NewQRCodeRepository(pool)
	deliveryNoteRepo := pgrepo.NewDeliveryNoteRepository(pool)

	handler := api.NewHandler(
		pool, truckRepo, orderRepo, tripRepo, onboardingRepo,
		geofenceRepo, workspaceRepo, adminRepo, deviceRepo, apiKeyRepo,
		qrCodeRepo, deliveryNoteRepo, cognitoClient, s3Store, emailSender, zlog,
		cfg.DevWorkspaceID, cfg.QRSigningKey,
	)

	if cfg.DevWorkspaceID != "" {
		zlog.Warn("DEV_WORKSPACE_ID set — JWT auth bypassed (development only)",
			zap.String("dev_workspace_id", cfg.DevWorkspaceID),
		)
	}

	lambda.Start(func(ctx context.Context, req events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
		return handler.HandleRequest(ctx, req)
	})
}
