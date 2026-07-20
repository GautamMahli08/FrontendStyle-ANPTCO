package ingestion

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"testing"

	"github.com/anptco/location-geofence-service/internal/domain"
	"github.com/aws/aws-lambda-go/events"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

// ---- mock batchProcessor ----------------------------------------------------

type mockBatchProcessor struct {
	processFn func(ctx context.Context, readings []*domain.TelemetryReading) (*BatchResult, error)
	calls     int
}

func (m *mockBatchProcessor) ProcessBatch(ctx context.Context, readings []*domain.TelemetryReading) (*BatchResult, error) {
	m.calls++
	if m.processFn != nil {
		return m.processFn(ctx, readings)
	}
	return &BatchResult{Accepted: len(readings)}, nil
}

// ---- helpers ----------------------------------------------------------------

const testSecret = "super-secret-key"

func sign(body, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(body))
	return hex.EncodeToString(mac.Sum(nil))
}

func minimalBody(n int) string {
	// Build n flespi-formatted messages.
	msgs := "["
	for i := 0; i < n; i++ {
		if i > 0 {
			msgs += ","
		}
		msgs += `{"ident":"dev-1","timestamp":1717200000.0,"position.latitude":55.0,"position.longitude":37.0}`
	}
	return msgs + "]"
}

func newHandlerWithSecret(svc batchProcessor, secret string) *Handler {
	return NewHandler(svc, secret, zap.NewNop())
}

func request(body string, headers map[string]string) events.APIGatewayV2HTTPRequest {
	return events.APIGatewayV2HTTPRequest{Body: body, Headers: headers}
}

// ---- auth tests -------------------------------------------------------------

func TestHandleRequest_ValidHMAC_Returns200(t *testing.T) {
	body := minimalBody(1)
	svc := &mockBatchProcessor{}
	h := newHandlerWithSecret(svc, testSecret)

	resp, err := h.HandleRequest(context.Background(), request(body, map[string]string{
		"x-flespi-signature": sign(body, testSecret),
	}))

	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, 1, svc.calls)
}

func TestHandleRequest_InvalidHMAC_Returns401(t *testing.T) {
	body := minimalBody(1)
	h := newHandlerWithSecret(&mockBatchProcessor{}, testSecret)

	resp, err := h.HandleRequest(context.Background(), request(body, map[string]string{
		"x-flespi-signature": "deadbeef",
	}))

	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestHandleRequest_BearerFallback_ValidToken_Returns200(t *testing.T) {
	body := minimalBody(1)
	svc := &mockBatchProcessor{}
	h := newHandlerWithSecret(svc, testSecret)

	resp, err := h.HandleRequest(context.Background(), request(body, map[string]string{
		"authorization": "Bearer " + testSecret,
	}))

	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, 1, svc.calls)
}

