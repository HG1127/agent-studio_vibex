# Separate full069 Review Worker LOGIN preparation

This path prepares only `agentstudio_review_worker_login` for the unchanged
`agent-assessment-service.ts` worker entry. Its single existing group is
`agentstudio_review_worker`. It does not prepare Review Dispatch, start a
Worker/Broker, add object or ledger grants, or authorize execution.

Use a newly installed isolated full069 source cohort that includes this entry.
Complete all original eight preparation actions first, including all seven
original LOGINs and the original first administrator. The preparation requires
exactly that initial active administrator and otherwise empty business tables;
existing Native session rows are allowed. It does not adopt an older schema
receipt under a new source hash. Real company data and production remain NO-GO.

Original050/059/060, the six-login enum, original C eight actions and receipts
are unchanged. Their strict fresh account catalog intentionally rejects this
additional LOGIN, so finish that bootstrap before this separate operation.

Run the offline `--plan` on `services/pg-api/src/pg18-complete-review-worker-cli.mjs`
for the fixed ABI. Writes require Linux, root, Node24 and the reviewed original
14-package operator runtime. Set the original fixed BaoTa host, port5333,
database `agent_studio`, admin `postgres`, root-owned0400/0600 admin/API secret
files and the `AGENT_STUDIO_DESCRIPTIVE_PATCH_060_RUNTIME_*` manifest variables.
Additionally set:

- `AGENT_STUDIO_COMPLETE_REVIEW_WORKER_ENABLED=true`
- `AGENT_STUDIO_COMPLETE_REVIEW_WORKER_WRITE_APPROVED=PREPARE_COMPLETE069_FIXED_REVIEW_WORKER_ONLY`
- `AGENT_STUDIO_COMPLETE_REVIEW_WORKER_PASSWORD_FILE` to a distinct root-owned
  0400/0600 file containing an independent strong password.
- `AGENT_STUDIO_COMPLETE_REVIEW_WORKER_JOURNAL_DIR` to a new root-owned0700
  directory outside the checkout, beneath root-owned non-writable ancestors.

An administrator must separately review/install these fixed-user HBA rules
before general matching rules; retain the original seven accounts' reviewed
rules. This CLI reads `pg_hba_file_rules` and never writes HBA configuration:

```text
local all agentstudio_review_worker_login reject
host agent_studio agentstudio_review_worker_login 127.0.0.1/32 scram-sha-256
host all agentstudio_review_worker_login 0.0.0.0/0 reject
host all agentstudio_review_worker_login ::/0 reject
```

Invoke Node with `--experimental-strip-types` and the explicit arguments below,
using the final installed source hash and independently observed physical IDs:

```text
pg18-complete-review-worker-cli.mjs --prepare --profile complete069 --confirm-database agent_studio --expected-source-sha256 <sha256> --expected-system-identifier <id> --expected-database-oid <oid> --operation-id <new-v4-uuid>
```

The original schema/admission locks and a separate preparation lock serialize
the operation. A durable exclusive0600 intent precedes DML. One transaction
creates the fixed NOLOGIN role, grants only direct, non-grantable CONNECT on
`agent_studio` and
one group with ADMIN/INHERIT FALSE, SET TRUE, and enables a locally generated
15000-round SCRAM verifier. It refuses an existing role, password reuse,
unknown accounts, changed baseline catalog/ACLs, unsafe HBA and source/target
drift. No `IF NOT EXISTS`, password rotation or permission repair is provided.

After COMMIT, verification uses a genuine dedicated TCP LOGIN and the unchanged
`inspectAgentAssessmentOperatorPool(...,'worker')`, which checks the initial
session before SET ROLE and the original057/056 catalog. The full independent
API LOGIN audit and all57 migration rows must remain unchanged. The original
057 version-column-only ledger grant is preserved; this tool grants no ledger
access.

Only a report with `verified=true` and all live evidence booleans true confirms
this invocation. Lost acknowledgement requires `--inspect-operation` with the
same arguments and operation ID. That observation is read-only, repeats the
live checks, and always reports `prior_commit_acknowledged=false`; it never
retries creation or grants runtime authorization. Do not reuse an operation
record as a Worker lifetime, heartbeat, execution or UAT approval.

The preparer does not install runtime credentials, TLS material or a service.
The unchanged operator still requires its original non-root credential directory
and explicit review/execution approvals. After this additional LOGIN exists,
the old eight-action fresh catalog will refuse it by design. Complete those
actions and their observations first; subsequent validation uses this separate
read-only observation plus the original runtime preflights.

Controlled CI appends to the original full069 eight groups on the same newly
owned network-isolated target. It invokes this real CLI, tests refusals and
read-only observation, checks the original dedicated session auditor, preserves
all133 table images, and runs the original non-root `--preflight worker` with
synthetic TLS/credential files. It never invokes `--serve` or makes provider
calls. The old050→057 lifecycle workflow remains unchanged and is separate
evidence. Author-side source/pure checks are not a real PG/LOGIN CI pass.
