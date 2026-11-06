// Authored closed catalog manifest; never an installed-schema attestation.
export const monitorLiveTables=[
  {
    "name": "monitor_live_cases",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "owner_user_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "title",
        "type": "text",
        "required": true
      },
      {
        "name": "data_space",
        "type": "text",
        "required": true
      },
      {
        "name": "questions",
        "type": "jsonb",
        "required": true
      },
      {
        "name": "created_ms",
        "type": "bigint",
        "required": true
      }
    ],
    "constraints": [
      {
        "name": "monitor_live_cases_pkey",
        "type": "p",
        "keys": [
          "id"
        ],
        "definition": "PRIMARY KEY(id)"
      },
      {
        "name": "monitor_live_cases_owner_uq",
        "type": "u",
        "keys": [
          "id",
          "owner_user_id"
        ],
        "definition": "UNIQUE(id,owner_user_id)"
      },
      {
        "name": "monitor_live_cases_user_fk",
        "type": "f",
        "keys": [
          "owner_user_id"
        ],
        "foreign": "users",
        "remote": [
          "id"
        ],
        "definition": "FOREIGN KEY(owner_user_id) REFERENCES agentstudio.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_cases_value_ck",
        "type": "c",
        "keys": [
          "title",
          "data_space",
          "questions"
        ],
        "definition": "CHECK(agentstudio.monitor_live_cases_value_valid(title,data_space,questions))"
      },
      {
        "name": "monitor_live_cases_time_ck",
        "type": "c",
        "keys": [
          "created_ms"
        ],
        "definition": "CHECK(agentstudio.monitor_live_cases_time_valid(created_ms))"
      }
    ],
    "mutable": false
  },
  {
    "name": "monitor_live_monitors",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "owner_user_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "case_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "schedule_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "revision",
        "type": "bigint",
        "required": true
      },
      {
        "name": "enabled",
        "type": "boolean",
        "required": true
      },
      {
        "name": "definition",
        "type": "jsonb",
        "required": true
      },
      {
        "name": "definition_hash",
        "type": "text",
        "required": true
      },
      {
        "name": "baseline_check_id",
        "type": "uuid",
        "required": false
      },
      {
        "name": "current_check_id",
        "type": "uuid",
        "required": false
      },
      {
        "name": "idempotency_key",
        "type": "text",
        "required": true
      },
      {
        "name": "request_hash",
        "type": "text",
        "required": true
      },
      {
        "name": "created_ms",
        "type": "bigint",
        "required": true
      },
      {
        "name": "updated_ms",
        "type": "bigint",
        "required": true
      }
    ],
    "constraints": [
      {
        "name": "monitor_live_monitors_pkey",
        "type": "p",
        "keys": [
          "id"
        ],
        "definition": "PRIMARY KEY(id)"
      },
      {
        "name": "monitor_live_monitors_owner_case_uq",
        "type": "u",
        "keys": [
          "id",
          "owner_user_id",
          "case_id"
        ],
        "definition": "UNIQUE(id,owner_user_id,case_id)"
      },
      {
        "name": "monitor_live_monitors_schedule_uq",
        "type": "u",
        "keys": [
          "schedule_id"
        ],
        "definition": "UNIQUE(schedule_id)"
      },
      {
        "name": "monitor_live_monitors_idempotency_uq",
        "type": "u",
        "keys": [
          "owner_user_id",
          "idempotency_key"
        ],
        "definition": "UNIQUE(owner_user_id,idempotency_key)"
      },
      {
        "name": "monitor_live_monitors_case_fk",
        "type": "f",
        "keys": [
          "case_id",
          "owner_user_id"
        ],
        "foreign": "monitor_live_cases",
        "remote": [
          "id",
          "owner_user_id"
        ],
        "definition": "FOREIGN KEY(case_id,owner_user_id) REFERENCES agentstudio.monitor_live_cases(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_monitors_schedule_fk",
        "type": "f",
        "keys": [
          "schedule_id",
          "owner_user_id"
        ],
        "foreign": "schedules",
        "remote": [
          "id",
          "owner_user_id"
        ],
        "definition": "FOREIGN KEY(schedule_id,owner_user_id) REFERENCES agentstudio.schedules(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_monitors_value_ck",
        "type": "c",
        "keys": [
          "revision",
          "definition",
          "definition_hash",
          "idempotency_key",
          "request_hash"
        ],
        "definition": "CHECK(agentstudio.monitor_live_monitors_value_valid(revision,definition,definition_hash,idempotency_key,request_hash))"
      },
      {
        "name": "monitor_live_monitors_time_ck",
        "type": "c",
        "keys": [
          "created_ms",
          "updated_ms"
        ],
        "definition": "CHECK(agentstudio.monitor_live_monitors_time_valid(created_ms,updated_ms))"
      },
      {
        "name": "monitor_live_monitors_version_fk",
        "type": "f",
        "keys": [
          "id",
          "revision",
          "owner_user_id",
          "case_id"
        ],
        "foreign": "monitor_live_versions",
        "remote": [
          "monitor_id",
          "revision",
          "owner_user_id",
          "case_id"
        ],
        "definition": "FOREIGN KEY(id,revision,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_versions(monitor_id,revision,owner_user_id,case_id) ON UPDATE NO ACTION ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED",
        "deferred": true
      },
      {
        "name": "monitor_live_monitors_current_fk",
        "type": "f",
        "keys": [
          "current_check_id",
          "owner_user_id",
          "id"
        ],
        "foreign": "monitor_live_checks",
        "remote": [
          "id",
          "owner_user_id",
          "monitor_id"
        ],
        "definition": "FOREIGN KEY(current_check_id,owner_user_id,id) REFERENCES agentstudio.monitor_live_checks(id,owner_user_id,monitor_id) ON UPDATE NO ACTION ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED",
        "deferred": true
      },
      {
        "name": "monitor_live_monitors_baseline_fk",
        "type": "f",
        "keys": [
          "baseline_check_id",
          "owner_user_id",
          "id"
        ],
        "foreign": "monitor_live_checks",
        "remote": [
          "id",
          "owner_user_id",
          "monitor_id"
        ],
        "definition": "FOREIGN KEY(baseline_check_id,owner_user_id,id) REFERENCES agentstudio.monitor_live_checks(id,owner_user_id,monitor_id) ON UPDATE NO ACTION ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED",
        "deferred": true
      }
    ],
    "mutable": true
  },
  {
    "name": "monitor_live_versions",
    "columns": [
      {
        "name": "monitor_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "revision",
        "type": "bigint",
        "required": true
      },
      {
        "name": "owner_user_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "case_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "definition",
        "type": "jsonb",
        "required": true
      },
      {
        "name": "definition_hash",
        "type": "text",
        "required": true
      },
      {
        "name": "idempotency_key",
        "type": "text",
        "required": true
      },
      {
        "name": "request_hash",
        "type": "text",
        "required": true
      },
      {
        "name": "created_ms",
        "type": "bigint",
        "required": true
      }
    ],
    "constraints": [
      {
        "name": "monitor_live_versions_pkey",
        "type": "p",
        "keys": [
          "monitor_id",
          "revision"
        ],
        "definition": "PRIMARY KEY(monitor_id,revision)"
      },
      {
        "name": "monitor_live_versions_owner_case_uq",
        "type": "u",
        "keys": [
          "monitor_id",
          "revision",
          "owner_user_id",
          "case_id"
        ],
        "definition": "UNIQUE(monitor_id,revision,owner_user_id,case_id)"
      },
      {
        "name": "monitor_live_versions_idempotency_uq",
        "type": "u",
        "keys": [
          "monitor_id",
          "idempotency_key"
        ],
        "definition": "UNIQUE(monitor_id,idempotency_key)"
      },
      {
        "name": "monitor_live_versions_monitor_fk",
        "type": "f",
        "keys": [
          "monitor_id",
          "owner_user_id",
          "case_id"
        ],
        "foreign": "monitor_live_monitors",
        "remote": [
          "id",
          "owner_user_id",
          "case_id"
        ],
        "definition": "FOREIGN KEY(monitor_id,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_monitors(id,owner_user_id,case_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_versions_value_ck",
        "type": "c",
        "keys": [
          "revision",
          "definition",
          "definition_hash",
          "request_hash",
          "idempotency_key"
        ],
        "definition": "CHECK(agentstudio.monitor_live_versions_value_valid(revision,definition,definition_hash,request_hash,idempotency_key))"
      },
      {
        "name": "monitor_live_versions_time_ck",
        "type": "c",
        "keys": [
          "created_ms"
        ],
        "definition": "CHECK(agentstudio.monitor_live_versions_time_valid(created_ms))"
      }
    ],
    "mutable": false
  },
  {
    "name": "monitor_live_checks",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "owner_user_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "monitor_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "case_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "monitor_revision",
        "type": "bigint",
        "required": true
      },
      {
        "name": "schedule_revision",
        "type": "bigint",
        "required": true
      },
      {
        "name": "occurrence_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "run_id",
        "type": "uuid",
        "required": false
      },
      {
        "name": "definition_hash",
        "type": "text",
        "required": true
      },
      {
        "name": "resource_hash",
        "type": "text",
        "required": true
      },
      {
        "name": "status",
        "type": "text",
        "required": true
      },
      {
        "name": "fact_set_id",
        "type": "uuid",
        "required": false
      },
      {
        "name": "freeze_job_id",
        "type": "uuid",
        "required": false
      },
      {
        "name": "baseline_check_id",
        "type": "uuid",
        "required": false
      },
      {
        "name": "receipts",
        "type": "jsonb",
        "required": true
      },
      {
        "name": "assessment",
        "type": "jsonb",
        "required": true
      },
      {
        "name": "error",
        "type": "text",
        "required": true
      },
      {
        "name": "lease_owner",
        "type": "text",
        "required": false
      },
      {
        "name": "lease_token",
        "type": "uuid",
        "required": false
      },
      {
        "name": "lease_version",
        "type": "bigint",
        "required": true
      },
      {
        "name": "lease_until_ms",
        "type": "bigint",
        "required": true
      },
      {
        "name": "tool_calls",
        "type": "bigint",
        "required": true
      },
      {
        "name": "read_calls",
        "type": "bigint",
        "required": true
      },
      {
        "name": "model_calls",
        "type": "bigint",
        "required": true
      },
      {
        "name": "wall_deadline_ms",
        "type": "bigint",
        "required": true
      },
      {
        "name": "created_ms",
        "type": "bigint",
        "required": true
      },
      {
        "name": "updated_ms",
        "type": "bigint",
        "required": true
      }
    ],
    "constraints": [
      {
        "name": "monitor_live_checks_pkey",
        "type": "p",
        "keys": [
          "id"
        ],
        "definition": "PRIMARY KEY(id)"
      },
      {
        "name": "monitor_live_checks_owner_case_uq",
        "type": "u",
        "keys": [
          "id",
          "owner_user_id",
          "case_id"
        ],
        "definition": "UNIQUE(id,owner_user_id,case_id)"
      },
      {
        "name": "monitor_live_checks_owner_monitor_uq",
        "type": "u",
        "keys": [
          "id",
          "owner_user_id",
          "monitor_id"
        ],
        "definition": "UNIQUE(id,owner_user_id,monitor_id)"
      },
      {
        "name": "monitor_live_checks_occurrence_uq",
        "type": "u",
        "keys": [
          "occurrence_id"
        ],
        "definition": "UNIQUE(occurrence_id)"
      },
      {
        "name": "monitor_live_checks_run_uq",
        "type": "u",
        "keys": [
          "run_id"
        ],
        "definition": "UNIQUE(run_id)"
      },
      {
        "name": "monitor_live_checks_version_fk",
        "type": "f",
        "keys": [
          "monitor_id",
          "monitor_revision",
          "owner_user_id",
          "case_id"
        ],
        "foreign": "monitor_live_versions",
        "remote": [
          "monitor_id",
          "revision",
          "owner_user_id",
          "case_id"
        ],
        "definition": "FOREIGN KEY(monitor_id,monitor_revision,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_versions(monitor_id,revision,owner_user_id,case_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_checks_run_fk",
        "type": "f",
        "keys": [
          "run_id",
          "owner_user_id"
        ],
        "foreign": "runs",
        "remote": [
          "id",
          "owner_user_id"
        ],
        "definition": "FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_checks_occurrence_fk",
        "type": "f",
        "keys": [
          "occurrence_id"
        ],
        "foreign": "schedule_occurrences",
        "remote": [
          "id"
        ],
        "definition": "FOREIGN KEY(occurrence_id) REFERENCES agentstudio.schedule_occurrences(id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_checks_value_ck",
        "type": "c",
        "keys": [
          "monitor_revision",
          "schedule_revision",
          "definition_hash",
          "resource_hash",
          "status",
          "receipts",
          "assessment",
          "error"
        ],
        "definition": "CHECK(agentstudio.monitor_live_checks_value_valid(monitor_revision,schedule_revision,definition_hash,resource_hash,status,receipts,assessment,error))"
      },
      {
        "name": "monitor_live_checks_lease_ck",
        "type": "c",
        "keys": [
          "lease_owner",
          "lease_token",
          "lease_version",
          "lease_until_ms",
          "tool_calls",
          "read_calls",
          "model_calls",
          "wall_deadline_ms"
        ],
        "definition": "CHECK(agentstudio.monitor_live_checks_lease_valid(lease_owner,lease_token,lease_version,lease_until_ms,tool_calls,read_calls,model_calls,wall_deadline_ms))"
      },
      {
        "name": "monitor_live_checks_time_ck",
        "type": "c",
        "keys": [
          "created_ms",
          "updated_ms"
        ],
        "definition": "CHECK(agentstudio.monitor_live_checks_time_valid(created_ms,updated_ms))"
      },
      {
        "name": "monitor_live_checks_baseline_fk",
        "type": "f",
        "keys": [
          "baseline_check_id",
          "owner_user_id",
          "monitor_id"
        ],
        "foreign": "monitor_live_checks",
        "remote": [
          "id",
          "owner_user_id",
          "monitor_id"
        ],
        "definition": "FOREIGN KEY(baseline_check_id,owner_user_id,monitor_id) REFERENCES agentstudio.monitor_live_checks(id,owner_user_id,monitor_id) ON UPDATE NO ACTION ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED",
        "deferred": true
      },
      {
        "name": "monitor_live_checks_fact_fk",
        "type": "f",
        "keys": [
          "fact_set_id",
          "owner_user_id",
          "case_id"
        ],
        "foreign": "monitor_live_fact_sets",
        "remote": [
          "id",
          "owner_user_id",
          "case_id"
        ],
        "definition": "FOREIGN KEY(fact_set_id,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_fact_sets(id,owner_user_id,case_id) ON UPDATE NO ACTION ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED",
        "deferred": true
      },
      {
        "name": "monitor_live_checks_freeze_fk",
        "type": "f",
        "keys": [
          "freeze_job_id",
          "owner_user_id",
          "case_id"
        ],
        "foreign": "monitor_live_freeze_jobs",
        "remote": [
          "id",
          "owner_user_id",
          "case_id"
        ],
        "definition": "FOREIGN KEY(freeze_job_id,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_freeze_jobs(id,owner_user_id,case_id) ON UPDATE NO ACTION ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED",
        "deferred": true
      }
    ],
    "mutable": true
  },
  {
    "name": "monitor_live_requests",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "owner_user_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "case_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "check_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "run_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "auth_slot_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "source_id",
        "type": "text",
        "required": true
      },
      {
        "name": "request_hash",
        "type": "text",
        "required": true
      },
      {
        "name": "source_definition",
        "type": "jsonb",
        "required": true
      },
      {
        "name": "lease_token",
        "type": "uuid",
        "required": true
      },
      {
        "name": "lease_version",
        "type": "bigint",
        "required": true
      },
      {
        "name": "state",
        "type": "text",
        "required": true
      },
      {
        "name": "result_id",
        "type": "uuid",
        "required": false
      },
      {
        "name": "error",
        "type": "text",
        "required": true
      },
      {
        "name": "started_ms",
        "type": "bigint",
        "required": true
      },
      {
        "name": "finished_ms",
        "type": "bigint",
        "required": true
      },
      {
        "name": "material_read_ms",
        "type": "bigint",
        "required": true
      }
    ],
    "constraints": [
      {
        "name": "monitor_live_requests_pkey",
        "type": "p",
        "keys": [
          "id"
        ],
        "definition": "PRIMARY KEY(id)"
      },
      {
        "name": "monitor_live_requests_owner_case_uq",
        "type": "u",
        "keys": [
          "id",
          "owner_user_id",
          "case_id"
        ],
        "definition": "UNIQUE(id,owner_user_id,case_id)"
      },
      {
        "name": "monitor_live_requests_source_uq",
        "type": "u",
        "keys": [
          "check_id",
          "source_id"
        ],
        "definition": "UNIQUE(check_id,source_id)"
      },
      {
        "name": "monitor_live_requests_check_fk",
        "type": "f",
        "keys": [
          "check_id",
          "owner_user_id",
          "case_id"
        ],
        "foreign": "monitor_live_checks",
        "remote": [
          "id",
          "owner_user_id",
          "case_id"
        ],
        "definition": "FOREIGN KEY(check_id,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_checks(id,owner_user_id,case_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_requests_run_fk",
        "type": "f",
        "keys": [
          "run_id",
          "owner_user_id"
        ],
        "foreign": "runs",
        "remote": [
          "id",
          "owner_user_id"
        ],
        "definition": "FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_requests_value_ck",
        "type": "c",
        "keys": [
          "source_id",
          "request_hash",
          "source_definition",
          "lease_version",
          "state",
          "error",
          "started_ms",
          "finished_ms",
          "material_read_ms"
        ],
        "definition": "CHECK(agentstudio.monitor_live_requests_value_valid(source_id,request_hash,source_definition,lease_version,state,error,started_ms,finished_ms,material_read_ms))"
      },
      {
        "name": "monitor_live_requests_result_fk",
        "type": "f",
        "keys": [
          "result_id",
          "owner_user_id",
          "case_id"
        ],
        "foreign": "monitor_live_receipts",
        "remote": [
          "id",
          "owner_user_id",
          "case_id"
        ],
        "definition": "FOREIGN KEY(result_id,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_receipts(id,owner_user_id,case_id) ON UPDATE NO ACTION ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED",
        "deferred": true
      },
      {
        "name": "monitor_live_requests_authority_fk",
        "type": "f",
        "keys": [
          "auth_slot_id",
          "owner_user_id",
          "case_id"
        ],
        "foreign": "monitor_live_effect_slots",
        "remote": [
          "id",
          "owner_user_id",
          "case_id"
        ],
        "definition": "FOREIGN KEY(auth_slot_id,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_effect_slots(id,owner_user_id,case_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      }
    ],
    "mutable": true
  },
  {
    "name": "monitor_live_receipts",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "owner_user_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "case_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "run_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "step_key",
        "type": "text",
        "required": true
      },
      {
        "name": "monitor_check_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "source_id",
        "type": "text",
        "required": true
      },
      {
        "name": "request_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "request_hash",
        "type": "text",
        "required": true
      },
      {
        "name": "payload",
        "type": "jsonb",
        "required": true
      },
      {
        "name": "canonical_payload",
        "type": "text",
        "required": true
      },
      {
        "name": "source_scope",
        "type": "jsonb",
        "required": true
      },
      {
        "name": "content_hash",
        "type": "text",
        "required": true
      },
      {
        "name": "projection_hash",
        "type": "text",
        "required": true
      },
      {
        "name": "projection_canonical",
        "type": "text",
        "required": true
      },
      {
        "name": "created_ms",
        "type": "bigint",
        "required": true
      }
    ],
    "constraints": [
      {
        "name": "monitor_live_receipts_pkey",
        "type": "p",
        "keys": [
          "id"
        ],
        "definition": "PRIMARY KEY(id)"
      },
      {
        "name": "monitor_live_receipts_owner_case_uq",
        "type": "u",
        "keys": [
          "id",
          "owner_user_id",
          "case_id"
        ],
        "definition": "UNIQUE(id,owner_user_id,case_id)"
      },
      {
        "name": "monitor_live_receipts_request_uq",
        "type": "u",
        "keys": [
          "request_id"
        ],
        "definition": "UNIQUE(request_id)"
      },
      {
        "name": "monitor_live_receipts_check_source_uq",
        "type": "u",
        "keys": [
          "monitor_check_id",
          "source_id"
        ],
        "definition": "UNIQUE(monitor_check_id,source_id)"
      },
      {
        "name": "monitor_live_receipts_case_fk",
        "type": "f",
        "keys": [
          "case_id",
          "owner_user_id"
        ],
        "foreign": "monitor_live_cases",
        "remote": [
          "id",
          "owner_user_id"
        ],
        "definition": "FOREIGN KEY(case_id,owner_user_id) REFERENCES agentstudio.monitor_live_cases(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_receipts_run_fk",
        "type": "f",
        "keys": [
          "run_id",
          "owner_user_id"
        ],
        "foreign": "runs",
        "remote": [
          "id",
          "owner_user_id"
        ],
        "definition": "FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_receipts_check_fk",
        "type": "f",
        "keys": [
          "monitor_check_id",
          "owner_user_id",
          "case_id"
        ],
        "foreign": "monitor_live_checks",
        "remote": [
          "id",
          "owner_user_id",
          "case_id"
        ],
        "definition": "FOREIGN KEY(monitor_check_id,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_checks(id,owner_user_id,case_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_receipts_request_fk",
        "type": "f",
        "keys": [
          "request_id",
          "owner_user_id",
          "case_id"
        ],
        "foreign": "monitor_live_requests",
        "remote": [
          "id",
          "owner_user_id",
          "case_id"
        ],
        "definition": "FOREIGN KEY(request_id,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_requests(id,owner_user_id,case_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_receipts_value_ck",
        "type": "c",
        "keys": [
          "step_key",
          "source_id",
          "request_hash",
          "payload",
          "canonical_payload",
          "content_hash",
          "projection_hash",
          "projection_canonical",
          "source_scope"
        ],
        "definition": "CHECK(agentstudio.monitor_live_receipts_value_valid(step_key,source_id,request_hash,payload,canonical_payload,content_hash,projection_hash,projection_canonical,source_scope))"
      },
      {
        "name": "monitor_live_receipts_time_ck",
        "type": "c",
        "keys": [
          "created_ms"
        ],
        "definition": "CHECK(agentstudio.monitor_live_receipts_time_valid(created_ms))"
      }
    ],
    "mutable": false
  },
  {
    "name": "monitor_live_records",
    "columns": [
      {
        "name": "record_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "version",
        "type": "bigint",
        "required": true
      },
      {
        "name": "owner_user_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "case_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "schema_id",
        "type": "text",
        "required": true
      },
      {
        "name": "payload",
        "type": "jsonb",
        "required": true
      },
      {
        "name": "source_refs",
        "type": "jsonb",
        "required": true
      },
      {
        "name": "relation_versions",
        "type": "jsonb",
        "required": true
      },
      {
        "name": "run_id",
        "type": "uuid",
        "required": false
      },
      {
        "name": "idempotency_key",
        "type": "text",
        "required": true
      },
      {
        "name": "request_hash",
        "type": "text",
        "required": true
      },
      {
        "name": "created_ms",
        "type": "bigint",
        "required": true
      }
    ],
    "constraints": [
      {
        "name": "monitor_live_records_pkey",
        "type": "p",
        "keys": [
          "record_id",
          "version"
        ],
        "definition": "PRIMARY KEY(record_id,version)"
      },
      {
        "name": "monitor_live_records_owner_case_uq",
        "type": "u",
        "keys": [
          "record_id",
          "version",
          "owner_user_id",
          "case_id"
        ],
        "definition": "UNIQUE(record_id,version,owner_user_id,case_id)"
      },
      {
        "name": "monitor_live_records_idempotency_uq",
        "type": "u",
        "keys": [
          "owner_user_id",
          "case_id",
          "idempotency_key"
        ],
        "definition": "UNIQUE(owner_user_id,case_id,idempotency_key)"
      },
      {
        "name": "monitor_live_records_case_fk",
        "type": "f",
        "keys": [
          "case_id",
          "owner_user_id"
        ],
        "foreign": "monitor_live_cases",
        "remote": [
          "id",
          "owner_user_id"
        ],
        "definition": "FOREIGN KEY(case_id,owner_user_id) REFERENCES agentstudio.monitor_live_cases(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_records_run_fk",
        "type": "f",
        "keys": [
          "run_id",
          "owner_user_id"
        ],
        "foreign": "runs",
        "remote": [
          "id",
          "owner_user_id"
        ],
        "definition": "FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_records_value_ck",
        "type": "c",
        "keys": [
          "version",
          "schema_id",
          "payload",
          "source_refs",
          "relation_versions",
          "idempotency_key",
          "request_hash"
        ],
        "definition": "CHECK(agentstudio.monitor_live_records_value_valid(version,schema_id,payload,source_refs,relation_versions,idempotency_key,request_hash))"
      },
      {
        "name": "monitor_live_records_time_ck",
        "type": "c",
        "keys": [
          "created_ms"
        ],
        "definition": "CHECK(agentstudio.monitor_live_records_time_valid(created_ms))"
      }
    ],
    "mutable": false
  },
  {
    "name": "monitor_live_fact_sets",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "owner_user_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "case_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "check_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "run_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "payload",
        "type": "jsonb",
        "required": true
      },
      {
        "name": "canonical_payload",
        "type": "text",
        "required": true
      },
      {
        "name": "content_hash",
        "type": "text",
        "required": true
      },
      {
        "name": "created_ms",
        "type": "bigint",
        "required": true
      }
    ],
    "constraints": [
      {
        "name": "monitor_live_fact_sets_pkey",
        "type": "p",
        "keys": [
          "id"
        ],
        "definition": "PRIMARY KEY(id)"
      },
      {
        "name": "monitor_live_fact_sets_owner_case_uq",
        "type": "u",
        "keys": [
          "id",
          "owner_user_id",
          "case_id"
        ],
        "definition": "UNIQUE(id,owner_user_id,case_id)"
      },
      {
        "name": "monitor_live_fact_sets_check_uq",
        "type": "u",
        "keys": [
          "check_id"
        ],
        "definition": "UNIQUE(check_id)"
      },
      {
        "name": "monitor_live_fact_sets_case_fk",
        "type": "f",
        "keys": [
          "case_id",
          "owner_user_id"
        ],
        "foreign": "monitor_live_cases",
        "remote": [
          "id",
          "owner_user_id"
        ],
        "definition": "FOREIGN KEY(case_id,owner_user_id) REFERENCES agentstudio.monitor_live_cases(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_fact_sets_run_fk",
        "type": "f",
        "keys": [
          "run_id",
          "owner_user_id"
        ],
        "foreign": "runs",
        "remote": [
          "id",
          "owner_user_id"
        ],
        "definition": "FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_fact_sets_check_fk",
        "type": "f",
        "keys": [
          "check_id",
          "owner_user_id",
          "case_id"
        ],
        "foreign": "monitor_live_checks",
        "remote": [
          "id",
          "owner_user_id",
          "case_id"
        ],
        "definition": "FOREIGN KEY(check_id,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_checks(id,owner_user_id,case_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_fact_sets_value_ck",
        "type": "c",
        "keys": [
          "payload",
          "canonical_payload",
          "content_hash"
        ],
        "definition": "CHECK(agentstudio.monitor_live_fact_sets_value_valid(payload,canonical_payload,content_hash))"
      },
      {
        "name": "monitor_live_fact_sets_time_ck",
        "type": "c",
        "keys": [
          "created_ms"
        ],
        "definition": "CHECK(agentstudio.monitor_live_fact_sets_time_valid(created_ms))"
      }
    ],
    "mutable": false
  },
  {
    "name": "monitor_live_freeze_jobs",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "owner_user_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "case_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "check_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "run_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "manifest",
        "type": "jsonb",
        "required": true
      },
      {
        "name": "manifest_hash",
        "type": "text",
        "required": true
      },
      {
        "name": "next_index",
        "type": "bigint",
        "required": true
      },
      {
        "name": "records",
        "type": "jsonb",
        "required": true
      },
      {
        "name": "reference_records",
        "type": "jsonb",
        "required": true
      },
      {
        "name": "status",
        "type": "text",
        "required": true
      },
      {
        "name": "error",
        "type": "text",
        "required": true
      },
      {
        "name": "created_ms",
        "type": "bigint",
        "required": true
      },
      {
        "name": "updated_ms",
        "type": "bigint",
        "required": true
      }
    ],
    "constraints": [
      {
        "name": "monitor_live_freeze_jobs_pkey",
        "type": "p",
        "keys": [
          "id"
        ],
        "definition": "PRIMARY KEY(id)"
      },
      {
        "name": "monitor_live_freeze_jobs_owner_case_uq",
        "type": "u",
        "keys": [
          "id",
          "owner_user_id",
          "case_id"
        ],
        "definition": "UNIQUE(id,owner_user_id,case_id)"
      },
      {
        "name": "monitor_live_freeze_jobs_check_uq",
        "type": "u",
        "keys": [
          "check_id"
        ],
        "definition": "UNIQUE(check_id)"
      },
      {
        "name": "monitor_live_freeze_jobs_case_fk",
        "type": "f",
        "keys": [
          "case_id",
          "owner_user_id"
        ],
        "foreign": "monitor_live_cases",
        "remote": [
          "id",
          "owner_user_id"
        ],
        "definition": "FOREIGN KEY(case_id,owner_user_id) REFERENCES agentstudio.monitor_live_cases(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_freeze_jobs_run_fk",
        "type": "f",
        "keys": [
          "run_id",
          "owner_user_id"
        ],
        "foreign": "runs",
        "remote": [
          "id",
          "owner_user_id"
        ],
        "definition": "FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_freeze_jobs_check_fk",
        "type": "f",
        "keys": [
          "check_id",
          "owner_user_id",
          "case_id"
        ],
        "foreign": "monitor_live_checks",
        "remote": [
          "id",
          "owner_user_id",
          "case_id"
        ],
        "definition": "FOREIGN KEY(check_id,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_checks(id,owner_user_id,case_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_freeze_jobs_value_ck",
        "type": "c",
        "keys": [
          "manifest",
          "manifest_hash",
          "next_index",
          "records",
          "reference_records",
          "status",
          "error"
        ],
        "definition": "CHECK(agentstudio.monitor_live_freeze_jobs_value_valid(manifest,manifest_hash,next_index,records,reference_records,status,error))"
      },
      {
        "name": "monitor_live_freeze_jobs_time_ck",
        "type": "c",
        "keys": [
          "created_ms",
          "updated_ms"
        ],
        "definition": "CHECK(agentstudio.monitor_live_freeze_jobs_time_valid(created_ms,updated_ms))"
      }
    ],
    "mutable": true
  },
  {
    "name": "monitor_live_record_reviews",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "owner_user_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "case_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "record_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "record_version",
        "type": "bigint",
        "required": true
      },
      {
        "name": "revision",
        "type": "bigint",
        "required": true
      },
      {
        "name": "decision",
        "type": "text",
        "required": true
      },
      {
        "name": "rationale",
        "type": "text",
        "required": true
      },
      {
        "name": "governance_revision",
        "type": "bigint",
        "required": true
      },
      {
        "name": "created_ms",
        "type": "bigint",
        "required": true
      }
    ],
    "constraints": [
      {
        "name": "monitor_live_record_reviews_pkey",
        "type": "p",
        "keys": [
          "id"
        ],
        "definition": "PRIMARY KEY(id)"
      },
      {
        "name": "monitor_live_record_reviews_revision_uq",
        "type": "u",
        "keys": [
          "record_id",
          "record_version",
          "revision"
        ],
        "definition": "UNIQUE(record_id,record_version,revision)"
      },
      {
        "name": "monitor_live_record_reviews_case_fk",
        "type": "f",
        "keys": [
          "case_id",
          "owner_user_id"
        ],
        "foreign": "monitor_live_cases",
        "remote": [
          "id",
          "owner_user_id"
        ],
        "definition": "FOREIGN KEY(case_id,owner_user_id) REFERENCES agentstudio.monitor_live_cases(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_record_reviews_record_fk",
        "type": "f",
        "keys": [
          "record_id",
          "record_version",
          "owner_user_id",
          "case_id"
        ],
        "foreign": "monitor_live_records",
        "remote": [
          "record_id",
          "version",
          "owner_user_id",
          "case_id"
        ],
        "definition": "FOREIGN KEY(record_id,record_version,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_records(record_id,version,owner_user_id,case_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_record_reviews_value_ck",
        "type": "c",
        "keys": [
          "revision",
          "decision",
          "rationale",
          "governance_revision"
        ],
        "definition": "CHECK(agentstudio.monitor_live_record_reviews_value_valid(revision,decision,rationale,governance_revision))"
      },
      {
        "name": "monitor_live_record_reviews_time_ck",
        "type": "c",
        "keys": [
          "created_ms"
        ],
        "definition": "CHECK(agentstudio.monitor_live_record_reviews_time_valid(created_ms))"
      }
    ],
    "mutable": false
  },
  {
    "name": "monitor_live_reviews",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "owner_user_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "monitor_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "check_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "preview_hash",
        "type": "text",
        "required": true
      },
      {
        "name": "rationale",
        "type": "text",
        "required": true
      },
      {
        "name": "governance_revision",
        "type": "bigint",
        "required": true
      },
      {
        "name": "decision",
        "type": "text",
        "required": true
      },
      {
        "name": "created_ms",
        "type": "bigint",
        "required": true
      }
    ],
    "constraints": [
      {
        "name": "monitor_live_reviews_pkey",
        "type": "p",
        "keys": [
          "id"
        ],
        "definition": "PRIMARY KEY(id)"
      },
      {
        "name": "monitor_live_reviews_check_fk",
        "type": "f",
        "keys": [
          "check_id",
          "owner_user_id",
          "monitor_id"
        ],
        "foreign": "monitor_live_checks",
        "remote": [
          "id",
          "owner_user_id",
          "monitor_id"
        ],
        "definition": "FOREIGN KEY(check_id,owner_user_id,monitor_id) REFERENCES agentstudio.monitor_live_checks(id,owner_user_id,monitor_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_reviews_value_ck",
        "type": "c",
        "keys": [
          "preview_hash",
          "rationale",
          "governance_revision",
          "decision"
        ],
        "definition": "CHECK(agentstudio.monitor_live_reviews_value_valid(preview_hash,rationale,governance_revision,decision))"
      },
      {
        "name": "monitor_live_reviews_time_ck",
        "type": "c",
        "keys": [
          "created_ms"
        ],
        "definition": "CHECK(agentstudio.monitor_live_reviews_time_valid(created_ms))"
      }
    ],
    "mutable": false
  },
  {
    "name": "monitor_live_events",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "owner_user_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "monitor_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "check_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "dedup_hash",
        "type": "text",
        "required": true
      },
      {
        "name": "kind",
        "type": "text",
        "required": true
      },
      {
        "name": "payload",
        "type": "jsonb",
        "required": true
      },
      {
        "name": "notify",
        "type": "boolean",
        "required": true
      },
      {
        "name": "read_ms",
        "type": "bigint",
        "required": true
      },
      {
        "name": "created_ms",
        "type": "bigint",
        "required": true
      }
    ],
    "constraints": [
      {
        "name": "monitor_live_events_pkey",
        "type": "p",
        "keys": [
          "id"
        ],
        "definition": "PRIMARY KEY(id)"
      },
      {
        "name": "monitor_live_events_owner_uq",
        "type": "u",
        "keys": [
          "id",
          "owner_user_id"
        ],
        "definition": "UNIQUE(id,owner_user_id)"
      },
      {
        "name": "monitor_live_events_dedup_uq",
        "type": "u",
        "keys": [
          "monitor_id",
          "dedup_hash"
        ],
        "definition": "UNIQUE(monitor_id,dedup_hash)"
      },
      {
        "name": "monitor_live_events_check_fk",
        "type": "f",
        "keys": [
          "check_id",
          "owner_user_id",
          "monitor_id"
        ],
        "foreign": "monitor_live_checks",
        "remote": [
          "id",
          "owner_user_id",
          "monitor_id"
        ],
        "definition": "FOREIGN KEY(check_id,owner_user_id,monitor_id) REFERENCES agentstudio.monitor_live_checks(id,owner_user_id,monitor_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_events_value_ck",
        "type": "c",
        "keys": [
          "dedup_hash",
          "kind",
          "payload",
          "notify",
          "read_ms",
          "created_ms"
        ],
        "definition": "CHECK(agentstudio.monitor_live_events_value_valid(dedup_hash,kind,payload,notify,read_ms,created_ms))"
      },
      {
        "name": "monitor_live_events_time_ck",
        "type": "c",
        "keys": [
          "created_ms"
        ],
        "definition": "CHECK(agentstudio.monitor_live_events_time_valid(created_ms))"
      }
    ],
    "mutable": false
  },
  {
    "name": "monitor_live_reads",
    "columns": [
      {
        "name": "event_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "owner_user_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "read_ms",
        "type": "bigint",
        "required": true
      },
      {
        "name": "governance_revision",
        "type": "bigint",
        "required": true
      }
    ],
    "constraints": [
      {
        "name": "monitor_live_reads_pkey",
        "type": "p",
        "keys": [
          "event_id"
        ],
        "definition": "PRIMARY KEY(event_id)"
      },
      {
        "name": "monitor_live_reads_event_fk",
        "type": "f",
        "keys": [
          "event_id",
          "owner_user_id"
        ],
        "foreign": "monitor_live_events",
        "remote": [
          "id",
          "owner_user_id"
        ],
        "definition": "FOREIGN KEY(event_id,owner_user_id) REFERENCES agentstudio.monitor_live_events(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_reads_value_ck",
        "type": "c",
        "keys": [
          "read_ms",
          "governance_revision"
        ],
        "definition": "CHECK(agentstudio.monitor_live_reads_value_valid(read_ms,governance_revision))"
      }
    ],
    "mutable": false
  },
  {
    "name": "monitor_live_effect_slots",
    "mutable": false,
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "owner_user_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "case_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "check_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "run_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "step_key",
        "type": "text",
        "required": true
      },
      {
        "name": "input_sha256",
        "type": "text",
        "required": true
      },
      {
        "name": "tool",
        "type": "text",
        "required": true
      },
      {
        "name": "kind",
        "type": "text",
        "required": true
      },
      {
        "name": "source_id",
        "type": "text",
        "required": false
      },
      {
        "name": "arguments",
        "type": "jsonb",
        "required": true
      },
      {
        "name": "arguments_canonical",
        "type": "text",
        "required": true
      },
      {
        "name": "claim",
        "type": "jsonb",
        "required": true
      },
      {
        "name": "created_ms",
        "type": "bigint",
        "required": true
      }
    ],
    "constraints": [
      {
        "name": "monitor_live_effect_slots_pkey",
        "type": "p",
        "keys": [
          "id"
        ],
        "definition": "PRIMARY KEY(id)"
      },
      {
        "name": "monitor_live_effect_slots_owner_case_uq",
        "type": "u",
        "keys": [
          "id",
          "owner_user_id",
          "case_id"
        ],
        "definition": "UNIQUE(id,owner_user_id,case_id)"
      },
      {
        "name": "monitor_live_effect_slots_step_uq",
        "type": "u",
        "keys": [
          "run_id",
          "step_key"
        ],
        "definition": "UNIQUE(run_id,step_key)"
      },
      {
        "name": "monitor_live_effect_slots_source_uq",
        "type": "u",
        "keys": [
          "check_id",
          "source_id"
        ],
        "definition": "UNIQUE(check_id,source_id)"
      },
      {
        "name": "monitor_live_effect_slots_check_fk",
        "type": "f",
        "keys": [
          "check_id",
          "owner_user_id",
          "case_id"
        ],
        "foreign": "monitor_live_checks",
        "remote": [
          "id",
          "owner_user_id",
          "case_id"
        ],
        "definition": "FOREIGN KEY(check_id,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_checks(id,owner_user_id,case_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "monitor_live_effect_slots_value_ck",
        "type": "c",
        "keys": [
          "step_key",
          "input_sha256",
          "tool",
          "kind",
          "source_id",
          "arguments",
          "arguments_canonical",
          "claim",
          "created_ms"
        ],
        "definition": "CHECK(agentstudio.monitor_live_effect_slots_value_valid(step_key,input_sha256,tool,kind,source_id,arguments,arguments_canonical,claim,created_ms))"
      }
    ]
  }
] as const
export const monitorLiveFunctions=[
  {
    "name": "monitor_live_time_valid",
    "args": "bigint",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": true,
    "roles": [],
    "sha256": "1a3384781ccf099cd6dbdef5ff58cebacb40055142d826a568ed73d037fcf0aa"
  },
  {
    "name": "monitor_live_sha_valid",
    "args": "text",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": true,
    "roles": [],
    "sha256": "4c4b27470f3d5a7a396ed5199f046e739ccf579f0242c3a1131cbafe4989000a"
  },
  {
    "name": "monitor_live_json_valid",
    "args": "jsonb,text,text,integer",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": true,
    "roles": [],
    "sha256": "c2d85a7fb11d3cd1578b6ec136b5160ad88013a843d75e6b8b1a8cdaccbb0559"
  },
  {
    "name": "monitor_live_immutable",
    "args": "",
    "returns": "trigger",
    "language": "plpgsql",
    "volatility": "v",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "5a52ec21b3f67566b7f42da99851ccea79bd2f1d3d4517685b1b23414817c088"
  },
  {
    "name": "monitor_live_state_guard",
    "args": "",
    "returns": "trigger",
    "language": "plpgsql",
    "volatility": "v",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "79c87eddc393bee1caba0a9de639f4a1fb7314aa9bfdae858e89ebcc457b913c"
  },
  {
    "name": "monitor_live_employee",
    "args": "uuid",
    "returns": "bigint",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": false,
    "roles": [],
    "sha256": "f932a9b5f537d60f31079e0b2906d7266941f09cac55e0485ff8bc353d41f6c8"
  },
  {
    "name": "monitor_live_read_guard",
    "args": "",
    "returns": "trigger",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": false,
    "roles": [],
    "sha256": "7472450593c818ec9c266b54fcfb8fb1aafd73781000c6291c28650b0e45fedb"
  },
  {
    "name": "monitor_live_ack",
    "args": "uuid,uuid",
    "returns": "boolean",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": true,
    "roles": [
      "agentstudio_api"
    ],
    "sha256": "d2b29de3301d93444b87e622e2ef9013ec379348f0bcfb6da938dce89ac02c07"
  },
  {
    "name": "monitor_live_cases_value_valid",
    "args": "text,text,jsonb",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "e4775e44e62ef867931df42daa2e8ba0fa7054b5111fac6b7274f42af0534071"
  },
  {
    "name": "monitor_live_cases_time_valid",
    "args": "bigint",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "caee4c050c81f7292b8f9fc1229d93cb4207c03b252e2cb21b9340e8c4026ef2"
  },
  {
    "name": "monitor_live_monitors_value_valid",
    "args": "bigint,jsonb,text,text,text",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "c219da20f355e064371e0e1bc588bbce02e4222cac36729790a3c37a1b85591b"
  },
  {
    "name": "monitor_live_monitors_time_valid",
    "args": "bigint,bigint",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "53efdbe170f92a5ca1ffb995a4376a39fdb5e34753042391e5d81c44b3d2abef"
  },
  {
    "name": "monitor_live_versions_value_valid",
    "args": "bigint,jsonb,text,text,text",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "547bf4c69496890717150aa0f2f3d5659dc93b99319f8b61f305897e6e823122"
  },
  {
    "name": "monitor_live_versions_time_valid",
    "args": "bigint",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "caee4c050c81f7292b8f9fc1229d93cb4207c03b252e2cb21b9340e8c4026ef2"
  },
  {
    "name": "monitor_live_checks_value_valid",
    "args": "bigint,bigint,text,text,text,jsonb,jsonb,text",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "ca462f9e82419392f6f082dca9dbd61425911bc1b30e5a94386fdd1f33908c02"
  },
  {
    "name": "monitor_live_checks_lease_valid",
    "args": "text,uuid,bigint,bigint,bigint,bigint,bigint,bigint",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "1d7a67a411f49670ef99503776c8cfd8bcd995076dd59043fb523dd737e4a51e"
  },
  {
    "name": "monitor_live_checks_time_valid",
    "args": "bigint,bigint",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "53efdbe170f92a5ca1ffb995a4376a39fdb5e34753042391e5d81c44b3d2abef"
  },
  {
    "name": "monitor_live_requests_value_valid",
    "args": "text,text,jsonb,bigint,text,text,bigint,bigint,bigint",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "fb4999c88c4262622faf3134b95dbc9fe0c05bb43fd9e759c2fb1bbd0d507f45"
  },
  {
    "name": "monitor_live_receipts_value_valid",
    "args": "text,text,text,jsonb,text,text,text,text,jsonb",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "c5b4db7ee77dfe2230bf51cc432180216108a4b63142f7f0a8fd5f9bcffc9261"
  },
  {
    "name": "monitor_live_receipts_time_valid",
    "args": "bigint",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "caee4c050c81f7292b8f9fc1229d93cb4207c03b252e2cb21b9340e8c4026ef2"
  },
  {
    "name": "monitor_live_records_value_valid",
    "args": "bigint,text,jsonb,jsonb,jsonb,text,text",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "f9f9decd913b7dd3da4b730f6602f8f533c68c739f45f58a22671f30083653ef"
  },
  {
    "name": "monitor_live_records_time_valid",
    "args": "bigint",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "caee4c050c81f7292b8f9fc1229d93cb4207c03b252e2cb21b9340e8c4026ef2"
  },
  {
    "name": "monitor_live_fact_sets_value_valid",
    "args": "jsonb,text,text",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "4405b9d0dae43f0dac9f437ffe7e25ed523f93fc5b2a7ac5401829d11b00c417"
  },
  {
    "name": "monitor_live_fact_sets_time_valid",
    "args": "bigint",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "caee4c050c81f7292b8f9fc1229d93cb4207c03b252e2cb21b9340e8c4026ef2"
  },
  {
    "name": "monitor_live_freeze_jobs_value_valid",
    "args": "jsonb,text,bigint,jsonb,jsonb,text,text",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "36e57b1e8217fae71cb6a075cfb2e656ba6761b7fc8f6e73a409954a3e9448a2"
  },
  {
    "name": "monitor_live_freeze_jobs_time_valid",
    "args": "bigint,bigint",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "53efdbe170f92a5ca1ffb995a4376a39fdb5e34753042391e5d81c44b3d2abef"
  },
  {
    "name": "monitor_live_record_reviews_value_valid",
    "args": "bigint,text,text,bigint",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "637dcd835fa7aeb3efbd75f8845be08f3f9f18f5ef8588e439ff452e4cc7cc98"
  },
  {
    "name": "monitor_live_record_reviews_time_valid",
    "args": "bigint",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "caee4c050c81f7292b8f9fc1229d93cb4207c03b252e2cb21b9340e8c4026ef2"
  },
  {
    "name": "monitor_live_reviews_value_valid",
    "args": "text,text,bigint,text",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "5f3bce0d139a214ec3fb500fe8a2849614a309ca4252ddce0a74f1de11541fce"
  },
  {
    "name": "monitor_live_reviews_time_valid",
    "args": "bigint",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "caee4c050c81f7292b8f9fc1229d93cb4207c03b252e2cb21b9340e8c4026ef2"
  },
  {
    "name": "monitor_live_events_value_valid",
    "args": "text,text,jsonb,boolean,bigint,bigint",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "1c9eae34d213e17023c8f8398a21a4060f02bcddbe17039506d58ccac72dd6ee"
  },
  {
    "name": "monitor_live_events_time_valid",
    "args": "bigint",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "caee4c050c81f7292b8f9fc1229d93cb4207c03b252e2cb21b9340e8c4026ef2"
  },
  {
    "name": "monitor_live_reads_value_valid",
    "args": "bigint,bigint",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "9d4f600b058ca6f4dcb6826b39d07add50c264bc482581dbe177e4a58b78bd0e"
  },
  {
    "name": "monitor_live_lease",
    "args": "uuid,uuid,bigint",
    "returns": "agentstudio.monitor_live_checks",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": false,
    "roles": [],
    "sha256": "267cc92e9da8f691caebe069d4392cb6b64daa7fb4411ba1e6d74241d6fb00b1"
  },
  {
    "name": "monitor_live_claim",
    "args": "text,bigint",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": true,
    "roles": [
      "agentstudio_monitor_worker"
    ],
    "sha256": "d5b6b42b45f4307c2083bf512cd7aa74bd758015845d2af93484eb517da25cb1"
  },
  {
    "name": "monitor_live_renew",
    "args": "uuid,uuid,bigint,bigint",
    "returns": "boolean",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": true,
    "roles": [
      "agentstudio_monitor_worker"
    ],
    "sha256": "e8f1749f318335a155b5950544725f7066d4f11bc73e69b289778411b2adcfc8"
  },
  {
    "name": "monitor_live_begin_request",
    "args": "uuid,uuid,bigint,text",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": true,
    "roles": [
      "agentstudio_monitor_dispatch"
    ],
    "sha256": "62f9318db0f8bafdd1905f31a15f5b89b8179adb8e4a92f29d4d7ac2be32d49b"
  },
  {
    "name": "monitor_live_capture_valid",
    "args": "jsonb,jsonb,text",
    "returns": "boolean",
    "language": "plpgsql",
    "volatility": "i",
    "definer": false,
    "strict": true,
    "roles": [],
    "sha256": "c80e9a89862d654ce0cfea54e8ed892d97f2907896f071e490a729ad575d406c"
  },
  {
    "name": "monitor_live_finish_request",
    "args": "uuid,uuid,bigint,jsonb,text,text",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": true,
    "roles": [
      "agentstudio_monitor_dispatch"
    ],
    "sha256": "e97a11dddf377a535038bc35e13d44e9b1ade4164052ab694be72ba897a3f3e3"
  },
  {
    "name": "monitor_live_fail_request",
    "args": "uuid,uuid,bigint,text",
    "returns": "boolean",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": true,
    "roles": [
      "agentstudio_monitor_dispatch"
    ],
    "sha256": "bd25f085922af1b096de6be2018176f05cef5f89f555962a255474c5247dd6f4"
  },
  {
    "name": "monitor_live_expire_checks",
    "args": "",
    "returns": "integer",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": false,
    "roles": [
      "agentstudio_monitor_worker"
    ],
    "sha256": "091a37062f1629261a2e2fad3c2675e460f235022fde46fded8d5b7875e4e564"
  },
  {
    "name": "monitor_live_connection_fingerprint",
    "args": "uuid",
    "returns": "text",
    "language": "sql",
    "volatility": "s",
    "definer": true,
    "strict": true,
    "roles": [
      "agentstudio_api"
    ],
    "sha256": "957c498d3dee1d56b0dd890fe90433ab9a0699521f54b8d5545efc0c43883ab9"
  },
  {
    "name": "monitor_live_transport_material",
    "args": "uuid,uuid,bigint",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": true,
    "roles": [
      "agentstudio_monitor_dispatch"
    ],
    "sha256": "a828c6a7568056430f1992d5817c22d6b5f8b9e517306597833f588148e1ad1b"
  },
  {
    "name": "monitor_live_run_context",
    "args": "uuid,uuid",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": false,
    "roles": [],
    "sha256": "40791078bc7d53426876c7ad5f7e6e4c6fde2337e8e94d0025890529e75ca0e3"
  },
  {
    "name": "monitor_live_worker_binding",
    "args": "jsonb",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": true,
    "roles": [
      "agentstudio_worker"
    ],
    "sha256": "6d723e1d384f1db4a3603c5892d6f30a9f091017af9c4fe87cc522174f42ae39"
  },
  {
    "name": "monitor_live_case_create",
    "args": "jsonb",
    "returns": "uuid",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": true,
    "roles": [
      "agentstudio_api"
    ],
    "sha256": "ccf604deaa2a048498338dbdc425f2097baa82d404132a35098ac834dbe984d4"
  },
  {
    "name": "monitor_live_record_review",
    "args": "uuid,uuid,bigint,text,text",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": true,
    "roles": [
      "agentstudio_api"
    ],
    "sha256": "23a6286b2d1958ed4dfb26578904f5901e3be1b1d7efcbf9c6aa64862ea606dd"
  },
  {
    "name": "monitor_live_record_write",
    "args": "uuid,jsonb,jsonb",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": false,
    "roles": [
      "agentstudio_api",
      "agentstudio_worker"
    ],
    "sha256": "b6414c32a197fbbe89d7a0416426f2286d3a4cc149b20628721f439c37b6cbf2"
  },
  {
    "name": "monitor_live_analysis_context",
    "args": "uuid,uuid,bigint",
    "returns": "agentstudio.monitor_live_checks",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": false,
    "roles": [],
    "sha256": "602ad3076f82ffc386807113c6caa29cde4252a9e31cb74f900bb80a31113a5b"
  },
  {
    "name": "monitor_live_semantic_rows",
    "args": "jsonb,jsonb",
    "returns": "jsonb",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": true,
    "roles": [],
    "sha256": "0c5c2a8912376150bef537fce870ebb490528bf92acc797b6fcf5e44d2272449"
  },
  {
    "name": "monitor_live_check_review",
    "args": "uuid,text,text,text",
    "returns": "uuid",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": false,
    "roles": [
      "agentstudio_api"
    ],
    "sha256": "e64fbed85dbebde90b67f063e43ea9c7fff9a45420b76717a15fc4e03518881f"
  },
  {
    "name": "monitor_live_check_state",
    "args": "uuid,uuid,bigint,text,text,text,jsonb",
    "returns": "uuid",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": false,
    "roles": [
      "agentstudio_api",
      "agentstudio_monitor_worker"
    ],
    "sha256": "20592add481b7724049069677c89a1591edba9785d8024500f7d08a15363d1d7"
  },
  {
    "name": "monitor_live_assessment_commit",
    "args": "uuid,uuid,bigint,text,text,jsonb",
    "returns": "uuid",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": false,
    "roles": [
      "agentstudio_api",
      "agentstudio_monitor_worker"
    ],
    "sha256": "b73d2e6fb32877888ef04f03db2d9295d47e017754d2093270e31f789cde7092"
  },
  {
    "name": "monitor_live_manifest",
    "args": "uuid,uuid",
    "returns": "jsonb",
    "language": "sql",
    "volatility": "s",
    "definer": true,
    "strict": true,
    "roles": [],
    "sha256": "9f47c37f30d1e6d5245ff6f9b623ec055c702ed69edf699d23ef90c5011fa271"
  },
  {
    "name": "monitor_live_record_dto",
    "args": "uuid,bigint,uuid,uuid",
    "returns": "jsonb",
    "language": "sql",
    "volatility": "s",
    "definer": true,
    "strict": true,
    "roles": [],
    "sha256": "1f59a8afc27b3dfef69df813f2a446c0bf869c4fe82dde69b89efb497754c8e5"
  },
  {
    "name": "monitor_live_freeze_begin",
    "args": "uuid,uuid,bigint",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": true,
    "roles": [
      "agentstudio_monitor_worker"
    ],
    "sha256": "38c824369e90c2c3ca27054318adaaa4b10fd99b535e9dad9acc7e7459bdd0b4"
  },
  {
    "name": "monitor_live_freeze_append",
    "args": "uuid,uuid,bigint,bigint,jsonb,jsonb",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": true,
    "roles": [
      "agentstudio_monitor_worker"
    ],
    "sha256": "42b92251436554a1c6d926dc5ca9fce7f14f0887909a312cb769a8b3ac3cc3b8"
  },
  {
    "name": "monitor_live_freeze_finish",
    "args": "uuid,uuid,bigint,jsonb,text",
    "returns": "uuid",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": true,
    "roles": [
      "agentstudio_monitor_worker"
    ],
    "sha256": "088d4e045a228d6ed29e1d6476fc01c164ebb6e326037b3edf5d704629583d4e"
  },
  {
    "name": "monitor_live_effect_slots_value_valid",
    "args": "text,text,text,text,text,jsonb,text,jsonb,bigint",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": false,
    "roles": [],
    "sha256": "419706b7cb9d7ae8d86d94496b939c77a474391ee2b7544f42846361f9dd411a"
  },
  {
    "name": "monitor_live_effect_authorize",
    "args": "jsonb,text,jsonb,text,text",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": false,
    "roles": [
      "agentstudio_worker"
    ],
    "sha256": "27e4e650896281de9e9770a43dd2eb59bf979b9c034b7c3369465e7a5e60b982"
  },
  {
    "name": "monitor_live_worker_probe",
    "args": "jsonb",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": true,
    "roles": [
      "agentstudio_worker"
    ],
    "sha256": "e6c0f05663c4952266880922be8a0cf1276410deaeea37d58f3c4dd651e4b7bb"
  },
  {
    "name": "monitor_live_author",
    "args": "uuid,uuid,bigint,jsonb,text,text,text,text",
    "returns": "uuid",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": false,
    "roles": [
      "agentstudio_api"
    ],
    "sha256": "7e3e44e9d3014f5ee238a194f5e773d16454f7399c487b8e84c10ae734ac8bc0"
  },
  {
    "name": "monitor_live_control",
    "args": "uuid,bigint,bigint,boolean,bigint",
    "returns": "uuid",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": false,
    "roles": [
      "agentstudio_api"
    ],
    "sha256": "a8c15f0207119085fba7f9cc43c3f6c233c36280444bafa988c36098df8a1b54"
  },
  {
    "name": "monitor_live_schedule_ready",
    "args": "uuid",
    "returns": "boolean",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": true,
    "roles": [
      "agentstudio_worker"
    ],
    "sha256": "38fc6b2111f678fa65c3a22204c684f4277145a3c68c3e69bd4ef337603652e9"
  },
  {
    "name": "monitor_live_open_occurrence",
    "args": "uuid,uuid",
    "returns": "uuid",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": true,
    "roles": [
      "agentstudio_worker"
    ],
    "sha256": "28f5b0615d47cdacb6af302594dafe1fab874a8092c30fed9543d92c6648fd8f"
  },
  {
    "name": "monitor_live_effect_current",
    "args": "uuid",
    "returns": "boolean",
    "language": "sql",
    "volatility": "v",
    "definer": true,
    "strict": true,
    "roles": [],
    "sha256": "994c592c7dcba00d47630872e36814053a992e903e50011fbe2fdc9619ce552a"
  },
  {
    "name": "monitor_live_case_read_lock",
    "args": "uuid,uuid,boolean",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": true,
    "roles": [
      "agentstudio_api"
    ],
    "sha256": "0f6e495832c18724ed549b80738b8063d3ea4ce705a25230b74ed9f64e2dbeda"
  },
  {
    "name": "monitor_live_monitor_read_lock",
    "args": "uuid,uuid,boolean",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": true,
    "roles": [
      "agentstudio_api"
    ],
    "sha256": "4edfc91381c774f4f5c7af2590cbb2e7179821e91cd8b7a92574e880862e819b"
  },
  {
    "name": "monitor_live_check_read_lock",
    "args": "uuid,uuid,boolean",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": true,
    "roles": [
      "agentstudio_api"
    ],
    "sha256": "823ca09bcb5071f889fa4c11e63ae024422ac000c6ad408bc6349df6e835ef72"
  }
] as const
export const monitorLiveRoles=["agentstudio_monitor_worker","agentstudio_monitor_dispatch"] as const
