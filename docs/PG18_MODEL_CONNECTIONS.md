# PG18 model connections — implementation and activation boundary

This slice adds owner-scoped model connection configuration and a separately gated, read-only provider-inventory connectivity probe to the isolated PostgreSQL application. **Provider egress is OFF by default**; it requires explicit approval in a disposable HTTPS environment. No live provider credentials or endpoints have been contacted during development. Model generation, Agent Runs, approvals, and Workers remain disabled. Production migration gate: NO-GO.

## What is implemented

- The table **agentstudio.model_connections** stores provider, HTTPS base URL, enabled state, manually selected model IDs, status metadata, revision, and an encrypted API-key envelope.
- API keys are encrypted by the Node service with AES-256-GCM. The database stores ciphertext, a 12-byte nonce, and a 16-byte authentication tag; the browser receives only the final four characters.
- A separate 32-byte key is delivered as 64 hexadecimal characters from an external secret file. It is not derived from the PostgreSQL API password or employee-auth password.
- API routes provide owner-scoped list/get/create/update/delete, optimistic revision checks, and strict request-field validation.
- The Worker has no table grant. Row-level security applies owner_user_id = agentstudio.actor_id() for the API role.
- The migration file db/postgres/migrations/pg_v9_019_model_connections.sql upgrades an existing isolated staging baseline and validates the resulting shape, RLS policy, and role grants. db/postgres/001_stage_schema.sql includes the table for a fresh empty-database initialization.

## Agent to model-connection binding (configuration only)

The PostgreSQL-native Agent editor can now associate one employee-owned, tested model configuration with an Agent. The selection stores only `model_binding: {connection_id, connection_revision, model_id}` in the Agent spec; never a raw key, encrypted key, provider URL, model completion result or arbitrary API headers. All three fields are validated strictly. The server's Agent repository rechecks, in the **same owner/RLS transaction** used to save the Agent, that the connection belongs to this employee, is enabled, has passed its approved GET-only model inventory probe, exactly matches the selected revision and model ID, and uses one canonical allowlisted provider base. A stale or foreign reference cannot be saved. Unbinding removes the optional object and preserves knowledge-base, prompt, workflow and task settings.

**This does not enable generation using employee model credentials.** The current staging Model Worker still uses its independently configured, fixed OpenAI credential. To prevent an Agent silently running a different provider/model than selected, its Run submission rejects any bound Agent with `model_binding_runtime_not_enabled` before creating jobs. Even if a previously queued/imported task acquired a binding, the Worker pauses it before recording an external effect, sending a request or incurring model charges. A separate reviewed employee-secret broker and provider-specific model execution engine are required before enabling bound-model execution.
The repository now has an internal `resolveExecutionMaterial()` primitive for a future brokered runtime. It verifies the authenticated owner mapping, connection enabled state, exact revision, selected model membership and canonical provider endpoint; encrypted fields are fetched only through the read-only Broker role. When called inside a Worker-owned API-role transaction, it holds a row-share lock across the separate Broker read so connection edits cannot race the effect reservation. Synthetic PGlite tests cover owner mismatch, stale revision, disallowed model, disabled connection, non-allowlisted URL and ciphertext grants.

**This resolver is not wired into Run submission or the Model Worker.** The explicit refusal `model_binding_runtime_not_enabled` remains in place; no employee credential can trigger a model call from this addition. The remaining step is to connect the already-tested owner-bound dispatch/effect-fencing contract to an independently authenticated, explicitly approved runtime and a separately provisioned Broker login. Do not remove the refusal based only on this resolver test.

Verified isolated contracts are in `services/pg-api/tests/agent-model-binding.test.mjs`, the native-cookie E2E test, and the Worker effect-fencing test. Existing Agent specs without `model_binding` retain their current isolated test behavior.

## Owner-bound generation: isolated contract, NOT activated

A **non-routed** API-side model generation adapter now renders fixed-host OpenAI, Anthropic and Gemini paid POST requests without leaking keys into the request body. It validates strictly bounded ModelInput, fixes the TLS/SNI host, pins a publicly validated A/AAAA address, disables redirects, limits the response body to 64 KiB and returns only 12,000 characters of plain text. This is tested only through synthetic DNS/HTTPS fakes. Creating the adapter requires a separate non-root, trusted HTTPS UAT authorization and exact bounded-generation acknowledgement; none of the existing service templates activates it.

The API-role **OwnerBoundModelDispatch** enforces a second boundary in isolated synthetic PostgreSQL: verified employee owner identity; exact leased job/worker/lease token/version and unexpired lease; already approved model step; run and Agent revision; saved model ID, owner, encrypted-key revision and allowlisted provider; and a canonical SHA256 fingerprint of the prepared prompt and model binding. Before touching an external executor, a unique durable `external_effects` row with step key `model_bound_dispatch` is committed. Duplicate requests and stale leases cannot send a second paid POST. Any ambiguous exception is recorded as `unknown`, with a credential-free audit entry, and is **never automatically retried**. The old `agentstudio_stage_worker` login can `SET ROLE agentstudio_api`. The migration sources now remove `SELECT` on ciphertext/nonce/tag from that API role and require a distinct `agentstudio_model_broker` group role, which has owner-scoped SELECT and no writes. An independent Broker login is required for decryption. **These source changes have NOT been applied to the real BaoTa PG18 database**; the production permission gate remains NO-GO until login-level verification in the approved environment.

