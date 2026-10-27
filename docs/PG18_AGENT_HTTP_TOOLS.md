# PG18 Agent HTTP tools candidate — 2026-10-23

This local increment extends the `b05fcb8` candidate. It has not been uploaded,
deployed, or used to switch the PocketBase runtime. All verification uses
disposable synthetic records. Production cutover remains **NO-GO**.

## Behavior

An Agent may declare up to ten custom HTTP tools in `spec.http_tools`. Each
entry contains exactly `name`, `description`, `connection_id` and
`connection_revision`. Aliases use the `http_` namespace and must also appear
in the Agent's `tools` allowlist. Duplicate names/connections, undeclared aliases,
URLs, headers, credentials and owner overrides are rejected in this contract.
The total tools limit remains twenty. Empty declarations are omitted so older
Agent snapshots keep their original canonical form.

Agent saves resolve every connection within the verified owner's transaction
and require an enabled connection at the specified revision. Workflow Agent
nodes and standalone multi-round Agents freeze the declaration with their role
snapshot, then repeat ownership/revision/enabled checks before model and Tool
effects. Planner prompts contain aliases and purpose/parameter descriptions;
they omit HTTP endpoints, connection UUIDs and decrypted headers.

Each HTTP proposal produces the existing Tool effect with a server-derived
connection reference, its own approval and input hash. It uses the existing
private mTLS Tool Broker, encrypted header storage, public-DNS pinning and
bounded template/response handling. No new tables, SQL roles, credential grants,
activation flags, sockets or automatic HTTP retries are introduced. A changed
connection after approval cannot dispatch; an ambiguous POST outcome pauses the
run and cannot be resent automatically. The older one-shot Agent submission
route refuses roles with HTTP tool declarations.

The employee Agent configuration section supports selecting connections,
editing descriptions, explicitly adopting a newer connection revision, removing
unavailable bindings and discarding drafts. Goal/model/knowledge edits preserve
HTTP declarations. Both Agent approval paths verify the declared reference;
standalone HTTP reviews show the connection name, method, URL, revision and
arguments. Consent resets for a different step. Configuration saves never queue
work or call a provider. Uncertain saves require a refresh before editing again.

## Verification

- `pnpm test:pg18:agent-http-tools`: 12/12 passed locally: strict declarations,
  owner/revision/disabled saves, Native Cookie and forged identity, no queued
  effects, preservation/removal, both runtime roots over real private mTLS,
  explicit rejection, configuration changes after approval, unknown-outcome
  replay refusal, client review rules and escaped static SSR.
- Main workspace: `pnpm check` **404/404**, frontend types and build, production
  bundle isolation **90 assets**; `pnpm test:e2e:parallel` **23/23**, two workers,
  **117.4 seconds**. API TypeScript check and PG-only build passed (**5 JS assets**).
- Isolated candidate: `pnpm check` **304/304**, frontend types and build,
  production bundle isolation **95 assets**; `pnpm test:e2e:parallel` **19/19**,
  two workers, **118.1 seconds**. API TypeScript check and PG-only build passed
  (**5 JS assets**). The candidate checks use `POCKETBASE_BIN` pointing to the
  existing D-drive test executable; no binary is copied or committed.
- Hosted PostgreSQL TCP tests now cover HTTP tools in both Agent roots with
  separate restricted API/Worker/identity/Broker roles. Hosted browser source
  covers selecting and saving an owner connection and per-step HTTP approval.
  These new hosted tests have **not run**; no browser screenshots or browser
  acceptance are claimed.
- Read-only fresh cutover report: **265** frontend source files, **38** still
  depending on PocketBase; `cutover_allowed:false`. These source counts measure
  dependencies, not functional completion. No company records, provider calls,
  remote configuration or production flows were changed.

## Remaining migration work

This closes custom HTTP tools for the bounded PG Agent runtime. MCP/Smithery
connection setup, discovery and protocol calls still require their own PG
implementation. Shared/semantic knowledge, remaining schedule/collaboration
paths, hosted verification of later candidates, target-host configuration,
employee UAT, sustained Worker checks and backup/restore/rollback signoff remain
separate gates. No old test-data import is required by the user's decision.
