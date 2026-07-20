package ingestion

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	validIdent     = "867787031234567"
	validTimestamp = 1717200000.5 // 2024-06-01T00:00:00.5Z approx
	validLat       = 55.7558
	validLon       = 37.6176
)

func TestParseFlespiBody_ArrayFormat(t *testing.T) {
	body := `[
		{
			"ident": "867787031234567",
			"timestamp": 1717200000.5,
			"position.latitude": 55.7558,
			"position.longitude": 37.6176,
			"position.speed": 60,
			"engine.ignition.status": true,
			"can.fuel.total.level": 250.5
		}
	]`

	readings, dropped, err := parseFlespiBody([]byte(body))
	require.NoError(t, err)
	assert.Equal(t, 0, dropped)
	require.Len(t, readings, 1)

	r := readings[0]
	assert.Equal(t, "867787031234567", r.DeviceID)
	assert.InDelta(t, validLat, r.Latitude, 0.000001)
	assert.InDelta(t, validLon, r.Longitude, 0.000001)
	assert.NotNil(t, r.Speed)
	assert.Equal(t, 60, *r.Speed)
	assert.NotNil(t, r.IgnitionOn)
	assert.True(t, *r.IgnitionOn)
	assert.NotNil(t, r.TotalFuelLiters)
	assert.InDelta(t, 250.5, *r.TotalFuelLiters, 0.001)

	// Timestamp: 1717200000.5 → second=1717200000, nsec=500000000
	wantSec := int64(1717200000)
	assert.Equal(t, wantSec, r.Timestamp.Unix())
	assert.Equal(t, time.UTC, r.Timestamp.Location())
}

func TestParseFlespiBody_WrapperFormat(t *testing.T) {
	body := `{"messages": [
		{
			"ident": "device-001",
			"timestamp": 1717200001.0,
			"position.latitude": 55.0,
			"position.longitude": 37.0
		}
	]}`

	readings, dropped, err := parseFlespiBody([]byte(body))
	require.NoError(t, err)
	assert.Equal(t, 0, dropped)
	require.Len(t, readings, 1)
	assert.Equal(t, "device-001", readings[0].DeviceID)
}

func TestParseFlespiBody_EmptyArray(t *testing.T) {
	readings, dropped, err := parseFlespiBody([]byte(`[]`))
	require.NoError(t, err)
	assert.Equal(t, 0, dropped)
	assert.Empty(t, readings)
}

func TestParseFlespiBody_InvalidJSON(t *testing.T) {
	_, _, err := parseFlespiBody([]byte(`not json`))
	assert.Error(t, err)
}

func TestParseFlespiBody_MultipleMsgs(t *testing.T) {
	body := `[
		{"ident":"dev-1","timestamp":1717200000.0,"position.latitude":55.0,"position.longitude":37.0},
		{"ident":"dev-2","timestamp":1717200001.0,"position.latitude":56.0,"position.longitude":38.0}
	]`

	readings, dropped, err := parseFlespiBody([]byte(body))
	require.NoError(t, err)
	assert.Equal(t, 0, dropped)
	require.Len(t, readings, 2)
	assert.Equal(t, "dev-1", readings[0].DeviceID)
	assert.Equal(t, "dev-2", readings[1].DeviceID)
}

func TestParseFlespiBody_OptionalFieldsAbsent(t *testing.T) {
	body := `[{"ident":"dev-1","timestamp":1717200000.0,"position.latitude":55.0,"position.longitude":37.0}]`

	readings, dropped, err := parseFlespiBody([]byte(body))
	require.NoError(t, err)
	assert.Equal(t, 0, dropped)
	require.Len(t, readings, 1)
	r := readings[0]

	assert.Nil(t, r.Speed, "speed should be nil when absent")
	assert.Nil(t, r.IgnitionOn, "ignition should be nil when absent")
	assert.Nil(t, r.TotalFuelLiters, "fuel should be nil when absent")
}

// TestParseFlespiBody_MissingRequiredField_* — a record missing a required field
// is skipped (dropped=1) rather than aborting the whole batch.

func TestParseFlespiBody_MissingIdent(t *testing.T) {
	body := `[{"timestamp":1717200000.0,"position.latitude":55.0,"position.longitude":37.0}]`
	readings, dropped, err := parseFlespiBody([]byte(body))
	require.NoError(t, err)
	assert.Equal(t, 1, dropped)
	assert.Empty(t, readings)
}

