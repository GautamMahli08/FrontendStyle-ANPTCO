package domain

import "time"

// TelemetryReading is the parsed, source-agnostic representation of one GPS
// telemetry record. The ingestion layer is responsible for converting the
// flespi wire format into this type before passing it to domain services.
type TelemetryReading struct {
	DeviceID             string
	Timestamp            time.Time
	Latitude             float64
	Longitude            float64
	Speed                *int
	IgnitionOn           *bool
	TotalFuelLiters      *float64
	ExternalPowerVoltage *float64
	// CompartmentFuel maps per-compartment identifiers to fill levels in litres.
	// Keys and calibration depend on flespi calculator configuration.
	CompartmentFuel map[string]float64
}