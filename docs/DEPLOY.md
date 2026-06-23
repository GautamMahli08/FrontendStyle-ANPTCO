# On-Prem Deployment — Fuel Platform (Path A: keep flespi)

Migrating off AWS to a single internet-reachable Linux server, keeping flespi
as the device broker. The only thing that changes on the device side is the
flespi stream's target URL.

## What maps to what

| Was (AWS)              | Now (on the server)                          |
|-----------------------|----------------------------------------------|
| API Gateway + ACM TLS | Caddy reverse proxy (auto Let's Encrypt)     |
| Ingestion Lambda      | `/ingest/telemetry` route in the Go service  |
| Fargate Go API        | `api` container (same code)                  |
| RDS Postgres          | `postgres` container (+ your own backups)    |
| S3 + CloudFront       | MinIO (`qr` public, `kyc` private)           |
| Cognito               | Keycloak (optional) or JWT in-app            |
| SES                   | SMTP relay                                    |
| Secrets Manager       | `.env` (chmod 600) / Docker secrets          |
| CloudWatch            | container logs / Grafana+Loki / Netdata      |

The flespi -> server hop is unchanged in nature: flespi store-and-forwards a
batched HTTPS POST. Point it at your box instead of the Lambda URL.

## Prerequisites

1. A Linux server (Ubuntu 22.04+ is fine) with Docker + Docker Compose.
2. A domain name with a DNS **A record -> the server's public IP**.
3. Ports **80 and 443** open to the internet (80 is needed for the TLS cert
   challenge; 443 is where flespi and users connect).
4. Your API image/code, including the ingestion handler.

## Steps

1. Put `docker-compose.yml`, `Caddyfile`, and `.env` on the server in one
   folder. Replace every `<your-domain>` in the Caddyfile and fill in `.env`.
   `chmod 600 .env`.

2. Make the ingestion logic an HTTP route. Your Lambda handler logic is
   unchanged — it now lives at `POST /ingest/telemetry` in the `api` service,
   listening on `:8080`. Keep the two critical behaviors:
   - Validate the `FLESPI_WEBHOOK_SECRET` header on every request.
   - Return **2xx only after** the batch is durably written, so flespi's
     replay-on-failure still protects you against crashes/deploys.

3. Repoint S3 calls to MinIO. Same AWS S3 SDK; set the endpoint to
   `http://minio:9000`, enable **path-style** addressing, and use the MinIO
   credentials. Buckets `qr` (public) and `kyc` (private) are created
   automatically by the `minio-init` job.

4. Bring it up:
   ```
   docker compose up -d
   docker compose logs -f caddy   # watch the cert get issued
   ```
   Caddy will fail to get a cert if DNS isn't pointed yet or 80/443 are
   blocked — fix those first.

5. Run your DB migrations (the schema from the design docs) against the new
   Postgres, then seed the depot + station geofences and the single workspace
   `ws-anptco`.

6. **Repoint flespi.** In the flespi panel, open the stream that currently
   targets the Lambda function URL and change its URI to:
   ```
   https://<your-domain>/ingest/telemetry
   ```
   Keep the same auth header/secret. Send one test message and confirm a row
   lands in `truck_telemetry` and `truck_live_state` updates.

7. Replace Cognito + SES:
   - Auth: stand up Keycloak (uncomment the service) or validate JWTs in-app.
     Either way the API still reads `workspace_id` + roles from the token and
     sets `SET app.workspace_id` for Postgres RLS.
   - Email: point `SMTP_*` at your relay/provider.

## What you now own (don't skip)

- **Backups.** The `pg-backup` service dumps nightly to `./backups`. That is
  not a backup until a copy lives **off the box** — add an rsync/scp to
  another machine, and test a restore.
- **Single point of failure.** One server = downtime risk. If the client
  needs HA, add a standby Postgres (streaming replication) and a second app
  node behind Caddy. At 5-10 devices this is usually deferred — agree it
  explicitly with the client.
- **Patching, monitoring, uptime.** All manual now. At minimum: enable
  unattended OS security updates and a basic uptime/monitoring alert.

## If the answer to reachability later changes

If the server ends up behind NAT with no public IP, flespi cannot reach it.
Options without a public IP: a tunnel (Cloudflare Tunnel / Tailscale Funnel)
or a tiny relay VPS that forwards 443 to the box over WireGuard.
