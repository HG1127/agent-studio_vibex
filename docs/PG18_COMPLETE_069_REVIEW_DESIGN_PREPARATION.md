# Complete069 Review Dispatch and Design account preparation

Source review only. Production remains NO-GO. This independent phase prepares
exactly three LOGINs after C8, Review Worker and Executor and before the F05
pair, Telemetry and B qualification. It never starts a Worker, Broker, provider,
queue, listener or device. It grants no runtime authorization. It does not
alter the old six-login or eight-action protocols, original 059/060 records,
tables, functions, migration ledger or existing credentials.

| New LOGIN | Existing group | Connection limit | Original audit |
| --- | --- | ---: | --- |
| agentstudio_review_dispatch_login | agentstudio_review_dispatch | -1 | inspectAgentAssessmentOperatorPool, dispatch |
| agentstudio_design_worker_login | agentstudio_design_worker | -1 | inspectAgentDesignOperatorPool, worker |
| agentstudio_design_dispatch_login | agentstudio_design_dispatch | -1 | inspectAgentDesignOperatorPool, dispatch |

The limits preserve the original isolated SQL/fixture defaults. Each identity
has NOINHERIT, no privileged flags, no settings or expiry, one membership with
ADMIN FALSE / INHERIT FALSE / SET TRUE and one non-grantable direct CONNECT on
agent_studio. The new SQL reserves all three as NOLOGIN with NULL passwords,
grants only that CONNECT and group, and sets three canonical SCRAM verifiers in
one transaction. Existing roles are never taken over, including a partially
created set. Review Worker and Executor remain at connection limit 3. The API,
NativeAuth and original six service credentials remain independent.

## Preparation and records

Use a reviewed complete069 source closure (53 SQL sources, 19 additions,
57 ledger rows, 133 tables), the separately verified 14-package operator PG
runtime, Node 24 on Linux as root, and the physically bound fresh PG18 target
at 127.0.0.1:5333 / agent_studio / postgres. Retain the original root-private
Review and Executor operation directories and their successful fresh
observations. The physical target is checked before predecessor records are read. The
Executor intent must bind the same Review intent. Its
unchanged original auditor, live Executor identity and original C catalog are
checked; no old strict phase observer is called after the new identities exist.

`node services/pg-api/src/pg18-complete-review-stack-cli.mjs --plan` is offline.
For the independently approved preparation, use the exact argument order below
with three different UUIDv4 IDs, the reviewed source digest, the target system
identifier and database OID. These placeholders are review inputs.

```text
node --experimental-strip-types services/pg-api/src/pg18-complete-review-stack-cli.mjs
  --prepare --profile complete069 --confirm-database agent_studio
  --expected-source-sha256 SOURCE_SHA256
  --expected-system-identifier SYSTEM_IDENTIFIER --expected-database-oid DATABASE_OID
  --review-operation-id REVIEW_UUID --executor-operation-id EXECUTOR_UUID
  --operation-id NEW_UUID
```

The CLI requires the original fixed BAOTA target variables, admin/API password
file variables and DESCRIPTIVE_PATCH_060_RUNTIME manifest file, manifest SHA and
unchanged lock SHA. Its own prefix is `AGENT_STUDIO_COMPLETE_REVIEW_STACK_`:
`ENABLED=true`, `WRITE_APPROVED=PREPARE_COMPLETE069_FIXED_REVIEW_STACK_ONLY`,
`JOURNAL_DIR` and six `_PASSWORD_FILE` variables named MODEL_BROKER,
REVIEW_WORKER, EXECUTOR, REVIEW_DISPATCH, DESIGN_WORKER and DESIGN_DISPATCH.
Set `AGENT_STUDIO_COMPLETE_REVIEW_WORKER_JOURNAL_DIR` and
`AGENT_STUDIO_COMPLETE_EXECUTOR_JOURNAL_DIR` to the retained predecessor record
directories. All eight secret files must be distinct files and distinct
credentials, root-owned, single-linked, non-symlinks, mode 0400 or 0600.
The three new values are independently generated 80-character lowercase hex.
The tool rejects reuse against every existing SCRAM verifier.

