"use strict"

// Non-destructive schema baseline and indexes for V6 scheduler, atomic run
// leases and non-idempotent tool effect journal. No V6 data is moved or rewritten.
var journal = require(__hooks + "/modules/schema_journal.js")

function applyScheduleMigrations(app) {
  journal.applySteps(app, [
    {
      id: "schedule_0001_v6_baseline",
      description: "Register V6 schedules and occurrences without changing stored tasks",
      apply: function (tx) {
        var statements = [
          "CREATE TABLE IF NOT EXISTS agent_studio_schedules (" +
            "id TEXT PRIMARY KEY, rh_user_id TEXT NOT NULL, name TEXT NOT NULL," +
            "target_kind TEXT NOT NULL CHECK(target_kind IN ('agent','workflow')), target_id TEXT NOT NULL," +
            "instruction TEXT NOT NULL, recurrence_kind TEXT NOT NULL," +
            "interval_minutes INTEGER NOT NULL DEFAULT 60, time_zone TEXT NOT NULL," +
            "local_time TEXT NOT NULL, weekday INTEGER NOT NULL DEFAULT 1," +
            "start_at_ms INTEGER NOT NULL, next_at_ms INTEGER NOT NULL," +
            "model_connection_id TEXT NOT NULL DEFAULT '', model_id TEXT NOT NULL DEFAULT ''," +
            "max_steps INTEGER NOT NULL DEFAULT 10, enabled INTEGER NOT NULL DEFAULT 1," +
            "deleted INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1," +
            "created_ms INTEGER NOT NULL, updated_ms INTEGER NOT NULL, last_due_ms INTEGER NOT NULL DEFAULT 0)",
          "CREATE INDEX IF NOT EXISTS idx_agent_sched_owner ON agent_studio_schedules(rh_user_id,deleted,updated_ms)",
          "CREATE INDEX IF NOT EXISTS idx_agent_sched_due ON agent_studio_schedules(enabled,deleted,next_at_ms)",
          "CREATE TABLE IF NOT EXISTS agent_studio_schedule_occurrences (" +
            "id TEXT PRIMARY KEY, schedule_id TEXT NOT NULL, rh_user_id TEXT NOT NULL," +
            "scheduled_for_ms INTEGER NOT NULL, schedule_revision INTEGER NOT NULL," +
            "run_id TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0," +
            "locked_until_ms INTEGER NOT NULL DEFAULT 0, next_retry_ms INTEGER NOT NULL DEFAULT 0," +
            "error TEXT NOT NULL DEFAULT '', created_ms INTEGER NOT NULL, updated_ms INTEGER NOT NULL," +
            "UNIQUE(schedule_id,scheduled_for_ms))",
          "CREATE INDEX IF NOT EXISTS idx_agent_sched_occ_owner ON agent_studio_schedule_occurrences(rh_user_id,created_ms)",
          "CREATE INDEX IF NOT EXISTS idx_agent_sched_occ_pending ON agent_studio_schedule_occurrences(status,next_retry_ms,locked_until_ms)",
        ]
        for (var i = 0; i < statements.length; i++) tx.db().newQuery(statements[i]).execute()
      },
    },
    {
      id: "schedule_0002_owner_indexes",
      description: "Add non-destructive tenant-scoped schedule target and occurrence indexes",
      apply: function (tx) {
        tx.db().newQuery(
          "CREATE INDEX IF NOT EXISTS idx_as_schedule_owner_target " +
          "ON agent_studio_schedules(rh_user_id,target_kind,target_id,deleted)"
        ).execute()
        tx.db().newQuery(
          "CREATE INDEX IF NOT EXISTS idx_as_schedule_owner_due " +
          "ON agent_studio_schedules(rh_user_id,deleted,enabled,next_at_ms)"
        ).execute()
        tx.db().newQuery(
          "CREATE INDEX IF NOT EXISTS idx_as_occ_owner_schedule " +
          "ON agent_studio_schedule_occurrences(rh_user_id,schedule_id,created_ms)"
        ).execute()
      },
    },
  ])
}

