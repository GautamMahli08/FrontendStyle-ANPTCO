.PHONY: build build-CoreFunction test fmt vet sam-build sam-deploy clean

SHELL := bash

STACK_NAME ?= anptco-core-api
AWS_REGION ?= ap-south-1

# ── Build ─────────────────────────────────────────────────────────────────────
build:
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
	  go build -trimpath -ldflags="-s -w" -o bootstrap ./cmd/lambda/

# Called by `sam build` when BuildMethod: makefile is set in template.yaml.
build-CoreFunction:
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o "$(ARTIFACTS_DIR)/bootstrap" ./cmd/lambda/

build-SignupFunction:
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o "$(ARTIFACTS_DIR)/bootstrap" ./cmd/signup/

# ── Tests ─────────────────────────────────────────────────────────────────────
test:
	go test ./... -count=1 -race -timeout 60s

fmt:
	gofmt -w .

vet:
	go vet ./...

# ── SAM ───────────────────────────────────────────────────────────────────────
sam-build:
	sam build

sam-deploy: sam-build
	sam deploy --config-file samconfig.toml --no-confirm-changeset

# ── Housekeeping ──────────────────────────────────────────────────────────────
clean:
	rm -f bootstrap
