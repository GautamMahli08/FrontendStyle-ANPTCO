package notify

import (
	"context"
	"fmt"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
	"github.com/aws/aws-sdk-go-v2/service/sesv2/types"
	"github.com/aws/aws-sdk-go-v2/aws"
)

// EmailSender sends a plain-text email.
type EmailSender interface {
	Send(ctx context.Context, to, subject, body string) error
}

// SESEmailSender sends via Amazon SES v2.
type SESEmailSender struct {
	client   *sesv2.Client
	fromAddr string
}

func NewSESEmailSender(ctx context.Context, fromAddr string) (*SESEmailSender, error) {
	cfg, err := awsconfig.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("ses: load config: %w", err)
	}
	return &SESEmailSender{
		client:   sesv2.NewFromConfig(cfg),
		fromAddr: fromAddr,
	}, nil
}

func (s *SESEmailSender) Send(ctx context.Context, to, subject, body string) error {
	_, err := s.client.SendEmail(ctx, &sesv2.SendEmailInput{
		FromEmailAddress: aws.String(s.fromAddr),
		Destination: &types.Destination{
			ToAddresses: []string{to},
		},
		Content: &types.EmailContent{
			Simple: &types.Message{
				Subject: &types.Content{Data: aws.String(subject)},
				Body: &types.Body{
					Text: &types.Content{Data: aws.String(body)},
				},
			},
		},
	})
	if err != nil {
		return fmt.Errorf("ses: send to %s: %w", to, err)
	}
	return nil
}

// NoopEmailSender discards all messages — used when SES_FROM_ADDRESS is empty.
type NoopEmailSender struct{}

func (NoopEmailSender) Send(_ context.Context, _, _, _ string) error { return nil }