func TestHandleRequest_BearerFallback_WrongToken_Returns401(t *testing.T) {
	h := newHandlerWithSecret(&mockBatchProcessor{}, testSecret)

	resp, err := h.HandleRequest(context.Background(), request(minimalBody(1), map[string]string{
		"authorization": "Bearer wrong-token",
	}))

	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestHandleRequest_NoAuthHeader_Returns401(t *testing.T) {
	h := newHandlerWithSecret(&mockBatchProcessor{}, testSecret)

	resp, err := h.HandleRequest(context.Background(), request(minimalBody(1), map[string]string{}))

	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestHandleRequest_NoSecretConfigured_SkipsAuth(t *testing.T) {
	svc := &mockBatchProcessor{}
	h := newHandlerWithSecret(svc, "") // empty secret → auth disabled

	body := minimalBody(1)
	resp, err := h.HandleRequest(context.Background(), request(body, map[string]string{}))

	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, 1, svc.calls)
}

// ---- payload tests ----------------------------------------------------------

func TestHandleRequest_InvalidJSON_Returns400(t *testing.T) {
	h := newHandlerWithSecret(&mockBatchProcessor{}, "")

	resp, err := h.HandleRequest(context.Background(), request(`not-json`, map[string]string{}))

	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestHandleRequest_MissingRequiredField_DropsRecord(t *testing.T) {
	// A record missing "ident" is skipped (dropped=1) — the batch still returns 200.
	body := `[{"timestamp":1717200000.0,"position.latitude":55.0,"position.longitude":37.0}]`
	svc := &mockBatchProcessor{}
	h := newHandlerWithSecret(svc, "")

	resp, err := h.HandleRequest(context.Background(), request(body, map[string]string{}))

	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Contains(t, resp.Body, `"accepted":0`)
	assert.Contains(t, resp.Body, `"dropped":1`)
}

// ---- processing tests -------------------------------------------------------

func TestHandleRequest_BatchError_Returns500(t *testing.T) {
	svc := &mockBatchProcessor{
		processFn: func(_ context.Context, _ []*domain.TelemetryReading) (*BatchResult, error) {
			return nil, errors.New("db unavailable")
		},
	}
	h := newHandlerWithSecret(svc, "")

	resp, err := h.HandleRequest(context.Background(), request(minimalBody(1), map[string]string{}))

	require.NoError(t, err)
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode,
		"infrastructure error must return 5xx so flespi retries")
}

func TestHandleRequest_ResponseBody_ContainsCounts(t *testing.T) {
	svc := &mockBatchProcessor{
		processFn: func(_ context.Context, readings []*domain.TelemetryReading) (*BatchResult, error) {
			return &BatchResult{Accepted: 3, Dropped: 1}, nil
		},
	}
	h := newHandlerWithSecret(svc, "")

	body := minimalBody(4)
	resp, err := h.HandleRequest(context.Background(), request(body, map[string]string{}))

	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Contains(t, resp.Body, `"accepted":3`)
	assert.Contains(t, resp.Body, `"dropped":1`)
}

func TestHandleRequest_MixedBatch_ParseDropsCombinedWithPipelineDrops(t *testing.T) {
	// 3 records: 1 invalid at parse time, 2 valid sent to ProcessBatch,
	// ProcessBatch drops 1 more (unknown device). Final: accepted=1, dropped=2.
	body := `[
		{"ident":"dev-1","timestamp":1717200000.0,"position.latitude":55.0,"position.longitude":37.0},
		{"timestamp":1717200001.0,"position.latitude":56.0,"position.longitude":38.0},
		{"ident":"dev-3","timestamp":1717200002.0,"position.latitude":57.0,"position.longitude":39.0}
	]`
	svc := &mockBatchProcessor{
		processFn: func(_ context.Context, readings []*domain.TelemetryReading) (*BatchResult, error) {
			assert.Len(t, readings, 2, "only the 2 valid records reach ProcessBatch")
			return &BatchResult{Accepted: 1, Dropped: 1}, nil
		},
	}
	h := newHandlerWithSecret(svc, "")

	resp, err := h.HandleRequest(context.Background(), request(body, map[string]string{}))

	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Contains(t, resp.Body, `"accepted":1`)
	assert.Contains(t, resp.Body, `"dropped":2`)
}

func TestHandleRequest_ContentTypeHeader_IsJSON(t *testing.T) {
	h := newHandlerWithSecret(&mockBatchProcessor{}, "")

	resp, err := h.HandleRequest(context.Background(), request(minimalBody(1), map[string]string{}))

	require.NoError(t, err)
	assert.Equal(t, "application/json", resp.Headers["Content-Type"])
}

func TestHandleRequest_EmptyBatch_Returns200(t *testing.T) {
	svc := &mockBatchProcessor{
		processFn: func(_ context.Context, readings []*domain.TelemetryReading) (*BatchResult, error) {
			assert.Empty(t, readings)
			return &BatchResult{}, nil
		},
	}
	h := newHandlerWithSecret(svc, "")

	resp, err := h.HandleRequest(context.Background(), request(`[]`, map[string]string{}))

	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}
