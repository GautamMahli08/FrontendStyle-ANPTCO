package geofence_test

import (
	"testing"

	"github.com/anptco/location-geofence-service/internal/geofence"
	"github.com/stretchr/testify/assert"
)

func TestDistanceMeters_ZeroDistance(t *testing.T) {
	d := geofence.DistanceMeters(55.7558, 37.6176, 55.7558, 37.6176)
	assert.InDelta(t, 0.0, d, 0.001, "same point should return zero distance")
}

func TestDistanceMeters_Symmetry(t *testing.T) {
	lat1, lon1 := 55.7558, 37.6176 // Moscow Kremlin approx
	lat2, lon2 := 55.7520, 37.6230 // ~600 m away
	assert.InDelta(t, geofence.DistanceMeters(lat1, lon1, lat2, lon2),
		geofence.DistanceMeters(lat2, lon2, lat1, lon1), 0.001,
		"distance should be symmetric")
}

func TestDistanceMeters_KnownPairs(t *testing.T) {
	// At latitude 55°:
	//   1° lat  ≈ 111,194 m  (north–south is nearly constant)
	//   1° lon  ≈ 111,194 × cos(55°) ≈ 63,795 m  (east–west shrinks with latitude)
	tests := []struct {
		name       string
		lat1, lon1 float64
		lat2, lon2 float64
		wantM      float64
		toleranceM float64
	}{
		{
			// 100 m north: Δlat = 100 / 111194 ≈ 0.000899
			name: "approximately 100 m north",
			lat1: 55.0000, lon1: 37.0000,
			lat2: 55.0009, lon2: 37.0000,
			wantM: 100, toleranceM: 5,
		},
		{
			// 200 m north: Δlat = 200 / 111194 ≈ 0.001799
			name: "approximately 200 m north",
			lat1: 55.0000, lon1: 37.0000,
			lat2: 55.0018, lon2: 37.0000,
			wantM: 200, toleranceM: 10,
		},
		{
			// 200 m east: Δlon = 200 / 63795 ≈ 0.003136 (accounts for cos(55°))
			name: "approximately 200 m east",
			lat1: 55.0000, lon1: 37.0000,
			lat2: 55.0000, lon2: 37.0031,
			wantM: 200, toleranceM: 10,
		},
		{
			// 1 km north: Δlat = 1000 / 111194 ≈ 0.008994
			name: "approximately 1 km north",
			lat1: 55.0000, lon1: 37.0000,
			lat2: 55.0090, lon2: 37.0000,
			wantM: 1000, toleranceM: 20,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := geofence.DistanceMeters(tt.lat1, tt.lon1, tt.lat2, tt.lon2)
			assert.InDelta(t, tt.wantM, got, tt.toleranceM,
				"distance between (%v,%v) and (%v,%v)",
				tt.lat1, tt.lon1, tt.lat2, tt.lon2)
		})
	}
}

// TestDistanceMeters_InsideRadius verifies that the function correctly
// determines whether a point falls within typical geofence radii.
func TestDistanceMeters_InsideRadius(t *testing.T) {
	centLat, centLon := 55.7500, 37.6200

	tests := []struct {
		name      string
		lat, lon  float64
		radiusM   float64
		wantInside bool
	}{
		{"same as centre, r=100", centLat, centLon, 100, true},
		{"1 m from centre, r=100", centLat + 0.000009, centLon, 100, true},
		{"99 m from centre, r=100", centLat + 0.00089, centLon, 100, true},
		{"101 m from centre, r=100", centLat + 0.00091, centLon, 100, false},
		{"inside depot radius 200 m", centLat + 0.0015, centLon, 200, true},
		{"outside depot radius 200 m", centLat + 0.0025, centLon, 200, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			d := geofence.DistanceMeters(centLat, centLon, tt.lat, tt.lon)
			inside := d <= tt.radiusM
			assert.Equal(t, tt.wantInside, inside,
				"distance was %.2f m (radius %.0f m)", d, tt.radiusM)
		})
	}
}

func BenchmarkDistanceMeters(b *testing.B) {
	for i := 0; i < b.N; i++ {
		geofence.DistanceMeters(55.7558, 37.6176, 55.7520, 37.6230)
	}
}