function applyExecutionMigrations(app) {
  journal.applySteps(app, [
    {
      id: "execution_0001_v6_baseline",
      description: "Register existing V6 CAS leases and tool side-effect journal",
      apply: function (tx) {
        var statements = [
          "CREATE TABLE IF NOT EXISTS agent_studio_run_leases (" +
            "kind TEXT NOT NULL CHECK(kind IN ('agent','workflow'))," +
            "run_id TEXT NOT NULL, lease_token TEXT NOT NULL," +
            "acquired_ms INTEGER NOT NULL, expires_ms INTEGER NOT NULL," +
            "attempts INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(kind,run_id))",
          "CREATE INDEX IF NOT EXISTS idx_agent_studio_run_leases_expires ON agent_studio_run_leases(expires_ms)",
          "CREATE TABLE IF NOT EXISTS agent_studio_side_effects (" +
            "kind TEXT NOT NULL CHECK(kind IN ('agent','workflow'))," +
            "run_id TEXT NOT NULL, step_key TEXT NOT NULL, tool_name TEXT NOT NULL," +
            "args_hash TEXT NOT NULL, idempotency_key TEXT NOT NULL," +
            "status TEXT NOT NULL CHECK(status IN ('started','succeeded','unknown'))," +
            "result_text TEXT NOT NULL DEFAULT '', created_ms INTEGER NOT NULL," +
            "updated_ms INTEGER NOT NULL, PRIMARY KEY(kind,run_id,step_key))",
          "CREATE INDEX IF NOT EXISTS idx_agent_studio_effects_status ON agent_studio_side_effects(status,updated_ms)",
        ]
        for (var i = 0; i < statements.length; i++) tx.db().newQuery(statements[i]).execute()
      },
    },
    {
      id: "execution_0002_monitor_indexes",
      description: "Add non-destructive indexes for lease cleanup and effect auditing",
      apply: function (tx) {
        tx.db().newQuery(
          "CREATE INDEX IF NOT EXISTS idx_as_effects_run " +
          "ON agent_studio_side_effects(kind,run_id,updated_ms)"
        ).execute()
        tx.db().newQuery(
          "CREATE INDEX IF NOT EXISTS idx_as_effects_status_created " +
          "ON agent_studio_side_effects(status,created_ms)"
        ).execute()
      },
    },
    {
      id: "execution_0003_trace_spans",
      description: "Add privacy-safe tenant-scoped Agent and Workflow model trace spans",
      apply: function (tx) {
        tx.db().newQuery(
          "CREATE TABLE IF NOT EXISTS agent_studio_execution_spans (" +
          "id TEXT PRIMARY KEY,rh_user_id TEXT NOT NULL,trace_id TEXT NOT NULL," +
          "run_kind TEXT NOT NULL CHECK(run_kind IN ('agent','workflow'))," +
          "run_id TEXT NOT NULL,step_ref TEXT NOT NULL,operation TEXT NOT NULL," +
          "status TEXT NOT NULL CHECK(status IN ('succeeded','failed'))," +
          "error_code TEXT NOT NULL DEFAULT '',duration_ms INTEGER NOT NULL," +
          "created_ms INTEGER NOT NULL)"
        ).execute()
        tx.db().newQuery(
          "CREATE INDEX IF NOT EXISTS idx_as_spans_owner_run " +
          "ON agent_studio_execution_spans(rh_user_id,run_kind,run_id,created_ms)"
        ).execute()
        tx.db().newQuery(
          "CREATE INDEX IF NOT EXISTS idx_as_spans_created " +
          "ON agent_studio_execution_spans(created_ms)"
        ).execute()
      },
    },
    {
      id: "execution_0004_worker_lease_attribution",
      description: "Attribute CAS leases to verified Worker instances without rewriting old leases",
      apply: function (tx) {
        var existing = new DynamicModel({ total: 0 })
        tx.db().newQuery(
          "SELECT COUNT(*) AS total FROM pragma_table_info('agent_studio_run_leases') " +
          "WHERE name='owner_instance'"
        ).one(existing)
        if (Number(existing.total || 0) === 0) {
          tx.db().newQuery(
            "ALTER TABLE agent_studio_run_leases " +
            "ADD COLUMN owner_instance TEXT NOT NULL DEFAULT ''"
          ).execute()
        }
        tx.db().newQuery(
          "CREATE INDEX IF NOT EXISTS idx_as_leases_worker " +
          "ON agent_studio_run_leases(owner_instance,expires_ms)"
        ).execute()
      },
    },
  ])
}

module.exports = {
  applyScheduleMigrations: applyScheduleMigrations,
  applyExecutionMigrations: applyExecutionMigrations,
}