func TestParseFlespiBody_MissingTimestamp(t *testing.T) {
	body := `[{"ident":"dev-1","position.latitude":55.0,"position.longitude":37.0}]`
	readings, dropped, err := parseFlespiBody([]byte(body))
	require.NoError(t, err)
	assert.Equal(t, 1, dropped)
	assert.Empty(t, readings)
}

func TestParseFlespiBody_MissingLatitude(t *testing.T) {
	body := `[{"ident":"dev-1","timestamp":1717200000.0,"position.longitude":37.0}]`
	readings, dropped, err := parseFlespiBody([]byte(body))
	require.NoError(t, err)
	assert.Equal(t, 1, dropped)
	assert.Empty(t, readings)
}

func TestParseFlespiBody_MissingLongitude(t *testing.T) {
	body := `[{"ident":"dev-1","timestamp":1717200000.0,"position.latitude":55.0}]`
	readings, dropped, err := parseFlespiBody([]byte(body))
	require.NoError(t, err)
	assert.Equal(t, 1, dropped)
	assert.Empty(t, readings)
}

// TestParseFlespiBody_MixedValidInvalid — the key new behaviour: valid records
// are returned and the invalid one is counted as dropped, not an error.
func TestParseFlespiBody_MixedValidInvalid(t *testing.T) {
	body := `[
		{"ident":"dev-1","timestamp":1717200000.0,"position.latitude":55.0,"position.longitude":37.0},
		{"timestamp":1717200001.0,"position.latitude":56.0,"position.longitude":38.0},
		{"ident":"dev-3","timestamp":1717200002.0,"position.latitude":57.0,"position.longitude":39.0}
	]`

	readings, dropped, err := parseFlespiBody([]byte(body))
	require.NoError(t, err)
	assert.Equal(t, 1, dropped, "middle record missing ident should be dropped")
	require.Len(t, readings, 2)
	assert.Equal(t, "dev-1", readings[0].DeviceID)
	assert.Equal(t, "dev-3", readings[1].DeviceID)
}

func TestParseFlespiBody_TimestampPrecision(t *testing.T) {
	// Timestamp 1717200000.75 → 750ms sub-second
	body := `[{"ident":"d","timestamp":1717200000.75,"position.latitude":1.0,"position.longitude":2.0}]`

	readings, dropped, err := parseFlespiBody([]byte(body))
	require.NoError(t, err)
	assert.Equal(t, 0, dropped)
	ts := readings[0].Timestamp
	assert.Equal(t, int64(1717200000), ts.Unix())
	// 0.75 seconds = 750 000 000 ns; allow small floating-point rounding
	assert.InDelta(t, 750_000_000, ts.Nanosecond(), 1000)
}

func TestParseFlespiBody_CompartmentFuelChannels(t *testing.T) {
	// user_channel.* fields produced by a flespi calculator are collected
	// as per-compartment fuel readings. Non-user_channel fields are ignored.
	body := `[{
		"ident": "dev-1",
		"timestamp": 1717200000.0,
		"position.latitude": 55.0,
		"position.longitude": 37.0,
		"user_channel.compartment_1": 150.25,
		"user_channel.compartment_2": 87.0,
		"io.4.value": 999
	}]`

	readings, dropped, err := parseFlespiBody([]byte(body))
	require.NoError(t, err)
	assert.Equal(t, 0, dropped)
	require.Len(t, readings, 1)

	cf := readings[0].CompartmentFuel
	require.NotNil(t, cf, "compartment fuel map should be populated")
	assert.InDelta(t, 150.25, cf["compartment_1"], 0.001)
	assert.InDelta(t, 87.0, cf["compartment_2"], 0.001)
	assert.NotContains(t, cf, "io.4.value", "non-user_channel field must not appear in compartment fuel")
}

func TestParseFlespiBody_NoCompartmentChannels_NilMap(t *testing.T) {
	body := `[{"ident":"dev-1","timestamp":1717200000.0,"position.latitude":55.0,"position.longitude":37.0}]`

	readings, dropped, err := parseFlespiBody([]byte(body))
	require.NoError(t, err)
	assert.Equal(t, 0, dropped)
	assert.Nil(t, readings[0].CompartmentFuel, "CompartmentFuel should be nil when no user_channel fields present")
}
