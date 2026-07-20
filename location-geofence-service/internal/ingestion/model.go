package ingestion

// Flespi webhook payload formats.
//
// Flespi delivers device messages as flat JSON objects where keys use
// dot-notation literals (e.g. "position.latitude") — not nested objects.
// The top-level payload is one of:
//
//	[{...}, {...}]                  standard array stream
//	{"messages": [{...}, {...}]}    alternative wrapper format
//
// Field names below correspond to the channels emitted by the Galileosky G-10
// protocol handler in flespi. Custom flespi calculators may rename or add
// channels; update the constants accordingly and re-deploy.

// Required flespi channel names.
const (
	chanIdent     = "ident"     // string — device IMEI or configured identifier
	chanTimestamp = "timestamp" // float64 — Unix seconds (fractional = sub-second)
	chanLatitude  = "position.latitude"
	chanLongitude = "position.longitude"
)

// Optional flespi channel names.
const (
	chanSpeed        = "position.speed"        // float64, km/h
	chanIgnition     = "engine.ignition.status" // bool
	chanTotalFuel    = "can.fuel.total.level"   // float64, litres (calibrated via flespi calculator)
	chanExternalPower = "external.powersource.voltage" // float64, volts; 0 or absent = disconnected
)

// chanBluetoothSensor is the prefix for Bluetooth fuel level sensor channels
// emitted by the Galileosky device. Each sensor appears as
// "bluetooth.sensor.value.<index>" (0-based).
const chanBluetoothSensor = "bluetooth.sensor.value."

// bluetoothCompartmentMap maps confirmed bluetooth sensor indices to
// compartment labels ("1"–"4"). Add entries here as each sensor is confirmed.
var bluetoothCompartmentMap = map[int]string{
	5: "1", // bluetooth.sensor.value.5 → C1 (confirmed)
}

// chanCompartmentPrefix is the key prefix for per-compartment fuel channels
// produced by a flespi calculator. Each compartment appears as
// "user_channel.<name>" where <name> is the label configured in flespi
// (e.g. "user_channel.compartment_1"). Values are calibrated litre readings.
const chanCompartmentPrefix = "user_channel."

// flespiMessage is the intermediate typed representation of a single
// device message as parsed from the flespi wire format. It exists to give
// the parser a concrete, documented model before conversion to domain types.
//
// Absent optional fields are nil; the parser does not error on missing
// optional channels.
type flespiMessage struct {
	// Ident is the device identifier used to look up the truck record.
	Ident string

	// TimestampSec is the device-reported Unix timestamp with fractional
	// sub-seconds precision. Used as the authoritative event time.
	TimestampSec float64

	// Position
	Latitude  float64
	Longitude float64

	// Optional telemetry channels
	SpeedKmh             *float64
	IgnitionOn           *bool
	TotalFuelLitres      *float64
	ExternalPowerVoltage *float64

	// CompartmentFuel maps each compartment label (the part after
	// "user_channel.") to its calibrated fuel level in litres.
	// Empty when the device sends no compartment channels.
	CompartmentFuel map[string]float64
}
