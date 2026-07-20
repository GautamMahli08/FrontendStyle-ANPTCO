package api

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/anptco/core-api/internal/auth"
	"github.com/anptco/core-api/internal/domain"
	"github.com/anptco/core-api/internal/repository"
	"github.com/aws/aws-lambda-go/events"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// ── GET /admin/v1/devices ─────────────────────────────────────────────────────

func (h *Handler) handleAdminListDevices(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
) (events.APIGatewayV2HTTPResponse, error) {
	status := req.QueryStringParameters["status"]
	devices, err := h.devices.ListDevices(ctx, status)
	if err != nil {
		h.log.Error("admin: list devices", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if len(devices) == 0 {
		return jsonOK([]interface{}{})
	}
	return jsonOK(devices)
}

// ── POST /admin/v1/devices ────────────────────────────────────────────────────

func (h *Handler) handleAdminCreateDevice(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	var d domain.Device
	if err := json.Unmarshal([]byte(req.Body), &d); err != nil {
		return jsonError(400, "invalid JSON body"), nil
	}
	if d.IMEI == "" {
		return jsonError(400, "imei is required"), nil
	}
	if d.Model == "" {
		d.Model = "Galileosky 7x"
	}

	if err := h.devices.CreateDevice(ctx, &d); err != nil {
		h.log.Error("admin: create device", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	h.writeAudit(ctx, claims.Sub, "device.created", "device", d.ID.String(), &d)
	return jsonCreated(&d)
}

// ── PATCH /admin/v1/devices/{id} ──────────────────────────────────────────────

func (h *Handler) handleAdminUpdateDevice(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	rawID string,
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	devID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid device id"), nil
	}

	existing, err := h.devices.GetDevice(ctx, devID)
	if err != nil {
		h.log.Error("admin: get device", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if existing == nil {
		return jsonError(404, "device not found"), nil
	}

	var input domain.Device
	if err := json.Unmarshal([]byte(req.Body), &input); err != nil {
		return jsonError(400, "invalid JSON body"), nil
	}
	input.ID = devID
	// Preserve IMEI — not patchable.
	input.IMEI = existing.IMEI
	if input.Model == "" {
		input.Model = existing.Model
	}
	if string(input.Status) == "" {
		input.Status = existing.Status
	}

	if err := h.devices.UpdateDevice(ctx, &input); err != nil {
		h.log.Error("admin: update device", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	h.writeAudit(ctx, claims.Sub, "device.updated", "device", rawID, &input)
	return jsonOK(&input)
}

// ── POST /admin/v1/devices/{id}/assign ───────────────────────────────────────

func (h *Handler) handleAdminAssignDevice(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	rawID string,
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	devID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid device id"), nil
	}

	var input struct {
		TruckID string  `json:"truck_id"`
		Notes   *string `json:"notes"`
	}
	if err := json.Unmarshal([]byte(req.Body), &input); err != nil {
		return jsonError(400, "invalid JSON body"), nil
	}
	truckID, err := uuid.Parse(strings.TrimSpace(input.TruckID))
	if err != nil {
		return jsonError(400, "invalid truck_id"), nil
	}

	assignment, err := h.devices.AssignDevice(ctx, devID, truckID, claims.Sub, input.Notes)
	if err != nil {
		if err == repository.ErrAlreadyAssigned {
			return jsonError(409, "device or truck already has an active assignment"), nil
		}
		h.log.Error("admin: assign device", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	h.writeAudit(ctx, claims.Sub, "device.assigned", "device", rawID, assignment)
	return jsonCreated(assignment)
}

// ── POST /admin/v1/devices/{id}/unassign ─────────────────────────────────────

func (h *Handler) handleAdminUnassignDevice(
	ctx context.Context,
	rawID string,
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	devID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid device id"), nil
	}

	if err := h.devices.UnassignDevice(ctx, devID, claims.Sub); err != nil {
		h.log.Error("admin: unassign device", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	h.writeAudit(ctx, claims.Sub, "device.unassigned", "device", rawID, nil)
	return jsonOK(map[string]interface{}{"device_id": devID, "unassigned": true})
}

// ── GET /admin/v1/trucks/{id}/devices ────────────────────────────────────────

func (h *Handler) handleAdminListDeviceAssignments(
	ctx context.Context,
	rawID string,
) (events.APIGatewayV2HTTPResponse, error) {
	truckID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid truck id"), nil
	}
	rows, err := h.devices.ListDeviceAssignments(ctx, truckID)
	if err != nil {
		h.log.Error("admin: list device assignments", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if len(rows) == 0 {
		return jsonOK([]interface{}{})
	}
	return jsonOK(rows)
}

// ── GET /admin/v1/sensors ─────────────────────────────────────────────────────

func (h *Handler) handleAdminListSensors(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
) (events.APIGatewayV2HTTPResponse, error) {
	status := req.QueryStringParameters["status"]
	sensors, err := h.devices.ListSensors(ctx, status)
	if err != nil {
		h.log.Error("admin: list sensors", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if len(sensors) == 0 {
		return jsonOK([]interface{}{})
	}
	return jsonOK(sensors)
}

// ── POST /admin/v1/sensors ────────────────────────────────────────────────────

func (h *Handler) handleAdminCreateSensor(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	var s domain.FuelSensor
	if err := json.Unmarshal([]byte(req.Body), &s); err != nil {
		return jsonError(400, "invalid JSON body"), nil
	}
	if s.SerialNo == "" {
		return jsonError(400, "serial_no is required"), nil
	}
	if s.Model == "" {
		s.Model = "DUT-E"
	}

	if err := h.devices.CreateSensor(ctx, &s); err != nil {
		h.log.Error("admin: create sensor", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	h.writeAudit(ctx, claims.Sub, "sensor.created", "sensor", s.ID.String(), &s)
	return jsonCreated(&s)
}

// ── POST /admin/v1/sensors/{id}/assign ───────────────────────────────────────

func (h *Handler) handleAdminAssignSensor(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	rawID string,
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	sensorID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid sensor id"), nil
	}

	var input struct {
		TruckID       string  `json:"truck_id"`
		CompartmentNo int     `json:"compartment_no"`
		Notes         *string `json:"notes"`
	}
	if err := json.Unmarshal([]byte(req.Body), &input); err != nil {
		return jsonError(400, "invalid JSON body"), nil
	}
	truckID, err := uuid.Parse(strings.TrimSpace(input.TruckID))
	if err != nil {
		return jsonError(400, "invalid truck_id"), nil
	}
	if input.CompartmentNo < 1 {
		return jsonError(400, "compartment_no must be >= 1"), nil
	}

	assignment, err := h.devices.AssignSensor(ctx, sensorID, truckID, input.CompartmentNo, claims.Sub, input.Notes)
	if err != nil {
		if err == repository.ErrAlreadyAssigned {
			return jsonError(409, "sensor already has an active assignment"), nil
		}
		h.log.Error("admin: assign sensor", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	h.writeAudit(ctx, claims.Sub, "sensor.assigned", "sensor", rawID, assignment)
	return jsonCreated(assignment)
}

// ── POST /admin/v1/sensors/{id}/unassign ─────────────────────────────────────

func (h *Handler) handleAdminUnassignSensor(
	ctx context.Context,
	rawID string,
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	sensorID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid sensor id"), nil
	}

	if err := h.devices.UnassignSensor(ctx, sensorID, claims.Sub); err != nil {
		h.log.Error("admin: unassign sensor", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	h.writeAudit(ctx, claims.Sub, "sensor.unassigned", "sensor", rawID, nil)
	return jsonOK(map[string]interface{}{"sensor_id": sensorID, "unassigned": true})
}
