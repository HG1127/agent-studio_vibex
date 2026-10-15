#!/usr/bin/env bash
# Staging ONLY. No Docker pull/build/up/down; never touches production.
set -euo pipefail
if [[ "${AGENT_STUDIO_STAGE_VERIFY_ONLY:-}" != "I_APPROVE_STAGING_VERIFY" ]]; then
  echo "Refusing: set AGENT_STUDIO_STAGE_VERIFY_ONLY=I_APPROVE_STAGING_VERIFY for an explicitly approved isolated stage." >&2
  exit 3
fi
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose="$root/deploy/postgres-staging/compose.yaml"
sql="$root/db/postgres/010_verify_stage.sql"
if [[ ! -f "$compose" || ! -f "$sql" ]]; then
  echo "Missing staging files" >&2
  exit 2
fi
if [[ -z "${AGENT_STUDIO_STAGE_DB_PASSWORD_FILE:-}" ]]; then
  echo "Provide the external staging-only secret file location." >&2
  exit 3
fi
docker compose -f "$compose" config --quiet
# Read-only psql, only against the explicitly named stage service.
docker compose -f "$compose" exec -T postgres \
  psql -X -v ON_ERROR_STOP=1 -U agentstudio_admin -d agentstudio_stage < "$sql"
