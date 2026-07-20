package ingestion

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"

	"github.com/anptco/location-geofence-service/internal/domain"
	"github.com/aws/aws-lambda-go/events"
	"go.uber.org/zap"
)

// batchProcessor is satisfied by *Service. Defined as a narrow interface so
// the handler is independently testable without a real ingestion.Service.
type batchProcessor interface {
	ProcessBatch(ctx context.Context, readings []*domain.TelemetryReading) (*BatchResult, error)
}

// Handler is the Lambda entry point for API Gateway HTTP API POST requests
// arriving from the flespi webhook stream.
type Handler struct {
	svc          batchProcessor
	secret       string
	defaultIdent string // fallback when flespi stream omits the "ident" field
	log          *zap.Logger
}

// NewHandler wires the HTTP handler with its dependencies.
func NewHandler(svc batchProcessor, webhookSecret, defaultDeviceIdent string, log *zap.Logger) *Handler {
	return &Handler{svc: svc, secret: webhookSecret, defaultIdent: defaultDeviceIdent, log: log}
}

// HandleRequest satisfies the aws-lambda-go handler signature for API Gateway
// v2 (HTTP API) events. It is registered as the Lambda handler in main.
//
// Return semantics: always return a non-nil response (never return the error);
// a 5xx status causes flespi to retry the batch.

func (h *Handler) HandleRequest(ctx context.Context, req events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	h.log.Info("headers received", zap.Any("headers", req.Headers))
	h.log.Info("raw payload",
    zap.String("body", req.Body),
)
	if err := h.verifySignature(req); err != nil {
		h.log.Warn("webhook auth failed", zap.Error(err))
		return jsonResponse(http.StatusUnauthorized, `{"error":"unauthorized"}`), nil
	}

	readings, parseDropped, err := parseFlespiBody([]byte(req.Body), h.defaultIdent)
	if err != nil {
		h.log.Warn("payload parse error", zap.Error(err))
		return jsonResponse(http.StatusBadRequest, `{"error":"invalid payload"}`), nil
	}
	if parseDropped > 0 {
		h.log.Warn("records skipped during parse",
			zap.Int("parse_dropped", parseDropped),
			zap.Int("parse_accepted", len(readings)),
		)
	}

	result, err := h.svc.ProcessBatch(ctx, readings)
	if err != nil {
		h.log.Error("batch processing error", zap.Error(err))
		// 500 → flespi retries; the store-and-forward stream prevents data loss.
		return jsonResponse(http.StatusInternalServerError, `{"error":"internal error"}`), nil
	}

	totalDropped := result.Dropped + parseDropped
	h.log.Info("batch complete",
		zap.Int("total", len(readings)+parseDropped),
		zap.Int("accepted", result.Accepted),
		zap.Int("dropped", totalDropped),
	)

	body := fmt.Sprintf(`{"accepted":%d,"dropped":%d}`, result.Accepted, totalDropped)
	return jsonResponse(http.StatusOK, body), nil
}

// verifySignature validates the inbound request against the shared webhook
// secret. Two auth schemes are supported:
//
//  1. HMAC-SHA256 over the raw body in X-Flespi-Signature (preferred).
//  2. Bearer token in Authorization as a simpler fallback.
func (h *Handler) verifySignature(req events.APIGatewayV2HTTPRequest) error {
	if h.secret == "" {
		return nil // no secret configured; skip auth (development only)
	}

	// API Gateway HTTP API v2 lowercases all headers in production.
	// SAM local preserves the original case sent by the client, so normalise
	// here to make local and production behaviour identical.
	headers := make(map[string]string, len(req.Headers))
	for k, v := range req.Headers {
		headers[strings.ToLower(k)] = v
	}

	if sig, ok := headers["x-flespi-signature"]; ok {
		mac := hmac.New(sha256.New, []byte(h.secret))
		mac.Write([]byte(req.Body))
		expected := hex.EncodeToString(mac.Sum(nil))
		if !hmac.Equal([]byte(sig), []byte(expected)) {
			return fmt.Errorf("HMAC mismatch")
		}
		return nil
	}

	if auth, ok := headers["authorization"]; ok {
		if auth == "Bearer "+h.secret {
			return nil
		}
		return fmt.Errorf("invalid bearer token")
	}

	return fmt.Errorf("no auth header present")
}

func jsonResponse(status int, body string) events.APIGatewayV2HTTPResponse {
	return events.APIGatewayV2HTTPResponse{
		StatusCode: status,
		Headers:    map[string]string{"Content-Type": "application/json"},
		Body:       body,
	}
}
