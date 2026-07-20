package ingestion

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/anptco/location-geofence-service/internal/domain"
)

// parseFlespiBody converts the raw flespi webhook POST body into a slice of
// domain TelemetryReadings. The function accepts two payload shapes:
//
//   - A top-level JSON array (standard flespi webhook stream output).
//   - A JSON object with a "messages" key (alternative wrapper format).
//
// Structural errors (unrecognised envelope format) are returned as an error so
// the caller can reject the whole request. Per-record parse failures (missing
// required field, malformed JSON on a single message) are skipped — the record
// is counted in dropped and the rest of the batch continues.
func parseFlespiBody(body []byte, defaultIdent string) ([]*domain.TelemetryReading, int, error) {
	rawMsgs, err := extractRawMessages(body)
	if err != nil {
		return nil, 0, err
	}

	readings := make([]*domain.TelemetryReading, 0, len(rawMsgs))
	dropped := 0
	for _, raw := range rawMsgs {
		msg, err := parseRawMessage(raw, defaultIdent)
		if err != nil {
			dropped++
			continue
		}
		readings = append(readings, toTelemetryReading(msg))
	}
	return readings, dropped, nil
}

// extractRawMessages returns the slice of raw JSON message objects from the
// body, regardless of which flespi envelope format was used.
func extractRawMessages(body []byte) ([]json.RawMessage, error) {
	// Try top-level array first — the standard flespi webhook stream format.
	var arr []json.RawMessage
	if err := json.Unmarshal(body, &arr); err == nil {
		return arr, nil
	}

	// Fall back to {"messages": [...]} wrapper format.
	var wrapper struct {
		Messages []json.RawMessage `json:"messages"`
	}
	if err := json.Unmarshal(body, &wrapper); err != nil {
		return nil, fmt.Errorf("parse flespi payload: unsupported envelope format: %w", err)
	}
	return wrapper.Messages, nil
}

// flatFields is the intermediate map used when parsing a single flespi message.
// Flespi delivers messages as flat JSON objects where keys use dot-notation
// literals (e.g. "position.latitude") rather than nested JSON. Using a
// map[string]json.RawMessage lets us read each channel independently without
// a matching Go struct-tag (encoding/json does not support dots in field tags).
type flatFields map[string]json.RawMessage

// parseRawMessage parses one raw JSON object into the typed flespiMessage
// model. Required channels (ident, timestamp, position) produce an error when
// absent. Optional channels are silently skipped when missing.
func parseRawMessage(raw json.RawMessage, defaultIdent string) (*flespiMessage, error) {
	var fields flatFields
	if err := json.Unmarshal(raw, &fields); err != nil {
		return nil, fmt.Errorf("unmarshal message: %w", err)
	}

	msg := &flespiMessage{}

	// --- Required fields ---
	if err := fields.getString(chanIdent, &msg.Ident); err != nil {
		if defaultIdent == "" {
			return nil, fmt.Errorf("%s: %w", chanIdent, err)
		}
		msg.Ident = defaultIdent // flespi stream not configured to forward ident
	}
	if err := fields.getFloat(chanTimestamp, &msg.TimestampSec); err != nil {
		return nil, fmt.Errorf("%s: %w", chanTimestamp, err)
	}
	if err := fields.getFloat(chanLatitude, &msg.Latitude); err != nil {
		return nil, fmt.Errorf("%s: %w", chanLatitude, err)
	}
	if err := fields.getFloat(chanLongitude, &msg.Longitude); err != nil {
		return nil, fmt.Errorf("%s: %w", chanLongitude, err)
	}

	// --- Optional scalar channels ---
	var speed float64
	if err := fields.getFloat(chanSpeed, &speed); err == nil {
		msg.SpeedKmh = &speed
	}
	var ignition bool
	if err := fields.getBool(chanIgnition, &ignition); err == nil {
		msg.IgnitionOn = &ignition
	}
	var totalFuel float64
	if err := fields.getFloat(chanTotalFuel, &totalFuel); err == nil {
		msg.TotalFuelLitres = &totalFuel
	}
	var extPower float64
	if err := fields.getFloat(chanExternalPower, &extPower); err == nil {
		msg.ExternalPowerVoltage = &extPower
	}

	// --- Per-compartment fuel channels (confirmed Bluetooth sensor indices) ---
	// bluetoothCompartmentMap defines which bluetooth.sensor.value.<index>
	// maps to which compartment. Extend the map in model.go as more sensors
	// are confirmed on the vehicle.
	for key, raw := range fields {
		if !strings.HasPrefix(key, chanBluetoothSensor) {
			continue
		}
		indexStr := strings.TrimPrefix(key, chanBluetoothSensor)
		var idx int
		if _, err := fmt.Sscanf(indexStr, "%d", &idx); err != nil {
			continue
		}
		compartment, ok := bluetoothCompartmentMap[idx]
		if !ok {
			continue // not yet confirmed
		}
		var v float64
		if err := json.Unmarshal(raw, &v); err != nil || v < 0 {
			continue
		}
		if msg.CompartmentFuel == nil {
			msg.CompartmentFuel = make(map[string]float64)
		}
		msg.CompartmentFuel[compartment] = v
	}

	// --- Also support user_channel.* (flespi calculator output, calibrated) ---
	for key, raw := range fields {
		if !strings.HasPrefix(key, chanCompartmentPrefix) {
			continue
		}
		var v float64
		if err := json.Unmarshal(raw, &v); err != nil {
			continue
		}
		if msg.CompartmentFuel == nil {
			msg.CompartmentFuel = make(map[string]float64)
		}
		label := strings.TrimPrefix(key, chanCompartmentPrefix)
		msg.CompartmentFuel[label] = v
	}

	return msg, nil
}

// toTelemetryReading converts the typed flespi wire model to the domain type
// used by the rest of the ingestion pipeline.
func toTelemetryReading(msg *flespiMessage) *domain.TelemetryReading {
	sec := int64(msg.TimestampSec)
	nsec := int64((msg.TimestampSec - float64(sec)) * 1e9)

	r := &domain.TelemetryReading{
		DeviceID:        msg.Ident,
		Timestamp:       time.Unix(sec, nsec).UTC(),
		Latitude:        msg.Latitude,
		Longitude:       msg.Longitude,
		CompartmentFuel: msg.CompartmentFuel,
	}
	if msg.SpeedKmh != nil {
		s := int(*msg.SpeedKmh)
		r.Speed = &s
	}
	if msg.IgnitionOn != nil {
		v := *msg.IgnitionOn
		r.IgnitionOn = &v
	}
	if msg.TotalFuelLitres != nil {
		v := *msg.TotalFuelLitres
		r.TotalFuelLiters = &v
	}
	if msg.ExternalPowerVoltage != nil {
		v := *msg.ExternalPowerVoltage
		r.ExternalPowerVoltage = &v
	}
	return r
}

// ---- flatFields helpers -------------------------------------------------------

func (f flatFields) getString(key string, dst *string) error {
	raw, ok := f[key]
	if !ok {
		return fmt.Errorf("field %q missing", key)
	}
	return json.Unmarshal(raw, dst)
}

func (f flatFields) getFloat(key string, dst *float64) error {
	raw, ok := f[key]
	if !ok {
		return fmt.Errorf("field %q missing", key)
	}
	return json.Unmarshal(raw, dst)
}

func (f flatFields) getBool(key string, dst *bool) error {
	raw, ok := f[key]
	if !ok {
		return fmt.Errorf("field %q missing", key)
	}
	return json.Unmarshal(raw, dst)
}
