# PG18 employee Run UI — local candidate, 2026-10-22

Status: implementation and isolated checks in progress. **Production NO-GO.** This extends the separate PostgreSQL workspace; it does not replace or deploy the PocketBase workbench.

## Employee behavior

- The authenticated Native capability response must provide both `run_submission_enabled:true` and `bound_model_runs_enabled:true`, with configuration permission. Missing, malformed or partial grants keep the entry hidden. Server policy and repository checks still authorize every request; browser flags cannot grant execution.
- “运行 Agent” lists only the employee's enabled, tested, revision-matched model bindings on canonical provider bases. Submission prepares a task; approval remains separate.
- Before approval the employee sees the task and selected model and must acknowledge possible charges. A changed Agent/model revision prevents approval in the UI; the server and Worker independently revalidate it before an external effect.
- Uncertain submission freezes its exact Agent, instruction and idempotency key. Repeated clicks join one in-flight HTTP request; retry after a lost response uses the original request. Changing workspace sections keeps this state in memory. A known initial rejection permits editing. A rejection following an uncertain response never silently discards the recovery key.
- Approval recovery repeats the same decision. It cannot silently switch an uncertain approval into rejection. No polling, automatic submission, model call, Worker startup or task retry is initiated by opening a page.
- Logout/account switching destroys this view's private state and discards late responses. No prompt, API key, session token or pending request is written to browser storage. Existing task history stays independently read-only.

`run_execution_enabled:false` remains the legacy “Worker readiness not attested” signal. The new capability fields advertise queue admission only; they are not deployment or cutover evidence.

## Current evidence

- Main workspace `pnpm check`: **280/280**, TypeScript/build and **90-asset** production isolation passed.
- Native HTTP/client, independent-entry and retry contracts: **46/46** passed. Separate PG18 Web build passed, with no legacy PocketBase authentication/proxy or development-only UAT panels in the artifact.
- Current PocketBase/SQLite regression: **23/23**, two workers, **114.3 seconds**.
- Separate local branch `codex/pg18-employee-run-ui-20261022`, based on `055c655`: **41 allowlisted source/test/document files**. Its own full `pnpm check` passed **183/183** and **95-asset** production isolation; Native authentication/session/RLS regression **91/91**; UI/session/retry/HTTP contracts **51/51**; API/frontend TypeScript and independent PG18 build passed. The smaller default-test count reflects the preserved older PocketBase workbench baseline, not removed tests. The file review found no env/DB/private-key/generated-binary entries or matches for the checked common credential formats.
- Actual submission-controller integration: **1/1** passed against real local Native HTTP/Cookie/CSRF, embedded PostgreSQL/RLS and private loopback mTLS. A response was deliberately lost after the database committed; two identical request hashes produced one task. Another employee could neither read nor approve it. Repeated approval and Model Worker ticks produced exactly one synthetic result.
- The browser reached Native employee login, owner Agent selection, the capability-gated Run entry and the uncertain-submission screen. Full browser submission/approval/result, account-switch and capability-revocation verification remains pending because another extension UI currently blocks browser automation. Do not infer full browser acceptance from the HTTP integration result.

This local fixture uses PGlite's embedded PostgreSQL with serialized transactions, synthetic employees/model material and a fake model executor. It is not a target-host or paid-provider result. The separately reviewed runtime commit `055c655` already passed real disposable PG18 TCP/HTTPS/mTLS and all 39 quality jobs (see the migration execution record).

## Reproduce the isolated client-to-database flow

Use a project-drive temporary folder. Start the explicit fixture in one terminal:

```powershell
$taskTemp = Join-Path (Get-Location) '.tmp\pg-migration-completion'
New-Item -ItemType Directory -Path $taskTemp -Force | Out-Null
$env:TEMP=$taskTemp; $env:TMP=$taskTemp; $env:TMPDIR=$taskTemp
$env:AGENT_STUDIO_PG_BROWSER_FIXTURE='SYNTHETIC_LOCAL_ONLY'
node --experimental-strip-types services/pg-api/tests/helpers/native-run-browser-fixture.mjs
```

The helper creates only an in-memory database and owned temporary files, binds Web port 17443 on loopback and prints its generated entry URL. No service credentials or existing DB paths are accepted. Its temporary metadata is `.tmp/pg-migration-completion/native-run-browser-info.json`. It refuses startup without the exact marker and does not contact a provider. Test accounts are synthetic constants in that helper, not company identities.

In a second terminal, run against a **fresh fixture**:

```powershell
$env:AGENT_STUDIO_PG_BROWSER_FIXTURE='SYNTHETIC_LOCAL_ONLY'
pnpm test:pg18:native-run-ui-flow
```

The test intentionally consumes one synthetic task and refuses a nonempty fixture. It must not be repeatedly run on the same instance. The browser helper also exposes loopback-only, fixture-header-protected prepare/model/fault/stop controls; those routes are not part of the application server or deployment templates.

The local Web entry uses the normal development-page variant for HTTP loopback testing. The actual PG-only production-root entry continues to refuse credential entry on plain HTTP. Company-trusted HTTPS browser UAT is still required.

## Remaining acceptance

1. Finish browser checks after the extension panel is closed, including uncertain recovery, charge acknowledgement, task result, logout/account change and revoked capability.
2. Review/integrate this separate UI candidate and run its complete release-commit CI. These later local changes have not been uploaded or merged into PR #25.
3. Complete target-host role/certificate provisioning, long-running Worker recovery, trusted HTTPS employee UAT and backup/restore/old-site rollback.
4. Complete the other migration domains: full Workflow nodes, semantic knowledge/team ACL, real scheduling, tool/plugin execution, collaboration/delegation and replacement of the remaining PocketBase frontend flows.
