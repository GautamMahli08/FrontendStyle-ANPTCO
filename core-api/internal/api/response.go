package api

import (
	"encoding/json"

	"github.com/aws/aws-lambda-go/events"
)

var corsHeaders = map[string]string{
	"Content-Type":                 "application/json",
	"Access-Control-Allow-Origin":  "*",
	"Access-Control-Allow-Headers": "Authorization, Content-Type",
	"Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
}

func jsonOK(body interface{}) (events.APIGatewayV2HTTPResponse, error) {
	b, err := json.Marshal(body)
	if err != nil {
		return jsonError(500, "internal error"), nil
	}
	return events.APIGatewayV2HTTPResponse{
		StatusCode: 200,
		Headers:    corsHeaders,
		Body:       string(b),
	}, nil
}

func jsonCreated(body interface{}) (events.APIGatewayV2HTTPResponse, error) {
	b, err := json.Marshal(body)
	if err != nil {
		return jsonError(500, "internal error"), nil
	}
	return events.APIGatewayV2HTTPResponse{
		StatusCode: 201,
		Headers:    corsHeaders,
		Body:       string(b),
	}, nil
}

// jsonConflict returns a 409 response with the conflicting resource in the body.
// Used by the dispatch endpoint to return the existing trip on duplicate order_ref.
func jsonConflict(body interface{}) (events.APIGatewayV2HTTPResponse, error) {
	b, err := json.Marshal(body)
	if err != nil {
		return jsonError(500, "internal error"), nil
	}
	return events.APIGatewayV2HTTPResponse{
		StatusCode: 409,
		Headers:    corsHeaders,
		Body:       string(b),
	}, nil
}

func jsonError(code int, msg string) events.APIGatewayV2HTTPResponse {
	body, _ := json.Marshal(map[string]string{"error": msg})
	return events.APIGatewayV2HTTPResponse{
		StatusCode: code,
		Headers:    corsHeaders,
		Body:       string(body),
	}
}
