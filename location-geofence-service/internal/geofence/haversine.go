package geofence

import "math"

const earthRadiusM = 6_371_000.0

// DistanceMeters returns the Haversine great-circle distance in metres between
// two WGS-84 coordinate pairs. Accurate to within ~0.5% for the short distances
// involved in geofence radius checks (100–250 m).
func DistanceMeters(lat1, lon1, lat2, lon2 float64) float64 {
	φ1 := lat1 * math.Pi / 180
	φ2 := lat2 * math.Pi / 180
	Δφ := (lat2 - lat1) * math.Pi / 180
	Δλ := (lon2 - lon1) * math.Pi / 180

	a := math.Sin(Δφ/2)*math.Sin(Δφ/2) +
		math.Cos(φ1)*math.Cos(φ2)*
			math.Sin(Δλ/2)*math.Sin(Δλ/2)

	return 2 * earthRadiusM * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}
