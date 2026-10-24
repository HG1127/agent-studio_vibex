#!/bin/bash
# Only PG18 native API readiness check; not a service launcher.
# Database SELECT/SET LOCAL ROLE only, no HTTP listener or Worker.
set -euo pipefail
PACKAGE=/opt/agentstudio-pg18-api-preflight-v1
NODE=/opt/agentstudio-node24/bin/node
if [ "$(id -u)" -ne 0 ]; then
  echo "PG18_NATIVE_API_PREFLIGHT_REFUSED:not_root"
  exit 1
fi
if [ "$(pwd -P)" != "$PACKAGE" ]; then
  echo "PG18_NATIVE_API_PREFLIGHT_REFUSED:unexpected_directory"
  exit 1
fi
# The administrator must verify the outer tarball checksum before unpacking.
# This inner manifest also detects accidentally edited or stale source files.
if [ ! -f SHA256SUMS ]; then
  echo "PG18_NATIVE_API_PREFLIGHT_REFUSED:manifest_missing"
  exit 1
fi
sha256sum -c SHA256SUMS >/dev/null

if [ ! -f services/pg-api/node_modules/pg/package.json ] ||
   [ ! -f services/pg-api/node_modules/jszip/package.json ]; then
  echo "PG18_NATIVE_API_PREFLIGHT_REFUSED:install_dependencies_first"
  exit 1
fi
"$NODE" --experimental-strip-types services/pg-api/src/native-server.ts --plan >/dev/null
exec env -i \
  HOME=/root \
  PATH=/opt/agentstudio-node24/bin:/usr/bin:/bin \
  AGENT_STUDIO_PG_NATIVE_PILOT_ENABLED=true \
  AGENT_STUDIO_PG_NATIVE_REVIEWED=true \
  AGENT_STUDIO_PG_PILOT_ENABLED=true \
  AGENT_STUDIO_PG_BAOTA18_ENABLED=true \
  AGENT_STUDIO_PG_BAOTA18_TARGET_CONFIRMED=true \
  AGENT_STUDIO_PG_HOST=127.0.0.1 \
  AGENT_STUDIO_PG_PORT=5333 \
  AGENT_STUDIO_PG_DATABASE=agent_studio \
  AGENT_STUDIO_PG_USER=agentstudio_stage_login \
  AGENT_STUDIO_PG_NATIVE_AUTH_USER=agentstudio_native_login \
  AGENT_STUDIO_PG_PASSWORD_FILE=/root/.agentstudio-pg18-secrets/api.secret \
  AGENT_STUDIO_PG_NATIVE_AUTH_PASSWORD_FILE=/root/.agentstudio-pg18-secrets/native-auth.secret \
  AGENT_STUDIO_PG_MODEL_ENCRYPTION_KEY_FILE=/root/.agentstudio-pg18-secrets/model-encryption.secret \
  AGENT_STUDIO_INTERNAL_APP_ORIGIN=http://127.0.0.1:7403 \
  AGENT_STUDIO_PG_NATIVE_LOCAL_HTTP_TEST=true \
  "$NODE" --experimental-strip-types \
  services/pg-api/src/native-server.ts --preflight
