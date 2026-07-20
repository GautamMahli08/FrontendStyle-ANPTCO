# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS builder

WORKDIR /build

# Cache module downloads before copying source so layer is reused on code-only changes.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Produce a statically-linked Linux/amd64 binary named "bootstrap".
# Lambda's provided.al2023 runtime expects the handler at $LAMBDA_RUNTIME_DIR/bootstrap.
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -o bootstrap ./cmd/lambda

# ── Stage 2: minimal Lambda runtime image ─────────────────────────────────────
FROM public.ecr.aws/lambda/provided:al2023

COPY --from=builder /build/bootstrap ${LAMBDA_RUNTIME_DIR}/bootstrap

CMD ["bootstrap"]
