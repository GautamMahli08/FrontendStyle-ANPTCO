package storage

import (
	"bytes"
	"context"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type S3Store struct {
	client     *s3.Client
	qrBucket   string
	kycBucket  string
	cdnBaseURL string
}

func NewS3Store(ctx context.Context, qrBucket, kycBucket, cdnBaseURL string) (*S3Store, error) {
	cfg, err := awsconfig.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("s3: load config: %w", err)
	}
	return &S3Store{
		client:     s3.NewFromConfig(cfg),
		qrBucket:   qrBucket,
		kycBucket:  kycBucket,
		cdnBaseURL: cdnBaseURL,
	}, nil
}

// UploadQR puts a QR PNG into the public QR bucket and returns its CloudFront URL.
func (s *S3Store) UploadQR(ctx context.Context, truckID string, png []byte) (string, error) {
	key := fmt.Sprintf("qr/%s.png", truckID)
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.qrBucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(png),
		ContentType: aws.String("image/png"),
	})
	if err != nil {
		return "", fmt.Errorf("s3: upload QR %s: %w", truckID, err)
	}
	return fmt.Sprintf("%s/%s", s.cdnBaseURL, key), nil
}

// QRUrl returns the deterministic CloudFront URL for a truck's QR PNG.
func (s *S3Store) QRUrl(truckID string) string {
	return fmt.Sprintf("%s/qr/%s.png", s.cdnBaseURL, truckID)
}

// PresignKYCUpload returns a 15-minute PUT pre-signed URL for uploading a KYC doc.
func (s *S3Store) PresignKYCUpload(ctx context.Context, key string) (string, error) {
	presignClient := s3.NewPresignClient(s.client)
	req, err := presignClient.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(s.kycBucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return "", fmt.Errorf("s3: presign KYC upload %s: %w", key, err)
	}
	return req.URL, nil
}

// PresignKYCDownload returns a 1-hour GET pre-signed URL for downloading a KYC doc.
func (s *S3Store) PresignKYCDownload(ctx context.Context, key string) (string, error) {
	presignClient := s3.NewPresignClient(s.client)
	req, err := presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.kycBucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(time.Hour))
	if err != nil {
		return "", fmt.Errorf("s3: presign KYC download %s: %w", key, err)
	}
	return req.URL, nil
}

// UploadDeliveryNote stores a delivery note JSON in the KYC bucket and returns the S3 key.
func (s *S3Store) UploadDeliveryNote(ctx context.Context, tripID string, data []byte) (string, error) {
	key := fmt.Sprintf("delivery-notes/%s.json", tripID)
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.kycBucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String("application/json"),
	})
	if err != nil {
		return "", fmt.Errorf("s3: upload delivery note %s: %w", tripID, err)
	}
	return key, nil
}

// PresignDeliveryNote returns a 1-hour GET pre-signed URL for a delivery note JSON.
func (s *S3Store) PresignDeliveryNote(ctx context.Context, key string) (string, error) {
	presignClient := s3.NewPresignClient(s.client)
	req, err := presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.kycBucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(time.Hour))
	if err != nil {
		return "", fmt.Errorf("s3: presign delivery note %s: %w", key, err)
	}
	return req.URL, nil
}
