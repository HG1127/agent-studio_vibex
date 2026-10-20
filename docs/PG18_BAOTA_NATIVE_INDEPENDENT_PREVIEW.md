# PG18 Native API and independent LAN preview (operator handoff)

Date: 2026-10-20. STAGING ONLY; code/CI did not perform any BaoTa operation. Production cutover NO-GO. Existing PocketBase :8090 and Worker stay active.

## Fixed staging target (operator must reconfirm onsite)

- Preview URL: https://192.168.1.133:7443, LAN/VPN only, requiring an IT-trusted certificate with IP SAN 192.168.1.133.
- Static frontend: /opt/agentstudio-pg18-native-preview/www
- Isolated source: /opt/agentstudio-pg18-native-api-v2
- Node.js: /opt/agentstudio-node24/bin/node (v24)
- Native upstream: 127.0.0.1:7403, loopback only
- Existing PG18: 127.0.0.1:5333/agent_studio
- Separate minimum-privilege logins: agentstudio_stage_login, agentstudio_native_login
- Root-only source of TWO LoadCredential secrets: /root/.agentstudio-pg18-secrets/api.secret and native-auth.secret (never print or include in ZIP).

## Offline file verification

The source ZIP is source-only, excluding dependencies, database files and credentials. Verify the OUTER SHA-256 supplied with the downloadable file, extract into a new dedicated directory using unzip -n, verify SHA256SUMS_NATIVE_API from the root, then run:

  /opt/agentstudio-node24/bin/node --experimental-strip-types services/pg-api/src/native-server.ts --plan

This plan MUST report network_used=false, workers_started=false, production_cutover_allowed=false. Do not run --serve.

The package requires pg@8.23.1 Node modules; the operator may link the existing separately verified module directory into the NEW candidate tree only after inspecting directory permissions and module version. Do not alter the existing driver tree, old preflight files or database.

## Real systemd credential READ-ONLY check (operator approval required)

The NEW CLI mode --preflight-nonroot uses the same DynamicUser and exact /run/credentials/agentstudio-pg18-native.service/ paths as future long-running service, but opens NO HTTP listener. It only opens PostgreSQL read-only catalog and role checks; it does not create users, change configuration, claim jobs or call models.

The transient systemd unit MUST have the exact name agentstudio-pg18-native.service, LoadCredential for BOTH secrets, NoNewPrivileges, ProtectHome, ProtectSystem and loopback-only access. Do not use literal %d in systemd-run Environment properties: this was earlier found not to expand correctly. Never pass plaintext passwords as Environment or argv.

Expected success includes:

  mode=preflight
  ready=true
  credential_mode=systemd_nonroot
  verified_roles=2
  verified_active_admins=1
  writes_performed=false
  port_opened=false
  workers_started=false
  production_cutover_allowed=false

Any failed guard means STOP, with no --serve. Share only sanitized output.

## Trusted HTTPS and Nginx candidate

The uninstalled sample ops/templates/agentstudio-pg18-standalone-7443.conf.example matches the CI-produced Vite hashed assets and forwards Native Cookie login/API reads to 127.0.0.1:7403. It explicitly blocks employee provisioning, model-run endpoints, and all ordinary API writes. Indexed keyword search may use a tightly scoped POST, but the database operation is read-only.

IT must verify IP SAN certificate, chain, validity and key match on managed devices, reconfirm IP/subnet and free ports, and approve Nginx -t and a separate reload. Old ports 8090, 80, 443 and BaoTa 82 must not be changed.

The packaged unit template ops/templates/agentstudio-pg18-native.service.example has ExecStart --serve and NO [Install] section. It is NOT installed by this package. Do not install or start it before the actual nonroot readonly check, trusted HTTPS, confirmed rollback path and explicit human approval.

## Browser acceptance and rollback

Using authorized independent TEST accounts, confirm HTTPS without trust warning, Native Secure+HttpOnly+SameSite=Strict cookie login, owner-only Agent/Workflow/KB/schedule reads, indexed keyword search citations, failed login, logout, and denial of forbidden writes. The production-candidate frontend excludes development-only Run/approval and text ingestion controls. Roll back by removing only the newly approved independent vhost and Native unit; keep original PocketBase untouched. A real production cutover needs full backup restore and source-target data reconciliation after separate UAT.

NO-GO remains until complete Workflow/model/tool/RAG/scheduler parity, user acceptance, backup/rollback rehearsal and explicit GO review.