# PG18 optional credential boundary and MCP alias follow-up — 2026-10-23

This local increment follows `434502a`. It does not activate PostgreSQL,
change the running PocketBase service, connect to a company database or upload
new source. Production cutover remains **NO-GO**.

## Behavior and boundaries

When an MCP catalog changes order, an Agent retains its saved tool aliases.
Selecting a new tool now allocates an unused alias instead of reusing an index
that belongs to an existing selection. Existing references are not silently
renamed. Connection revision, catalog hash, specific tool and normal Agent CAS
checks still apply; the fix does not grant a new tool or update a stale binding.

The general API, private dispatch service and Worker preflights now inspect any
installed MCP/Smithery tables even when discovery, management and execution
capabilities are off. Installations without these optional tables remain
supported. Partial table pairs, a Smithery schema without MCP, non-table objects,
missing credential columns and disabled/unenforced RLS fail closed.

The inspector uses catalog OIDs so a NOINHERIT login does not require private
schema USAGE merely to be audited. It reads only pg_catalog and privilege
predicates, inside a caller-owned READ ONLY transaction. It selects no credential
or employee values. It checks:

- No direct table or partial-column privileges for the service login itself.
- Only the intended login role memberships, including Worker -> API/Worker;
  an extra NOINHERIT shadow-reader role is rejected.
- No optional table/column access for Worker, identity-only dispatch or an
  installed native-auth role.
- No API SELECT on ciphertext, nonce or tag; the Broker can SELECT all three.
- No Broker writes, and no Broker reads on optional connection metadata tables.

The API role is still used for normal owner-scoped application queries; this
inspector specifically prevents credential reads through that role. Existing
lease/identity/approval/owner checks remain necessary. It does not attest all
possible SQL function behavior or replace live policy/employee UAT.

The shared native Worker readonly entrypoint also invokes the optional inspector
directly. This covers an additive operator package that intentionally reuses an
older SHA-pinned general verifier; it does not require overwriting that prior
reviewed source. Current full source may perform the same inexpensive metadata
audit twice during startup. There is no additional Worker loop, DML or provider
request.

## Review package closure

The readonly Worker review/non-root bundles now include the optional inspector,
credential metadata policy and shared native readonly entrypoint. The additive
native Worker ZIP includes the new inspector in its source and SHA manifest.
The operator checks its ownership/permissions too. Default/no-argument/serve
refusals and explicit readonly approval remain in force; no package is installed.

The Native API package now pins the existing runtime AJV 8.20.0 dependency and
uses the project's TypeScript parser to trace real imports and Worker URL modules.
Comments and ordinary strings no longer become spurious package dependencies.
The compiler is a local build-time dependency and is not included as an API
runtime dependency. The generated API review package passed extracted manifest,
offline-plan and implicit-start checks: 60 source files / 66 packed files,
with no secrets. Generated archives remain outside Git in a dedicated temporary
review directory and are not uploaded.

## Verification

Nine focused SQL/client/SSR tests passed, including live embedded SQL role
changes, partial-column grants, extra role membership, optional forced-RLS drift
and the reordered-catalog save path. Nine Worker package/entrypoint tests passed;
twenty-two Python operator/package tests passed. These are synthetic/local checks,
not evidence of a verified production PostgreSQL 18 deployment.

Final local regression, 2026-10-23:

| Check | Main workspace | Isolated candidate |
| --- | --- | --- |
| `pnpm check` (unit / frontend types / normal build) | 452 passed; 90 build assets | 352 passed; 95 build assets |
| `pnpm test:e2e:parallel` (real disposable PocketBase) | 23 passed, 103.7 s | 19 passed, 75.5 s |
| API TypeScript | passed | passed |
| PG-only frontend | passed, 5 JS assets; no legacy PB auth/proxy | passed, 5 JS assets; no legacy PB auth/proxy |
| Credential boundary / reordered alias checks | 9 passed | 9 passed |
| Worker review package / readonly entrypoint checks | 9 passed | 9 passed |
| Python operator / additive-package checks | 22 passed | 22 passed |
| Native API extracted package | 60 source / 66 packed; manifest, offline plan and default refusal passed | 60 source / 66 packed; manifest, offline plan and default refusal passed |

The main workspace and candidate deliberately retain different pre-existing
baselines; their totals are not interchangeable. Candidate-only Python execution
also exposed five missing prior operator-chain modules. Those source prerequisites
were added explicitly and all 22 checks then passed. No runtime code changed after
the full regression; only the missing readonly operator source, CI and evidence
were added. The employee CI now includes the nine package tests, all twenty-two
Python tests and Native API offline package verification, but that new CI has not
run on a hosted runner.

The fresh-cutover inventory still reports 38 PocketBase-dependent files out of
273 frontend files in the main tree, and 30 out of 237 in the candidate. This
whole-tree inventory includes retained legacy paths; it is not a migration
completion percentage. Both reports refuse cutover. The independent PG frontend
bundle check above covers only the PG-only candidate entrypoint.

Hosted restricted-role PG18 cases were extended for direct Worker credential-tag
access and transitive API nonce access; these new hosted cases have not run.
Shared/semantic knowledge, schedules/collaboration, full product parity,
employee UAT, Worker operations, backup/restore and rollback signoff remain open.