The new journal is external to the source tree, root-owned mode 0700 with safe
non-writable ancestors; records are exclusive mode 0600 files, fsynced with the
directory. The exact intent is `complete069_review_stack_operation_v1` and has
16 fields: metadata, source, physical target, three verifier digests, old
catalog/ledger/all-table image digests, both predecessor IDs and canonical
intent digests, and the timestamp. Raw passwords, SCRAM values and row images
are never serialized. The intent is durable before the first CREATE ROLE.
The independent result is `complete069_review_stack_result_v1`.

Every global role and membership is read without a namespace filter. The
explicit PG18 builtins must have reserved OIDs and safe original attributes;
unknown application, foreign or pg_ names refuse. The only builtin memberships
are the three original pg_monitor edges to pg_read_all_settings,
pg_read_all_stats and pg_stat_scan_tables (ADMIN FALSE / INHERIT TRUE / SET TRUE). The exact phase has 36
application roles before and 39 after, including the existing Executor LOGIN.
All cluster database ACLs, all current database namespace/object/column/default
ACLs, role settings, RLS policies, parameter ACLs and tablespace ACLs are
compared. Only the strictly validated three new identities, their exact
memberships and their exact own CONNECT entries are normalized. No unknown
role or object ACL is hidden. All 133 row images and the exact ledger are
unchanged. The four full069 actual API auditors and original real assessment,
Design, model Broker, Review Worker and Executor auditors must pass.

## Unknown acknowledgement

Preserve an unknown COMMIT state and the immutable intent/result. Never replay,
delete evidence, re-enroll or claim a prior acknowledgement. Invoke this same
CLI with `--inspect-operation` and all the same bindings. It performs fresh
read-only observations and no DDL or journal writes. Exit 0 alone is insufficient:
`observed_ready` and all eight evidence booleans must be true. It always reports
`prior_commit_acknowledged=false`, `automatic_retry_authorized=false`,
`writes_performed=false`, `services_started=false`, `runtime_authorization=false`,
`qualifies=false` and `production_cutover_allowed=false`. Finish this phase's
observations before F05 or Telemetry; later legitimate roles intentionally
invalidate the exact earlier matrix rather than widening it.

## Original service preflight and credential examples

The original entry remains `agent-assessment-service.ts --preflight broker` or
`--preflight worker`. Original review gates and mutual TLS remain required;
Design requires its independent original execution opt-in and approval. These
are explicit separately reviewed preflight choices, not authority from account
preparation. Worker uses `worker.secret` and `design-worker.secret` plus its
three TLS files. Broker uses independent `api.secret`, `dispatch.secret`,
`broker.secret`, `design-dispatch.secret`, the encryption-key metadata file and
three TLS files. Broker preflight verifies six roles, Worker preflight two;
neither loads the model key, constructs a provider, opens a listener or runs
work. Runtime credential ownership follows the unchanged original nonroot
credential reader and exact `/run/credentials/agentstudio-pg18-review-*.service`
directories, distinct from the root-only preparer's input files.

Review the unchanged `agent-assessment-{worker,broker}.service.example` together
with the new `agentstudio-pg18-review-{worker,broker}-design.conf.example`
drop-ins. They remain default-off, oneshot, original read-only preflight and
have no Install section or serve command. The Design drop-ins deliberately
refuse with false/REVIEW_REQUIRED: to leave Design off omit both Design gate
variables; to approve its preflight independently set both exact original
values. Copying templates or preparing LOGINs never installs or enables units.
The source review archive includes these examples but no credentials, TLS
material, database, PG runtime or full business dependency runtime.

The added hosted synthetic CI continuation invokes the actual root CLI,
negative guard/catalog/ACL cases, the original three dedicated auditors and
both unchanged nonroot service preflights with synthetic TLS. Its eight groups
have their own `complete069_review_stack_actual_*` events. It preserves C's
original nine cases and Executor's separate summary. Deliberately discarding
CLI stdout tests loss of the caller's result only; it is not injected loss of
the PostgreSQL COMMIT acknowledgement. Source/pure tests do not constitute
that real PG18 execution. B's original seven entries, eight telemetry kinds,
minimum 86400000 ms per run, employee UAT and long-running proof remain intact.
