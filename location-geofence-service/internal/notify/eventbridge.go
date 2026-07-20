package notify

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/eventbridge"
	"github.com/aws/aws-sdk-go-v2/service/eventbridge/types"
)

const eventSource = "location-geofence-service"

// EventBridgeNotifier publishes domain events to an AWS EventBridge custom bus.
// The Lambda execution role must have events:PutEvents on the target bus ARN.
type EventBridgeNotifier struct {
	client  *eventbridge.Client
	busName string
}

// NewEventBridgeNotifier returns a notifier wired to the named custom bus.
// Config is loaded from the ambient Lambda execution environment (region,
// credentials via IAM role — no explicit secrets required).
func NewEventBridgeNotifier(ctx context.Context, busName string) (*EventBridgeNotifier, error) {
	cfg, err := awsconfig.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("notify: load AWS config: %w", err)
	}
	return &EventBridgeNotifier{
		client:  eventbridge.NewFromConfig(cfg),
		busName: busName,
	}, nil
}

func (n *EventBridgeNotifier) OrderArrived(ctx context.Context, p OrderArrivedPayload) error {
	return n.put(ctx, "OrderArrived", p)
}

func (n *EventBridgeNotifier) OrderCompleted(ctx context.Context, p OrderCompletedPayload) error {
	return n.put(ctx, "OrderCompleted", p)
}

func (n *EventBridgeNotifier) put(ctx context.Context, detailType string, detail interface{}) error {
	body, err := json.Marshal(detail)
	if err != nil {
		return fmt.Errorf("notify: marshal %s: %w", detailType, err)
	}
	out, err := n.client.PutEvents(ctx, &eventbridge.PutEventsInput{
		Entries: []types.PutEventsRequestEntry{{
			Source:       aws.String(eventSource),
			DetailType:   aws.String(detailType),
			Detail:       aws.String(string(body)),
			EventBusName: aws.String(n.busName),
		}},
	})
	if err != nil {
		return fmt.Errorf("notify: PutEvents %s: %w", detailType, err)
	}
	// EventBridge can partially reject entries — check FailedEntryCount.
	if out.FailedEntryCount > 0 && len(out.Entries) > 0 {
		e := out.Entries[0]
		return fmt.Errorf("notify: EventBridge rejected %s: %s — %s",
			detailType,
			aws.ToString(e.ErrorCode),
			aws.ToString(e.ErrorMessage),
		)
	}
	return nil
}
