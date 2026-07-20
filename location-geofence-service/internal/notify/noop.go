package notify

import "context"

// NoopNotifier discards all notifications silently.
// Use in local development and unit/integration tests.
type NoopNotifier struct{}

func (NoopNotifier) OrderArrived(_ context.Context, _ OrderArrivedPayload) error    { return nil }
func (NoopNotifier) OrderCompleted(_ context.Context, _ OrderCompletedPayload) error { return nil }