**Deployment blockers:** the new broker and executor are internal modules only, not HTTP routes or enabled workers. A reviewed Worker-to-API mutual-authentication transport, database-level transitive-secret permission isolation, and a new leased bound-model execution path are required before any actual provider call. The old fixed-key Worker still rejects any Agent with a `model_binding` before external effects. The new modules do not weaken that protection.

Regression checks include `tests/model-connection-executor.test.mjs` and `tests/owner-model-dispatch.test.mjs`, which use only fake outbound transport and synthetic PGlite state. The canonical fingerprint covers model selection and source text irrespective of PostgreSQL JSONB key ordering. An empty API Key in a connection update preserves the prior encrypted key and masked suffix; it no longer violates the column constraint.

## Separate Broker database role and fail-closed startup

A reviewed fresh schema now grants ordinary `agentstudio_api` only metadata-column SELECT on `model_connections`; ciphertext, nonce and authentication tag are excluded even if a Worker logs in and switches to the API role. `agentstudio_model_broker` is a NOLOGIN, NOINHERIT, NOBYPASSRLS group with SELECT rights only to owner-scoped model credential columns, with no INSERT, UPDATE, DELETE or ability to read employee authentication secrets. API repository updates no longer read old ciphertext when the API Key input is empty.

For an existing disposable PostgreSQL database, the **proposed** SQL sequence is: original reviewed empty-schema/auth setup, then `pg_v9_019_model_connections.sql`, `pg_v9_020_model_credential_broker.sql`, and `pg_v9_021_tool_connections.sql`. The latter is idempotent in an isolated PGlite upgrade test and rejects unauthorized transitive Broker memberships. A separate `021_pg18_model_broker_login_proposed.sql` reserves a broker login as **NOLOGIN** (no password or running process) until an independent approved provisioning step. Never apply these SQL files to a live database without backup, a trusted operator and explicitly verified migration order.

The native server keeps the broker role disabled by default. To use the independently authorized, GET-only model inventory probe in a disposable HTTPS environment, it additionally requires:

- `AGENT_STUDIO_PG_MODEL_BROKER_USER=agentstudio_model_broker_login`
- `AGENT_STUDIO_PG_MODEL_BROKER_PASSWORD_FILE=/run/credentials/agentstudio-pg18-native.service/model-broker.secret`

The fourth credential must be a separate, approved systemd LoadCredential secret, **not included in the default service template**. The native server verifies the Broker login cannot join API/Worker roles, that Broker can read the protected column and cannot update the table, before opening HTTP. A missing/unsafe broker file or role refuses startup; `--plan` and `--preflight` remain offline and do not require that file.

Local evidence: `services/pg-api/tests/model-connection-migration.test.mjs` verifies the repeated upgrade, `worker-role-readonly-preflight.test.mjs` verifies Worker transitive denial, and `native-credential-policy.test.mjs` verifies the fourth credential's strict path and opt-in. These are **not** substitutes for live PG18 role checks, HTTPS staff acceptance tests, and rollback validation.

## PostgreSQL-native Tool Connections configuration (execution disabled)

The PG18 candidate UI now includes Tool Connections metadata CRUD. The schema adds `agentstudio.tool_connections` and `agentstudio.tool_connection_headers`, both owner-RLS scoped. Request-header values are encrypted individually with the external AES-256-GCM key; the ordinary API can SELECT header names for a masked editor but cannot SELECT ciphertext, nonce or tag. The independent Broker role can SELECT those encrypted fields for its future authorized runtime, but has no INSERT/UPDATE/DELETE. The Worker login cannot join Broker and is checked at startup for both model and tool-header secret-column access.

The Tool Connections editor supports GET/POST, HTTPS public-domain endpoints, request templates and a bounded timeout. It rejects HTTP, IP literals, local/internal hostnames, URL credentials/query/fragment and unsafe header characters. Empty header values during an edit preserve the saved encrypted value; removing a header row deletes that header. Configuration writes are behind the existing explicit config-UAT gate and produce audit events.

**No tool test, proxy or execution endpoint exists in this PG18 slice.** Saving an enabled configuration does not cause outbound network traffic. A future tool runtime still needs reviewed SSRF/DNS/TLS controls, Worker-to-API authentication, approval/effect fencing and duplicate-call protection before execution can be enabled.

The fresh schema includes these tables for new disposable candidates. Existing isolated databases require `pg_v9_021_tool_connections.sql` after `pg_v9_020_model_credential_broker.sql`; the upgrade is replay-tested and validates its owner/Broker policies. Do not apply it to the live database without a verified backup and explicit operator approval.

