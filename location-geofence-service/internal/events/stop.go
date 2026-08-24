package events

import (
	"fmt"

	"github.com/anptco/location-geofence-service/internal/domain"
)

// StopAction is what the caller must do with the returned stop candidate.
type StopAction int

const (
	StopActionNone     StopAction = iota // no DB write needed
	StopActionOpen                       // INSERT (or upsert) an open candidate
	StopActionFinalize                   // UPDATE ended_at + classification
	StopActionDiscard                    // DELETE the candidate (too short)
)

// StopResult carries the decision from ProcessStop.
type StopResult struct {
	Action StopAction
	Stop   *domain.VehicleStop // nil when Action is None or Discard
}

// ProcessStop runs the stop detection state machine for one telemetry reading.
//
// open is the current open stop candidate loaded from the DB (nil = none).
// The caller is responsible for all DB writes; this function is pure.
//
// State transitions:
//
//	stationary + no open candidate → StopActionOpen   (truck just stopped)
//	stationary + open candidate    → StopActionNone   (still stopped, no change)
//	moving     + no open candidate → StopActionNone   (already moving, nothing to do)
//	moving     + open candidate,
//	  duration ≥ MinStopDurationS  → StopActionFinalize (record the stop)
//	moving     + open candidate,
//	  duration <  MinStopDurationS → StopActionDiscard  (too brief, discard)
func ProcessStop(
	truck *domain.Truck,
	r *domain.TelemetryReading,
	open *domain.VehicleStop,
	cfg *domain.MonitoringConfig,
) StopResult {
	stationary := r.Speed == nil || *r.Speed < cfg.StationarySpeedKmh

	if stationary {
		if open != nil {
			return StopResult{Action: StopActionNone}
		}
		dedupKey := fmt.Sprintf("stop:%s:%d", truck.ID, r.Timestamp.Unix())
		return StopResult{
			Action: StopActionOpen,
			Stop: &domain.VehicleStop{
				WorkspaceID:    truck.WorkspaceID,
				VehicleID:      truck.ID,
				Lat:            r.Latitude,
				Lng:            r.Longitude,
				StartedAt:      r.Timestamp,
				Classification: "NORMAL",
				Reasons:        []string{},
				DedupKey:       dedupKey,
			},
		}
	}

	// Vehicle is moving — finalize or discard any open candidate.
	if open == nil {
		return StopResult{Action: StopActionNone}
	}

	duration := int(r.Timestamp.Sub(open.StartedAt).Seconds())
	if duration < cfg.MinStopDurationS {
		return StopResult{Action: StopActionDiscard}
	}

	ended := r.Timestamp
	open.EndedAt = &ended
	open.DurationS = &duration
	open.Classification, open.Reasons = classifyStop(open, duration, cfg)

	return StopResult{Action: StopActionFinalize, Stop: open}
}

// classifyStop returns the classification and the reasons slice for a finalized stop.
func classifyStop(s *domain.VehicleStop, durationS int, cfg *domain.MonitoringConfig) (string, []string) {
	var reasons []string

	if !s.InsideGeofence && durationS >= cfg.SuspiciousStopDurationS {
		reasons = append(reasons, "outside_geofence_long_stop")
	}

	if len(reasons) > 0 {
		return "SUSPICIOUS", reasons
	}
	return "NORMAL", reasons
}
