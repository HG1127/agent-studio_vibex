// Authored source manifest, not a runtime attestation or installer.
export const nativeMonitorTables=[
  {
    "name": "native_monitor_imports",
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
        "name": "source_snapshot_sha256",
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
        "name": "native_monitor_imports_pkey",
        "type": "p",
        "keys": [
          "id"
        ],
        "definition": "PRIMARY KEY(id)"
      },
      {
        "name": "native_monitor_imports_owner_uq",
        "type": "u",
        "keys": [
          "id",
          "owner_user_id"
        ],
        "definition": "UNIQUE(id,owner_user_id)"
      },
      {
        "name": "native_monitor_imports_user_fk",
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
        "name": "native_monitor_imports_valid_ck",
        "type": "c",
        "keys": [
          "source_snapshot_sha256",
          "created_ms"
        ],
        "definition": "CHECK(agentstudio.native_monitor_import_valid(source_snapshot_sha256,created_ms))"
      }
    ]
  },
  {
    "name": "native_monitor_cases",
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
        "name": "import_id",
        "type": "uuid",
        "required": true
      }
    ],
    "constraints": [
      {
        "name": "native_monitor_cases_pkey",
        "type": "p",
        "keys": [
          "id"
        ],
        "definition": "PRIMARY KEY(id)"
      },
      {
        "name": "native_monitor_cases_owner_uq",
        "type": "u",
        "keys": [
          "id",
          "owner_user_id"
        ],
        "definition": "UNIQUE(id,owner_user_id)"
      },
      {
        "name": "native_monitor_cases_import_fk",
        "type": "f",
        "keys": [
          "import_id",
          "owner_user_id"
        ],
        "foreign": "native_monitor_imports",
        "remote": [
          "id",
          "owner_user_id"
        ],
        "definition": "FOREIGN KEY(import_id,owner_user_id) REFERENCES agentstudio.native_monitor_imports(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      }
    ]
  },
  {
    "name": "native_monitor_monitors",
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
        "name": "current_check_id",
        "type": "uuid",
        "required": false
      },
      {
        "name": "created_ms",
        "type": "bigint",
        "required": true
      }
    ],
    "constraints": [
      {
        "name": "native_monitor_monitors_pkey",
        "type": "p",
        "keys": [
          "id"
        ],
        "definition": "PRIMARY KEY(id)"
      },
      {
        "name": "native_monitor_monitors_owner_case_uq",
        "type": "u",
        "keys": [
          "id",
          "owner_user_id",
          "case_id"
        ],
        "definition": "UNIQUE(id,owner_user_id,case_id)"
      },
      {
        "name": "native_monitor_monitors_case_fk",
        "type": "f",
        "keys": [
          "case_id",
          "owner_user_id"
        ],
        "foreign": "native_monitor_cases",
        "remote": [
          "id",
          "owner_user_id"
        ],
        "definition": "FOREIGN KEY(case_id,owner_user_id) REFERENCES agentstudio.native_monitor_cases(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "native_monitor_monitors_valid_ck",
        "type": "c",
        "keys": [
          "revision",
          "created_ms"
        ],
        "definition": "CHECK(agentstudio.native_monitor_meta_valid(revision,created_ms))"
      },
      {
        "name": "native_monitor_monitors_current_fk",
        "type": "f",
        "keys": [
          "current_check_id",
          "owner_user_id",
          "id"
        ],
        "foreign": "native_monitor_checks",
        "remote": [
          "id",
          "owner_user_id",
          "monitor_id"
        ],
        "definition": "FOREIGN KEY(current_check_id,owner_user_id,id) REFERENCES agentstudio.native_monitor_checks(id,owner_user_id,monitor_id) ON UPDATE NO ACTION ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED",
        "deferred": true
      }
    ]
  },
  {
    "name": "native_monitor_checks",
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
        "name": "status",
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
        "name": "native_monitor_checks_pkey",
        "type": "p",
        "keys": [
          "id"
        ],
        "definition": "PRIMARY KEY(id)"
      },
      {
        "name": "native_monitor_checks_owner_monitor_uq",
        "type": "u",
        "keys": [
          "id",
          "owner_user_id",
          "monitor_id"
        ],
        "definition": "UNIQUE(id,owner_user_id,monitor_id)"
      },
      {
        "name": "native_monitor_checks_monitor_fk",
        "type": "f",
        "keys": [
          "monitor_id",
          "owner_user_id",
          "case_id"
        ],
        "foreign": "native_monitor_monitors",
        "remote": [
          "id",
          "owner_user_id",
          "case_id"
        ],
        "definition": "FOREIGN KEY(monitor_id,owner_user_id,case_id) REFERENCES agentstudio.native_monitor_monitors(id,owner_user_id,case_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "native_monitor_checks_valid_ck",
        "type": "c",
        "keys": [
          "monitor_revision",
          "created_ms"
        ],
        "definition": "CHECK(agentstudio.native_monitor_meta_valid(monitor_revision,created_ms))"
      },
      {
        "name": "native_monitor_checks_status_ck",
        "type": "c",
        "keys": [
          "status"
        ],
        "definition": "CHECK(agentstudio.native_monitor_status_valid(status))"
      }
    ]
  },
  {
    "name": "native_monitor_events",
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
        "name": "native_monitor_events_pkey",
        "type": "p",
        "keys": [
          "id"
        ],
        "definition": "PRIMARY KEY(id)"
      },
      {
        "name": "native_monitor_events_owner_uq",
        "type": "u",
        "keys": [
          "id",
          "owner_user_id"
        ],
        "definition": "UNIQUE(id,owner_user_id)"
      },
      {
        "name": "native_monitor_events_dedup_uq",
        "type": "u",
        "keys": [
          "monitor_id",
          "dedup_hash"
        ],
        "definition": "UNIQUE(monitor_id,dedup_hash)"
      },
      {
        "name": "native_monitor_events_check_fk",
        "type": "f",
        "keys": [
          "check_id",
          "owner_user_id",
          "monitor_id"
        ],
        "foreign": "native_monitor_checks",
        "remote": [
          "id",
          "owner_user_id",
          "monitor_id"
        ],
        "definition": "FOREIGN KEY(check_id,owner_user_id,monitor_id) REFERENCES agentstudio.native_monitor_checks(id,owner_user_id,monitor_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "native_monitor_events_valid_ck",
        "type": "c",
        "keys": [
          "dedup_hash",
          "kind",
          "notify",
          "read_ms",
          "created_ms"
        ],
        "definition": "CHECK(agentstudio.native_monitor_event_valid(dedup_hash,kind,notify,read_ms,created_ms))"
      }
    ]
  },
  {
    "name": "native_monitor_reads",
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
        "name": "native_monitor_reads_pkey",
        "type": "p",
        "keys": [
          "event_id"
        ],
        "definition": "PRIMARY KEY(event_id)"
      },
      {
        "name": "native_monitor_reads_event_fk",
        "type": "f",
        "keys": [
          "event_id",
          "owner_user_id"
        ],
        "foreign": "native_monitor_events",
        "remote": [
          "id",
          "owner_user_id"
        ],
        "definition": "FOREIGN KEY(event_id,owner_user_id) REFERENCES agentstudio.native_monitor_events(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT"
      },
      {
        "name": "native_monitor_reads_valid_ck",
        "type": "c",
        "keys": [
          "governance_revision",
          "read_ms"
        ],
        "definition": "CHECK(agentstudio.native_monitor_meta_valid(governance_revision,read_ms))"
      }
    ]
  }
] as const
export const nativeMonitorFunctions=[
  {
    "name": "native_monitor_import_valid",
    "args": "text,bigint",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": true,
    "api": false,
    "sha256": "f347f4a01f51b4b9b5ce253315ff7bae638e5e9656fba95721afba11eb1f5773"
  },
  {
    "name": "native_monitor_meta_valid",
    "args": "bigint,bigint",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": true,
    "api": false,
    "sha256": "66c20e3fa3c2e7a560ba09c32215e80ce997c529da19a7be1ac5246995d885e0"
  },
  {
    "name": "native_monitor_status_valid",
    "args": "text",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": true,
    "api": false,
    "sha256": "9aa04a1d820e57d1b6974e34762bd9626e7ac8e6dff1244ac7e5bfd254b0b749"
  },
  {
    "name": "native_monitor_event_valid",
    "args": "text,text,boolean,bigint,bigint",
    "returns": "boolean",
    "language": "sql",
    "volatility": "i",
    "definer": false,
    "strict": true,
    "api": false,
    "sha256": "26f91ce380caa25e8c99a08145686aba0e24e76b84cdc7b37fac6aad317de724"
  },
  {
    "name": "native_monitor_immutable",
    "args": "",
    "returns": "trigger",
    "language": "plpgsql",
    "volatility": "v",
    "definer": false,
    "strict": false,
    "api": false,
    "sha256": "af8f5658b59d27c1c367429696d8aa43f6fb771032a2b47341fdbb2a9dad5b0e"
  },
  {
    "name": "native_monitor_read_guard",
    "args": "",
    "returns": "trigger",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": false,
    "api": false,
    "sha256": "b1beb8c05f2a9cf2480ef36e53329ae3d76832372e395237d3e958a62854c360"
  },
  {
    "name": "native_monitor_ack",
    "args": "uuid,uuid",
    "returns": "boolean",
    "language": "plpgsql",
    "volatility": "v",
    "definer": true,
    "strict": true,
    "api": true,
    "sha256": "db659ee02ac7b82c00dcf3d49b3a1c809db9f48d4f8a70d3bb8e372968ef554f"
  }
] as const