## Secret provisioning contract (for a separately approved staging deployment)

The native service now requires three independent secret files. The model-encryption key path is:

- Root-only preflight vault: /root/.agentstudio-pg18-secrets/model-encryption.secret
- systemd service credential: /run/credentials/agentstudio-pg18-native.service/model-encryption.secret

Generate a new key only on the approved staging host and store it outside the repository:

    install -d -o root -g root -m 0700 /root/.agentstudio-pg18-secrets
    umask 077
    openssl rand -hex 32 > /root/.agentstudio-pg18-secrets/model-encryption.secret
    chown root:root /root/.agentstudio-pg18-secrets/model-encryption.secret
    chmod 0600 /root/.agentstudio-pg18-secrets/model-encryption.secret

The generated file should contain exactly 64 hexadecimal characters plus an optional final newline. Do not reuse either PostgreSQL password, do not paste the key into a terminal transcript, do not upload it, and never commit it. The service template maps it through systemd LoadCredential; the runtime rejects missing, shared, symbolic-link, or incorrectly permissioned credential files.

**Do not perform these commands on the live host yet.** The current work is repository-only; no PostgreSQL database was contacted or changed. First review the diff and approve a disposable staging target, then run the migration and employee UAT with the documented backups and rollback plan.

## Provider connectivity probe — isolated UAT only

The native server must additionally receive all of the following **explicitly reviewed** values to permit outbound provider inventory tests. They are not shipped enabled in the service template:

- AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED=true
- AGENT_STUDIO_PG18_UAT_APPROVAL=APPROVE_ISOLATED_PG18_CONFIG_UAT_ONLY
- AGENT_STUDIO_PG18_MODEL_PROBE_UAT_ENABLED=true
- AGENT_STUDIO_PG18_MODEL_PROBE_UAT_APPROVED=APPROVE_DISPOSABLE_PG18_PROVIDER_READONLY_PROBE_ONLY

Only a non-root `--serve` process exposed behind the approved trusted HTTPS origin may receive those capabilities. `--plan` and `--preflight` do not enable egress. The server publishes `model_probe_enabled` only through its authenticated native-cookie capabilities response; the UI hides its button otherwise. API requests still require valid native sessions, same-origin CSRF validation and owner-scoped PostgreSQL RLS.

The probe accepts **only exact** canonical HTTPS provider bases: `https://api.openai.com/v1`, `https://api.anthropic.com/v1`, and `https://generativelanguage.googleapis.com/v1beta`. It rejects user-defined gateways and mismatched provider URLs even though custom HTTPS base URLs may be saved as inactive configuration. Only GET `/v1/models` or `/v1beta/models` is allowed. No arbitrary HTTP methods, model completion, tools, plugins, redirects or URL parameters are accepted.

DNS A and AAAA results are validated against the special-use/private/reserved IP denylist before a connection. All resolved addresses must pass; the selected address is pinned into the actual HTTPS TLS request, preserving SNI and certificate validation. Responses have a six-second deadline, a 128 KiB body cap and JSON shape validation. Provider error bodies, model inventory, headers and credentials are never returned or persisted. The database records only sanitized state, latency and failure code; it increments revision and rejects stale results. The same transaction records an owner-attributed audit event without credentials, response bodies or URLs. A 30-second per-record cooldown and in-process single-flight guard suppress repeated probes.

Run before any approved disposable staging probe:

    pnpm --dir services/pg-api test:model-connections
    pnpm test:pg18:native-readonly-gate

These tests use mocked DNS/HTTPS and a local synthetic PostgreSQL fixture, **not live provider network calls**.

## Latest source status — 2026-10-22

The source now contains provider-specific request/response adapters, the owner-bound model dispatcher, a private mTLS Worker client and a separate Broker executable. Native Run admission uses the same independently gated repository composition as its HTTP tests. Local synthetic execution covers employee Cookie login, owner binding, approval, real loopback mTLS, lease identity and both durable effect ledgers, including no duplicate generation. No paid provider or target company database was contacted by these tests.

The private service's production startup still requires exact PG18 target verification, three separate database logins, restrictive systemd credentials, valid and independently pinned TLS peers, and explicit execution approval. The preview unit runs read-only preflight only; it does not install or start an execution service. Real disposable PG18 coverage for the integrated runtime is prepared but not yet confirmed. These are source changes, not a deployed or accepted provider integration. See [the current execution record](PG18_FRESH_MIGRATION_EXECUTION.md).

## Remaining before formal migration
- Integrated real PG18 TCP validation and reviewed target-host role/certificate provisioning.
- Complete Agent employee UI and Workflow execution parity, including approval and recovery acceptance.
- Removal of the remaining PocketBase dependencies in the main app.
- Independent HTTPS employee UAT and verified 8090 rollback.

Connections start as untested; an independently authorized inventory probe can update that status. Saving a connection or passing an inventory probe does not certify the generation path or formal migration readiness.
