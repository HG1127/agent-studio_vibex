// Authored source catalog; not evidence that077 is installed.
export const ordinaryCaseTables=[
  {
    "name": "ordinary_case_runs",
    "columns": [
      {
        "name": "run_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "job_id",
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
        "name": "question_id",
        "type": "uuid",
        "required": false
      },
      {
        "name": "spec_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "spec_revision",
        "type": "bigint",
        "required": true
      },
      {
        "name": "governance_revision",
        "type": "bigint",
        "required": true
      },
      {
        "name": "request_canonical",
        "type": "text",
        "required": true
      },
      {
        "name": "request_sha256",
        "type": "text",
        "required": true
      },
      {
        "name": "case_snapshot",
        "type": "jsonb",
        "required": true
      },
      {
        "name": "case_snapshot_sha256",
        "type": "text",
        "required": true
      },
      {
        "name": "binding",
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
        "type": "p",
        "keys": [
          "run_id"
        ],
        "definition": "PRIMARY KEY(run_id)",
        "name": "ordinary_case_runs_pkey"
      },
      {
        "type": "u",
        "keys": [
          "job_id"
        ],
        "definition": "UNIQUE(job_id)",
        "name": "ordinary_case_runs_uq1"
      },
      {
        "type": "c",
        "keys": [
          "spec_revision"
        ],
        "definition": "CHECK(spec_revision>0)",
        "name": "ordinary_case_runs_ck1"
      },
      {
        "type": "c",
        "keys": [
          "governance_revision"
        ],
        "definition": "CHECK(governance_revision>0)",
        "name": "ordinary_case_runs_ck2"
      },
      {
        "type": "c",
        "keys": [
          "request_sha256"
        ],
        "definition": "CHECK(request_sha256~'^[a-f0-9]{64}$')",
        "name": "ordinary_case_runs_ck3"
      },
      {
        "type": "c",
        "keys": [
          "case_snapshot"
        ],
        "definition": "CHECK(jsonb_typeof(case_snapshot)='object')",
        "name": "ordinary_case_runs_ck4"
      },
      {
        "type": "c",
        "keys": [
          "case_snapshot_sha256"
        ],
        "definition": "CHECK(case_snapshot_sha256~'^[a-f0-9]{64}$')",
        "name": "ordinary_case_runs_ck5"
      },
      {
        "type": "c",
        "keys": [
          "binding"
        ],
        "definition": "CHECK(jsonb_typeof(binding)='object')",
        "name": "ordinary_case_runs_ck6"
      },
      {
        "type": "c",
        "keys": [
          "created_ms"
        ],
        "definition": "CHECK(created_ms>0)",
        "name": "ordinary_case_runs_ck7"
      },
      {
        "type": "u",
        "keys": [
          "run_id",
          "owner_user_id",
          "case_id"
        ],
        "definition": "UNIQUE(run_id,owner_user_id,case_id)",
        "name": "ordinary_case_runs_uq2"
      },
      {
        "type": "f",
        "keys": [
          "run_id",
          "owner_user_id"
        ],
        "definition": "FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id)",
        "name": "ordinary_case_runs_fk1"
      },
      {
        "type": "f",
        "keys": [
          "job_id"
        ],
        "definition": "FOREIGN KEY(job_id) REFERENCES agentstudio.jobs(id)",
        "name": "ordinary_case_runs_fk2"
      },
      {
        "type": "f",
        "keys": [
          "case_id",
          "owner_user_id"
        ],
        "definition": "FOREIGN KEY(case_id,owner_user_id) REFERENCES agentstudio.monitor_live_cases(id,owner_user_id)",
        "name": "ordinary_case_runs_fk3"
      }
    ],
    "mutable": false
  },
  {
    "name": "ordinary_case_source_slots",
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
        "name": "run_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "case_id",
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
        "name": "parent_step_key",
        "type": "text",
        "required": true
      },
      {
        "name": "claim_sha256",
        "type": "text",
        "required": true
      },
      {
        "name": "source_metadata",
        "type": "jsonb",
        "required": true
      },
      {
        "name": "state",
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
        "name": "completed_ms",
        "type": "bigint",
        "required": true
      }
    ],
    "constraints": [
      {
        "type": "p",
        "keys": [
          "id"
        ],
        "definition": "PRIMARY KEY(id)",
        "name": "ordinary_case_source_slots_pkey"
      },
      {
        "type": "c",
        "keys": [
          "step_key"
        ],
        "definition": "CHECK(step_key~'^[A-Za-z0-9_:-]{1,160}$')",
        "name": "ordinary_case_source_slots_ck1"
      },
      {
        "type": "c",
        "keys": [
          "input_sha256"
        ],
        "definition": "CHECK(input_sha256~'^[a-f0-9]{64}$')",
        "name": "ordinary_case_source_slots_ck2"
      },
      {
        "type": "c",
        "keys": [
          "claim_sha256"
        ],
        "definition": "CHECK(claim_sha256~'^[a-f0-9]{64}$')",
        "name": "ordinary_case_source_slots_ck3"
      },
      {
        "type": "c",
        "keys": [
          "source_metadata"
        ],
        "definition": "CHECK(jsonb_typeof(source_metadata)='object')",
        "name": "ordinary_case_source_slots_ck4"
      },
      {
        "type": "c",
        "keys": [
          "state"
        ],
        "definition": "CHECK(state IN('started','captured','unknown'))",
        "name": "ordinary_case_source_slots_ck5"
      },
      {
        "type": "c",
        "keys": [
          "error"
        ],
        "definition": "CHECK(length(error)<=80)",
        "name": "ordinary_case_source_slots_ck6"
      },
      {
        "type": "c",
        "keys": [
          "created_ms"
        ],
        "definition": "CHECK(created_ms>0)",
        "name": "ordinary_case_source_slots_ck7"
      },
      {
        "type": "c",
        "keys": [
          "completed_ms"
        ],
        "definition": "CHECK(completed_ms>=0)",
        "name": "ordinary_case_source_slots_ck8"
      },
      {
        "type": "u",
        "keys": [
          "run_id",
          "step_key"
        ],
        "definition": "UNIQUE(run_id,step_key)",
        "name": "ordinary_case_source_slots_uq1"
      },
      {
        "type": "u",
        "keys": [
          "id",
          "owner_user_id",
          "run_id",
          "case_id"
        ],
        "definition": "UNIQUE(id,owner_user_id,run_id,case_id)",
        "name": "ordinary_case_source_slots_uq2"
      },
      {
        "type": "f",
        "keys": [
          "run_id",
          "owner_user_id",
          "case_id"
        ],
        "definition": "FOREIGN KEY(run_id,owner_user_id,case_id)\n  REFERENCES agentstudio.ordinary_case_runs(run_id,owner_user_id,case_id)",
        "name": "ordinary_case_source_slots_fk1"
      }
    ],
    "mutable": true
  },
  {
    "name": "ordinary_case_receipts",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "slot_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "owner_user_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "run_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "case_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "step_key",
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
        "name": "content_hash",
        "type": "text",
        "required": true
      },
      {
        "name": "source_scope",
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
        "type": "p",
        "keys": [
          "id"
        ],
        "definition": "PRIMARY KEY(id)",
        "name": "ordinary_case_receipts_pkey"
      },
      {
        "type": "u",
        "keys": [
          "slot_id"
        ],
        "definition": "UNIQUE(slot_id)",
        "name": "ordinary_case_receipts_uq1"
      },
      {
        "type": "c",
        "keys": [
          "payload"
        ],
        "definition": "CHECK(jsonb_typeof(payload)='object')",
        "name": "ordinary_case_receipts_ck1"
      },
      {
        "type": "c",
        "keys": [
          "content_hash"
        ],
        "definition": "CHECK(content_hash~'^[a-f0-9]{64}$')",
        "name": "ordinary_case_receipts_ck2"
      },
      {
        "type": "c",
        "keys": [
          "source_scope"
        ],
        "definition": "CHECK(jsonb_typeof(source_scope)='object')",
        "name": "ordinary_case_receipts_ck3"
      },
      {
        "type": "c",
        "keys": [
          "created_ms"
        ],
        "definition": "CHECK(created_ms>0)",
        "name": "ordinary_case_receipts_ck4"
      },
      {
        "type": "u",
        "keys": [
          "run_id",
          "step_key"
        ],
        "definition": "UNIQUE(run_id,step_key)",
        "name": "ordinary_case_receipts_uq2"
      },
      {
        "type": "u",
        "keys": [
          "id",
          "owner_user_id",
          "run_id",
          "case_id"
        ],
        "definition": "UNIQUE(id,owner_user_id,run_id,case_id)",
        "name": "ordinary_case_receipts_uq3"
      },
      {
        "type": "f",
        "keys": [
          "slot_id",
          "owner_user_id",
          "run_id",
          "case_id"
        ],
        "definition": "FOREIGN KEY(slot_id,owner_user_id,run_id,case_id)\n  REFERENCES agentstudio.ordinary_case_source_slots(id,owner_user_id,run_id,case_id)",
        "name": "ordinary_case_receipts_fk1"
      }
    ],
    "mutable": false
  },
  {
    "name": "ordinary_case_dependencies",
    "columns": [
      {
        "name": "run_id",
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
        "name": "source_run_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "source_receipt_id",
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
        "name": "created_ms",
        "type": "bigint",
        "required": true
      }
    ],
    "constraints": [
      {
        "type": "c",
        "keys": [
          "input_sha256"
        ],
        "definition": "CHECK(input_sha256~'^[a-f0-9]{64}$')",
        "name": "ordinary_case_dependencies_ck1"
      },
      {
        "type": "c",
        "keys": [
          "created_ms"
        ],
        "definition": "CHECK(created_ms>0)",
        "name": "ordinary_case_dependencies_ck2"
      },
      {
        "type": "p",
        "keys": [
          "run_id",
          "source_run_id",
          "source_receipt_id"
        ],
        "definition": "PRIMARY KEY(run_id,source_run_id,source_receipt_id)",
        "name": "ordinary_case_dependencies_pkey"
      },
      {
        "type": "c",
        "keys": [
          "run_id",
          "source_run_id"
        ],
        "definition": "CHECK(run_id<>source_run_id)",
        "name": "ordinary_case_dependencies_ck3"
      },
      {
        "type": "f",
        "keys": [
          "run_id",
          "owner_user_id",
          "case_id"
        ],
        "definition": "FOREIGN KEY(run_id,owner_user_id,case_id)\n  REFERENCES agentstudio.ordinary_case_runs(run_id,owner_user_id,case_id)",
        "name": "ordinary_case_dependencies_fk1"
      },
      {
        "type": "f",
        "keys": [
          "source_run_id",
          "owner_user_id"
        ],
        "definition": "FOREIGN KEY(source_run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id)",
        "name": "ordinary_case_dependencies_fk2"
      }
    ],
    "mutable": false
  }
] as const
export const ordinaryCaseFunctions=[
  {
    "name": "ordinary_case_role",
    "args": "text",
    "returns": "void",
    "language": "plpgsql",
    "definer": true,
    "strict": true,
    "volatility": "v",
    "roles": [],
    "sha256": "100ae2522a51010fc1fd60e882f539d06dca3c2fcdf858a093de1d671e6e85b0"
  },
  {
    "name": "ordinary_case_immutable",
    "args": "",
    "returns": "trigger",
    "language": "plpgsql",
    "definer": true,
    "strict": false,
    "volatility": "v",
    "roles": [],
    "sha256": "1e60515ca9d27fa1534c6f545caa12dc5a1fafe8f8a89a4a199438bb6a1077a3"
  },
  {
    "name": "ordinary_case_slot_guard",
    "args": "",
    "returns": "trigger",
    "language": "plpgsql",
    "definer": true,
    "strict": false,
    "volatility": "v",
    "roles": [],
    "sha256": "589048558b5712a8a5debecd959c343626e1ccdda5d7d9f615f1934a0a3eba99"
  },
  {
    "name": "ordinary_case_current",
    "args": "uuid,uuid",
    "returns": "jsonb",
    "language": "plpgsql",
    "definer": true,
    "strict": true,
    "volatility": "v",
    "roles": [],
    "sha256": "31071c6768fb3debe5d9c2d25d461b0c9bbbcaa4ced2dcae3f5952861716f9b4"
  },
  {
    "name": "ordinary_case_lookup",
    "args": "uuid",
    "returns": "jsonb",
    "language": "plpgsql",
    "definer": true,
    "strict": true,
    "volatility": "v",
    "roles": [
      "agentstudio_api"
    ],
    "sha256": "217c58db07119b28069a55c005c9ad6388142eb685eb7651a7e5ef088f907a21"
  },
  {
    "name": "ordinary_case_bind",
    "args": "uuid,uuid,uuid,text,text,boolean",
    "returns": "jsonb",
    "language": "plpgsql",
    "definer": true,
    "strict": false,
    "volatility": "v",
    "roles": [
      "agentstudio_api"
    ],
    "sha256": "e66d0bbf29eb2b120c9c7d6bb4f252b8be9620d413ae137af54bcbbb65efc53e"
  },
  {
    "name": "ordinary_case_effect_context",
    "args": "jsonb,text",
    "returns": "jsonb",
    "language": "plpgsql",
    "definer": true,
    "strict": true,
    "volatility": "v",
    "roles": [],
    "sha256": "adaec08931f7bcba9313167c66adf05a8060b96d8671b309460344ef53c4bf78"
  },
  {
    "name": "ordinary_case_source_metadata",
    "args": "jsonb",
    "returns": "jsonb",
    "language": "plpgsql",
    "definer": true,
    "strict": true,
    "volatility": "v",
    "roles": [],
    "sha256": "23c5cf235ccb56a32d088ca7d2850c1742ba6f69e5fd644e6602ebab643b67cf"
  },
  {
    "name": "ordinary_case_source_begin",
    "args": "jsonb,text",
    "returns": "jsonb",
    "language": "plpgsql",
    "definer": true,
    "strict": true,
    "volatility": "v",
    "roles": [
      "agentstudio_bound_dispatch"
    ],
    "sha256": "9729e90233a1ec371b9268ef7afd94e99cfdbe946d39fa8ce98049b09c4f20d1"
  },
  {
    "name": "ordinary_case_source_finish",
    "args": "uuid,jsonb,text,text,text",
    "returns": "jsonb",
    "language": "plpgsql",
    "definer": true,
    "strict": true,
    "volatility": "v",
    "roles": [
      "agentstudio_bound_dispatch"
    ],
    "sha256": "3cfb13d4569c8d5ec2693a7a61e47523af5e0e4d17a648c3acdcd96b50759c9f"
  },
  {
    "name": "ordinary_case_source_fail",
    "args": "uuid,jsonb",
    "returns": "void",
    "language": "plpgsql",
    "definer": true,
    "strict": true,
    "volatility": "v",
    "roles": [
      "agentstudio_bound_dispatch"
    ],
    "sha256": "d62dfb86d4a185d8dc06cb18095a8943c2087579f98574ade37595b333eac29b"
  },
  {
    "name": "ordinary_case_receipt_current",
    "args": "uuid",
    "returns": "boolean",
    "language": "plpgsql",
    "definer": true,
    "strict": true,
    "volatility": "v",
    "roles": [
      "agentstudio_api"
    ],
    "sha256": "47a65303710d444f5a10c37319ac0ab4ae46ab81731b563bac59d810dba03d4a"
  },
  {
    "name": "ordinary_case_dependency",
    "args": "jsonb,text,uuid,uuid",
    "returns": "void",
    "language": "plpgsql",
    "definer": true,
    "strict": true,
    "volatility": "v",
    "roles": [
      "agentstudio_worker"
    ],
    "sha256": "e8f95bc151816479912ee97e074a965973c7326a68ed3d69a8b4f09a5e3bca6e"
  },
  {
    "name": "ordinary_case_record_write",
    "args": "jsonb,text,jsonb",
    "returns": "jsonb",
    "language": "plpgsql",
    "definer": true,
    "strict": true,
    "volatility": "v",
    "roles": [
      "agentstudio_worker"
    ],
    "sha256": "f79f0c966a9f6c2cda5a0a22740958f42c7e064bf6f9cad7658212f8c5bea39a"
  },
  {
    "name": "ordinary_case_worker_probe",
    "args": "jsonb",
    "returns": "jsonb",
    "language": "plpgsql",
    "definer": true,
    "strict": true,
    "volatility": "v",
    "roles": [
      "agentstudio_worker"
    ],
    "sha256": "2cf01de7ebae2b6dfdc06363f81b3a40000bb0a374745d685de18547ab9b7a4f"
  }
] as const
export const ordinaryCaseRoles=[] as const
