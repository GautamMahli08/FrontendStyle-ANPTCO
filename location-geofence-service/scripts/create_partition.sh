#!/usr/bin/env bash
# Creates a truck_telemetry monthly partition for the given YYYY-MM.
# Usage: ./scripts/create_partition.sh 2027-01
#
# Environment variables (all have defaults for local dev):
#   PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
set -euo pipefail

YEAR_MONTH="${1?Usage: $0 YYYY-MM}"
YEAR="${YEAR_MONTH%-*}"
MONTH="${YEAR_MONTH#*-}"

TABLE="truck_telemetry_${YEAR}_${MONTH}"
START="${YEAR_MONTH}-01"

# Compute the first day of the following month (POSIX-compatible, no GNU date -d).
NEXT_MONTH=$(( 10#$MONTH + 1 ))
NEXT_YEAR=$YEAR
if [ "$NEXT_MONTH" -eq 13 ]; then
  NEXT_MONTH=1
  NEXT_YEAR=$(( YEAR + 1 ))
fi
END=$(printf "%d-%02d-01" "$NEXT_YEAR" "$NEXT_MONTH")

SQL="CREATE TABLE IF NOT EXISTS $TABLE
     PARTITION OF truck_telemetry FOR VALUES FROM ('$START') TO ('$END');"

PGPASSWORD="${PGPASSWORD:-geofence}" psql \
  --host     "${PGHOST:-localhost}" \
  --port     "${PGPORT:-5432}" \
  --username "${PGUSER:-geofence}" \
  --dbname   "${PGDATABASE:-geofence_dev}" \
  --command  "$SQL" \
  --quiet

echo "Created partition $TABLE  ($START → $END)"
