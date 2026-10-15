#!/usr/bin/env bash
# Requires approved disposable staging DB. Never starts/stops containers.
# The smoke SQL inserts SYNTHETIC rows in a PostgreSQL transaction and ROLLBACKS.
set -euo pipefail

if [[ "${AGENT_STUDIO_STAGE_EXERCISE_ACK:-}" != "I_APPROVE_SYNTHETIC_STAGING_TEST" ]]; then
  echo "Refusing: isolated staging exercise requires explicit approval." >&2
  exit 3
fi
if [[ -n "${DOCKER_HOST:-}" || -n "${DOCKER_CONTEXT:-}" ]]; then
  echo "Refusing: remote/overridden Docker daemon targets are forbidden." >&2
  exit 3
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose="$root/deploy/postgres-staging/compose.yaml"
sql="$root/db/postgres/020_exercise_rls_stage.sql"
if [[ ! -f "$compose" || ! -f "$sql" ]]; then
  echo "Missing PostgreSQL staging files" >&2
  exit 2
fi
if [[ -z "${AGENT_STUDIO_STAGE_DB_PASSWORD_FILE:-}" || ! -f "${AGENT_STUDIO_STAGE_DB_PASSWORD_FILE:-}" ]]; then
  echo "Provide an existing secret file for staging only." >&2
  exit 3
fi
docker compose -f "$compose" config --quiet
docker compose -f "$compose" exec -T postgres \
  psql -X -v ON_ERROR_STOP=1 -U agentstudio_admin -d agentstudio_stage < "$sql"
