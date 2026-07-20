.PHONY: build build-IngestFunction build-MaintenanceFunction test test-short test-integration \
        fmt vet lint \
        db-up db-down db-migrate \
        sam-build sam-deploy \
        docker-build docker-push \
        clean

# Use bash so inline env-var syntax (CGO_ENABLED=0 ...) works on both Linux CI
# and Windows (via Git Bash). Requires bash in PATH — always true on Linux; true
# on Windows when Git Bash is installed.
SHELL := bash

# ── Configuration ─────────────────────────────────────────────────────────────
BINARY         := bootstrap
CMD_DIR        := ./cmd/lambda
STACK_NAME     ?= location-geofence-service
AWS_REGION     ?= eu-west-1
ECR_REPO       ?=
IMAGE_TAG      ?= latest
MIGRATIONS_DIR := migrations

TEST_DB_DSN := postgres://geofence:geofence@localhost:5433/geofence_test?sslmode=disable

# ── Build ─────────────────────────────────────────────────────────────────────
build:
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
	  go build -trimpath -ldflags="-s -w" -o $(BINARY) $(CMD_DIR)

# Called by `sam build` when BuildMethod: makefile is set in template.yaml.
# SAM injects ARTIFACTS_DIR; the binary must land there.
build-IngestFunction:
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o "$(ARTIFACTS_DIR)/bootstrap" $(CMD_DIR)

build-MigrateFunction:
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o "$(ARTIFACTS_DIR)/bootstrap" ./cmd/migrate/

build-MaintenanceFunction:
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o "$(ARTIFACTS_DIR)/bootstrap" ./cmd/maintenance/

# ── Tests ─────────────────────────────────────────────────────────────────────
test:
	go test ./... -count=1 -race -timeout 60s

test-short:
	go test ./... -count=1 -short -timeout 30s

test-integration: _pg-test-up
	INTEGRATION_DATABASE_URL="$(TEST_DB_DSN)" \
	MIGRATIONS_DIR="$(MIGRATIONS_DIR)" \
	  go test ./test/integration/... -v -count=1 -timeout 120s
	$(MAKE) _pg-test-down

_pg-test-up:
	docker compose -f docker-compose.test.yml up -d --wait

_pg-test-down:
	docker compose -f docker-compose.test.yml down

# ── Code quality ──────────────────────────────────────────────────────────────
fmt:
	gofmt -w .

vet:
	go vet ./...

lint:
	golangci-lint run ./...

# ── Local DB ──────────────────────────────────────────────────────────────────
db-up:
	docker compose up -d --wait

db-down:
	docker compose down

db-migrate:
	@for f in $(MIGRATIONS_DIR)/*.sql; do \
	  echo "  → $$f"; \
	  PGPASSWORD=geofence psql -h localhost -U geofence -d geofence_dev -f "$$f" -q; \
	done

# ── SAM (AWS) ─────────────────────────────────────────────────────────────────
sam-build:
	sam build

sam-deploy: sam-build
	sam deploy --config-file samconfig.toml

# ── Docker ────────────────────────────────────────────────────────────────────
docker-build:
	docker build -t location-geofence-service:$(IMAGE_TAG) .

docker-push:
	docker tag location-geofence-service:$(IMAGE_TAG) $(ECR_REPO):$(IMAGE_TAG)
	docker push $(ECR_REPO):$(IMAGE_TAG)

# ── Housekeeping ──────────────────────────────────────────────────────────────
clean:
	rm -f $(BINARY)
