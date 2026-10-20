# Harness V2 P0 — shared execution ownership and recovery hardening

## Scope

Based on pending PR #6 (`18cef69`) in separate feature branch.
No production mutation, database schema change, worker deployment or main merge.

**Shared Goja lease guard:** `modules/harness_execution_guard.js` provides
`claim / mutate / renew / release` with the same contract for Agent and
Workflow. `mutate` acquires a SQLite write lock via an UPDATE restricted by
`kind,run_id,lease_token,expires_ms>now` inside `$app.runInTransaction`,
then rechecks run ownership and `running` status before updating checkpoint.
A formerly valid/stolen lease, cancelled run or expired lease cannot commit
a stale checkpoint.

**Fail-closed persistence:** checkpoint and terminal state writes no longer
silently swallow errors. Agent's LLM call budget reservation now participates
in guarded transactions, so a lost owner cannot consume another worker's
run state. Workflow also guards checkpoint/status commits and unexpected-error
fallbacks. Tick release includes the token, so an old release cannot erase
a new owner's lease.

**Recovery:** `checkpoint.claim_until` remains a UI compatibility hint,
not scheduling authority. Both ticks and the standalone Worker bridge use
live database leases, allowing recovery after a crashed process left a future
checkpoint hint. `renew` extends only an unexpired owned lease before
expensive LLM requests or external write-intent setup.

## Verification

- SQLite SQL-backed 3-part suite tests lost owner, cancelled run,
  lease takeover, renewal and conditional release for both Agent and Workflow.
- Real isolated PocketBase concurrent E2E: six competing ticks share one POST;
  ambiguous writes stay un-replayed; lease takeover while an external write
  is in flight must not commit old-owner state; new worker reuses persisted
  result without a second POST. A separate in-flight cancellation fixture
  confirms that a late successful remote write does not turn a cancelled
  Workflow into succeeded/failed and does not retry its side effect.
- Real Worker bridge recovers crashed run even with an hour-long stale
  checkpoint hint. Agent test checks identical behavior independently.
- `renew` fails when the worker is no longer owner or the run is cancelled,
  rather than resurrecting a stopped task lease.
- Full `pnpm check` and 19 real PocketBase E2Es passed locally after the
  lease-guard integration; final change-set CI must also pass before approval.
- Operator rollout must verify recent DB backups, worker restart, active-lease
  takeover, cancellation during slow HTTP calls and write-journal recovery.

## Known boundaries

- No external side-effect exactly-once claim; a third-party service must
  enforce its own idempotency to prove exactly-once under partitions.
- Lease renewal is **at operation boundaries**, not a continuously running
  heartbeat during synchronous blocking calls; >10 min in one blocking call
  may still result in duplicated read-only model calls.
- Event tracing is not atomically coupled to every checkpoint commit; stale
  traces might need reconciliation. No generalized dead-letter queue,
  time-travel checkpoint system or PostgreSQL cutover in this scope.
- Production rollout requires explicit backend-owner approval, backup,
  fault-injection/UAT and release window. Keep this work unmerged to GitHub
  main while LAN autodeploy is active.
