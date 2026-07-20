package main

import (
	"context"
	"log"

	"github.com/anptco/location-geofence-service/internal/config"
	"github.com/anptco/location-geofence-service/internal/db"
	"github.com/anptco/location-geofence-service/internal/geofence"
	"github.com/anptco/location-geofence-service/internal/ingestion"
	"github.com/anptco/location-geofence-service/internal/location"
	"github.com/anptco/location-geofence-service/internal/logger"
	"github.com/anptco/location-geofence-service/internal/notify"
	pgrepo "github.com/anptco/location-geofence-service/internal/repository/postgres"
	"github.com/anptco/location-geofence-service/internal/secrets"
	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-lambda-go/lambdacontext"
	"go.uber.org/zap"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	// ── Secrets Manager ──────────────────────────────────────────────────────
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
	if cfg.FlespiWebhookSecret == "" {
		log.Println("WARNING: FLESPI_WEBHOOK_SECRET is empty — webhook auth disabled (development only)")
	}

	// ── Logger ───────────────────────────────────────────────────────────────
	zlog, err := logger.New(cfg.LogLevel)
	if err != nil {
		log.Fatalf("logger: %v", err)
	}
	defer zlog.Sync() //nolint:errcheck

	// ── Database ─────────────────────────────────────────────────────────────
	pool, err := db.Connect(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}

	// ── Notifications ────────────────────────────────────────────────────────
	var notifier notify.Notifier = notify.NoopNotifier{}
	if cfg.EventBusName != "" {
		eb, err := notify.NewEventBridgeNotifier(context.Background(), cfg.EventBusName)
		if err != nil {
			log.Fatalf("notifications: %v", err)
		}
		notifier = eb
		zlog.Info("EventBridge notifications enabled", zap.String("bus", cfg.EventBusName))
	} else {
		zlog.Info("EventBridge notifications disabled (EVENTS_BUS_NAME not set)")
	}

	// ── Repository layer ─────────────────────────────────────────────────────
	truckRepo := pgrepo.NewTruckRepository(pool)
	telemetryRepo := pgrepo.NewTelemetryRepository(pool)
	liveStateRepo := pgrepo.NewLiveStateRepository(pool)
	assetEventRepo := pgrepo.NewAssetEventRepository(pool)
	geofenceRepo := pgrepo.NewGeofenceRepository(pool)
	eventRepo := pgrepo.NewGeofenceEventRepository(pool)
	tripRepo := pgrepo.NewTripRepository(pool)
	tx := pgrepo.NewTransactor(pool)

	// ── Domain services ──────────────────────────────────────────────────────
	deviceCache := location.NewDeviceCache()
	locationSvc := location.NewService(truckRepo, telemetryRepo, liveStateRepo, assetEventRepo, deviceCache, zlog)
	geofenceSvc := geofence.NewService(
		geofenceRepo, eventRepo, tripRepo, tx, zlog,
		cfg.GeofenceDestRadiusM, cfg.GeofenceDepotRadiusM,
		notifier,
	)

	// ── Lambda handler ───────────────────────────────────────────────────────
	ingestSvc := ingestion.NewService(locationSvc, geofenceSvc, zlog)
	handler := ingestion.NewHandler(ingestSvc, cfg.FlespiWebhookSecret, cfg.DefaultDeviceIdent, zlog)

	lambda.Start(withRequestLog(handler, zlog))
}

func withRequestLog(
	h *ingestion.Handler,
	log *zap.Logger,
) func(ctx context.Context, req events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	return func(ctx context.Context, req events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
		requestID := ""
		if lctx, ok := lambdacontext.FromContext(ctx); ok {
			requestID = lctx.AwsRequestID
		}

		log.Info("invocation start",
			zap.String("request_id", requestID),
			zap.String("method", req.RequestContext.HTTP.Method),
			zap.String("path", req.RawPath),
			zap.String("source_ip", req.RequestContext.HTTP.SourceIP),
		)

		resp, err := h.HandleRequest(ctx, req)

		log.Info("invocation end",
			zap.String("request_id", requestID),
			zap.Int("status", resp.StatusCode),
		)

		return resp, err
	}
}
