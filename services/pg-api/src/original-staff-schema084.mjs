// Independent original010 + original047 + optional084 static registry.
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v}
export const originalStaff084Tables=freeze([
  {
    "name": "accounts",
    "policy": "native_auth_accounts_service",
    "privileges": [
      "SELECT",
      "INSERT",
      "UPDATE",
      "DELETE"
    ],
    "columns": [
      {
        "name": "user_id",
        "type": "uuid",
        "required": true,
        "default": null
      },
      {
        "name": "email",
        "type": "text",
        "required": true,
        "default": null
      },
      {
        "name": "password_record",
        "type": "text",
        "required": true,
        "default": null
      },
      {
        "name": "enabled",
        "type": "boolean",
        "required": true,
        "default": "true"
      },
      {
        "name": "is_admin",
        "type": "boolean",
        "required": true,
        "default": "false"
      },
      {
        "name": "failed_attempts",
        "type": "integer",
        "required": true,
        "default": "0"
      },
      {
        "name": "locked_until",
        "type": "timestamp with time zone",
        "required": false,
        "default": null
      },
      {
        "name": "password_changed_at",
        "type": "timestamp with time zone",
        "required": true,
        "default": "now()"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "required": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "required": true,
        "default": "now()"
      },
      {
        "name": "share_enabled",
        "type": "boolean",
        "required": true,
        "default": "true"
      },
      {
        "name": "governance_revision",
        "type": "bigint",
        "required": true,
        "default": "1"
      },
      {
        "name": "staff_revision",
        "type": "bigint",
        "required": true,
        "default": "1"
      }
    ],
    "constraints": [
      {
        "name": "accounts_pkey",
        "type": "p",
        "keys": [
          "user_id"
        ]
      },
      {
        "name": "accounts_email_key",
        "type": "u",
        "keys": [
          "email"
        ]
      },
      {
        "name": "accounts_user_id_fkey",
        "type": "f",
        "keys": [
          "user_id"
        ],
        "target": "agentstudio.users",
        "target_keys": [
          "id"
        ],
        "update": "a",
        "delete": "r"
      },
      {
        "name": "accounts_email_check",
        "type": "c",
        "expression": "char_length(email) BETWEEN 5 AND 254 AND email=lower(email) AND email !~ '[[:space:]]'"
      },
      {
        "name": "accounts_password_record_check",
        "type": "c",
        "expression": "length(password_record) BETWEEN 100 AND 320 AND left(password_record,20)='scrypt$v1$32768$8$1$'"
      },
      {
        "name": "accounts_failed_attempts_check",
        "type": "c",
        "expression": "failed_attempts BETWEEN 0 AND 2147483647"
      },
      {
        "name": "accounts_governance_revision_check",
        "type": "c",
        "expression": "governance_revision BETWEEN 1 AND 9007199254740990"
      },
      {
        "name": "accounts_user_id_not_null",
        "type": "n",
        "keys": [
          "user_id"
        ]
      },
      {
        "name": "accounts_email_not_null",
        "type": "n",
        "keys": [
          "email"
        ]
      },
      {
        "name": "accounts_password_record_not_null",
        "type": "n",
        "keys": [
          "password_record"
        ]
      },
      {
        "name": "accounts_enabled_not_null",
        "type": "n",
        "keys": [
          "enabled"
        ]
      },
      {
        "name": "accounts_is_admin_not_null",
        "type": "n",
        "keys": [
          "is_admin"
        ]
      },
      {
        "name": "accounts_failed_attempts_not_null",
        "type": "n",
        "keys": [
          "failed_attempts"
        ]
      },
      {
        "name": "accounts_password_changed_at_not_null",
        "type": "n",
        "keys": [
          "password_changed_at"
        ]
      },
      {
        "name": "accounts_created_at_not_null",
        "type": "n",
        "keys": [
          "created_at"
        ]
      },
      {
        "name": "accounts_updated_at_not_null",
        "type": "n",
        "keys": [
          "updated_at"
        ]
      },
      {
        "name": "accounts_share_enabled_not_null",
        "type": "n",
        "keys": [
          "share_enabled"
        ]
      },
      {
        "name": "accounts_governance_revision_not_null",
        "type": "n",
        "keys": [
          "governance_revision"
        ]
      },
      {
        "name": "accounts_staff_revision_not_null",
        "type": "n",
        "keys": [
          "staff_revision"
        ]
      },
      {
        "name": "accounts_staff_revision_ck",
        "type": "c",
        "expression": "staff_revision BETWEEN 1 AND 9007199254740990"
      }
    ]
  },
  {
    "name": "sessions",
    "policy": "native_auth_sessions_service",
    "privileges": [
      "SELECT",
      "INSERT",
      "UPDATE",
      "DELETE"
    ],
    "columns": [
      {
        "name": "token_digest",
        "type": "bytea",
        "required": true,
        "default": null
      },
      {
        "name": "user_id",
        "type": "uuid",
        "required": true,
        "default": null
      },
      {
        "name": "issued_at",
        "type": "timestamp with time zone",
        "required": true,
        "default": "now()"
      },
      {
        "name": "expires_at",
        "type": "timestamp with time zone",
        "required": true,
        "default": null
      },
      {
        "name": "revoked_at",
        "type": "timestamp with time zone",
        "required": false,
        "default": null
      },
      {
        "name": "last_used_at",
        "type": "timestamp with time zone",
        "required": false,
        "default": null
      }
    ],
    "constraints": [
      {
        "name": "sessions_pkey",
        "type": "p",
        "keys": [
          "token_digest"
        ]
      },
      {
        "name": "sessions_user_id_fkey",
        "type": "f",
        "keys": [
          "user_id"
        ],
        "target": "agentstudio.users",
        "target_keys": [
          "id"
        ],
        "update": "a",
        "delete": "c"
      },
      {
        "name": "sessions_token_digest_check",
        "type": "c",
        "expression": "octet_length(token_digest)=32"
      },
      {
        "name": "sessions_check",
        "type": "c",
        "expression": "expires_at>issued_at"
      },
      {
        "name": "sessions_check1",
        "type": "c",
        "expression": "expires_at<=issued_at+interval '24 hours'"
      },
      {
        "name": "sessions_token_digest_not_null",
        "type": "n",
        "keys": [
          "token_digest"
        ]
      },
      {
        "name": "sessions_user_id_not_null",
        "type": "n",
        "keys": [
          "user_id"
        ]
      },
      {
        "name": "sessions_issued_at_not_null",
        "type": "n",
        "keys": [
          "issued_at"
        ]
      },
      {
        "name": "sessions_expires_at_not_null",
        "type": "n",
        "keys": [
          "expires_at"
        ]
      }
    ],
    "extra_indexes": [
      {
        "name": "ix_auth_sessions_user_expiry",
        "keys": [
          "user_id",
          "expires_at"
        ],
        "unique": false
      }
    ]
  },
  {
    "name": "employee_governance_events",
    "policy": "native_auth_employee_governance",
    "privileges": [
      "SELECT",
      "INSERT"
    ],
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "required": true,
        "default": "gen_random_uuid()"
      },
      {
        "name": "actor_user_id",
        "type": "uuid",
        "required": true,
        "default": null
      },
      {
        "name": "target_user_id",
        "type": "uuid",
        "required": true,
        "default": null
      },
      {
        "name": "action",
        "type": "text",
        "required": true,
        "default": null
      },
      {
        "name": "request_id",
        "type": "uuid",
        "required": false,
        "default": null
      },
      {
        "name": "request_sha256",
        "type": "text",
        "required": false,
        "default": null
      },
      {
        "name": "before_state",
        "type": "jsonb",
        "required": true,
        "default": null
      },
      {
        "name": "after_state",
        "type": "jsonb",
        "required": true,
        "default": null
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "required": true,
        "default": "clock_timestamp()"
      }
    ],
    "constraints": [
      {
        "name": "employee_governance_events_pkey",
        "type": "p",
        "keys": [
          "id"
        ]
      },
      {
        "name": "employee_governance_events_actor_user_id_fkey",
        "type": "f",
        "keys": [
          "actor_user_id"
        ],
        "target": "agentstudio.users",
        "target_keys": [
          "id"
        ],
        "update": "a",
        "delete": "r"
      },
      {
        "name": "employee_governance_events_target_user_id_fkey",
        "type": "f",
        "keys": [
          "target_user_id"
        ],
        "target": "agentstudio.users",
        "target_keys": [
          "id"
        ],
        "update": "a",
        "delete": "r"
      },
      {
        "name": "employee_governance_events_actor_user_id_request_id_key",
        "type": "u",
        "keys": [
          "actor_user_id",
          "request_id"
        ]
      },
      {
        "name": "employee_governance_events_action_check",
        "type": "c",
        "expression": "action IN('employee.create','employee.change','employee.password')"
      },
      {
        "name": "employee_governance_events_request_sha256_check",
        "type": "c",
        "expression": "request_sha256 ~ '^[a-f0-9]{64}$'"
      },
      {
        "name": "employee_governance_events_before_state_check",
        "type": "c",
        "expression": "jsonb_typeof(before_state)='object'"
      },
      {
        "name": "employee_governance_events_after_state_check",
        "type": "c",
        "expression": "jsonb_typeof(after_state)='object'"
      },
      {
        "name": "employee_governance_events_check",
        "type": "c",
        "expression": "(action='employee.change')=(request_id IS NOT NULL AND request_sha256 IS NOT NULL)"
      },
      {
        "name": "employee_governance_events_id_not_null",
        "type": "n",
        "keys": [
          "id"
        ]
      },
      {
        "name": "employee_governance_events_actor_user_id_not_null",
        "type": "n",
        "keys": [
          "actor_user_id"
        ]
      },
      {
        "name": "employee_governance_events_target_user_id_not_null",
        "type": "n",
        "keys": [
          "target_user_id"
        ]
      },
      {
        "name": "employee_governance_events_action_not_null",
        "type": "n",
        "keys": [
          "action"
        ]
      },
      {
        "name": "employee_governance_events_before_state_not_null",
        "type": "n",
        "keys": [
          "before_state"
        ]
      },
      {
        "name": "employee_governance_events_after_state_not_null",
        "type": "n",
        "keys": [
          "after_state"
        ]
      },
      {
        "name": "employee_governance_events_created_at_not_null",
        "type": "n",
        "keys": [
          "created_at"
        ]
      }
    ]
  },
  {
    "name": "original_staff_receipts",
    "policy": "native_auth_original_staff_receipts",
    "privileges": [
      "SELECT",
      "INSERT"
    ],
    "columns": [
      {
        "name": "actor_user_id",
        "type": "uuid",
        "required": true,
        "default": null
      },
      {
        "name": "request_id",
        "type": "uuid",
        "required": true,
        "default": null
      },
      {
        "name": "action",
        "type": "text",
        "required": true,
        "default": null
      },
      {
        "name": "target_user_id",
        "type": "uuid",
        "required": true,
        "default": null
      },
      {
        "name": "request_sha256",
        "type": "text",
        "required": true,
        "default": null
      },
      {
        "name": "email",
        "type": "text",
        "required": true,
        "default": null
      },
      {
        "name": "display_name",
        "type": "text",
        "required": true,
        "default": null
      },
      {
        "name": "is_admin",
        "type": "boolean",
        "required": true,
        "default": null
      },
      {
        "name": "enabled",
        "type": "boolean",
        "required": true,
        "default": null
      },
      {
        "name": "status",
        "type": "text",
        "required": true,
        "default": null
      },
      {
        "name": "share_enabled",
        "type": "boolean",
        "required": true,
        "default": null
      },
      {
        "name": "revision",
        "type": "bigint",
        "required": true,
        "default": null
      },
      {
        "name": "governance_revision",
        "type": "bigint",
        "required": true,
        "default": null
      },
      {
        "name": "profile_created_at",
        "type": "timestamp with time zone",
        "required": true,
        "default": null
      },
      {
        "name": "profile_updated_at",
        "type": "timestamp with time zone",
        "required": true,
        "default": null
      },
      {
        "name": "revoked_sessions",
        "type": "boolean",
        "required": true,
        "default": null
      },
      {
        "name": "before_profile",
        "type": "jsonb",
        "required": true,
        "default": null
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "required": true,
        "default": "clock_timestamp()"
      }
    ],
    "constraints": [
      {
        "name": "original_staff_receipts_pkey",
        "type": "p",
        "keys": [
          "actor_user_id",
          "request_id"
        ]
      },
      {
        "name": "original_staff_receipts_actor_fk",
        "type": "f",
        "keys": [
          "actor_user_id"
        ],
        "target": "agentstudio.users",
        "target_keys": [
          "id"
        ],
        "update": "a",
        "delete": "r"
      },
      {
        "name": "original_staff_receipts_target_fk",
        "type": "f",
        "keys": [
          "target_user_id"
        ],
        "target": "agentstudio.users",
        "target_keys": [
          "id"
        ],
        "update": "a",
        "delete": "r"
      },
      {
        "name": "original_staff_receipts_action_ck",
        "type": "c",
        "expression": "action IN('create','update','reset')"
      },
      {
        "name": "original_staff_receipts_hash_ck",
        "type": "c",
        "expression": "request_sha256 ~ '^[a-f0-9]{64}$'"
      },
      {
        "name": "original_staff_receipts_email_ck",
        "type": "c",
        "expression": "char_length(email) BETWEEN 5 AND 254 AND email=lower(email) AND email !~ '[[:space:]]'"
      },
      {
        "name": "original_staff_receipts_name_ck",
        "type": "c",
        "expression": "char_length(display_name) BETWEEN 1 AND 80"
      },
      {
        "name": "original_staff_receipts_status_ck",
        "type": "c",
        "expression": "status IN('active','disabled') AND enabled=(status='active')"
      },
      {
        "name": "original_staff_receipts_revision_ck",
        "type": "c",
        "expression": "revision BETWEEN 1 AND 9007199254740990"
      },
      {
        "name": "original_staff_receipts_actor_user_id_not_null",
        "type": "n",
        "keys": [
          "actor_user_id"
        ]
      },
      {
        "name": "original_staff_receipts_request_id_not_null",
        "type": "n",
        "keys": [
          "request_id"
        ]
      },
      {
        "name": "original_staff_receipts_action_not_null",
        "type": "n",
        "keys": [
          "action"
        ]
      },
      {
        "name": "original_staff_receipts_target_user_id_not_null",
        "type": "n",
        "keys": [
          "target_user_id"
        ]
      },
      {
        "name": "original_staff_receipts_request_sha256_not_null",
        "type": "n",
        "keys": [
          "request_sha256"
        ]
      },
      {
        "name": "original_staff_receipts_email_not_null",
        "type": "n",
        "keys": [
          "email"
        ]
      },
      {
        "name": "original_staff_receipts_display_name_not_null",
        "type": "n",
        "keys": [
          "display_name"
        ]
      },
      {
        "name": "original_staff_receipts_is_admin_not_null",
        "type": "n",
        "keys": [
          "is_admin"
        ]
      },
      {
        "name": "original_staff_receipts_enabled_not_null",
        "type": "n",
        "keys": [
          "enabled"
        ]
      },
      {
        "name": "original_staff_receipts_status_not_null",
        "type": "n",
        "keys": [
          "status"
        ]
      },
      {
        "name": "original_staff_receipts_share_enabled_not_null",
        "type": "n",
        "keys": [
          "share_enabled"
        ]
      },
      {
        "name": "original_staff_receipts_revision_not_null",
        "type": "n",
        "keys": [
          "revision"
        ]
      },
      {
        "name": "original_staff_receipts_profile_created_at_not_null",
        "type": "n",
        "keys": [
          "profile_created_at"
        ]
      },
      {
        "name": "original_staff_receipts_profile_updated_at_not_null",
        "type": "n",
        "keys": [
          "profile_updated_at"
        ]
      },
      {
        "name": "original_staff_receipts_revoked_sessions_not_null",
        "type": "n",
        "keys": [
          "revoked_sessions"
        ]
      },
      {
        "name": "original_staff_receipts_created_at_not_null",
        "type": "n",
        "keys": [
          "created_at"
        ]
      },
      {
        "name": "original_staff_receipts_before_profile_not_null",
        "type": "n",
        "keys": [
          "before_profile"
        ]
      },
      {
        "name": "original_staff_receipts_before_ck",
        "type": "c",
        "expression": "jsonb_typeof(before_profile)='object' AND (before_profile-ARRAY['id','display_name','email','role','active','share_enabled','revision','governance_revision','created','updated']::text[])='{}'::jsonb"
      },
      {
        "name": "original_staff_receipts_governance_revision_not_null",
        "type": "n",
        "keys": [
          "governance_revision"
        ]
      },
      {
        "name": "original_staff_receipts_governance_ck",
        "type": "c",
        "expression": "governance_revision BETWEEN 1 AND 9007199254740990"
      }
    ]
  },
  {
    "name": "original_staff_password_requests",
    "policy": "native_auth_original_staff_password_requests",
    "privileges": [
      "SELECT",
      "INSERT"
    ],
    "columns": [
      {
        "name": "actor_user_id",
        "type": "uuid",
        "required": true,
        "default": null
      },
      {
        "name": "request_id",
        "type": "uuid",
        "required": true,
        "default": null
      },
      {
        "name": "password_record",
        "type": "text",
        "required": true,
        "default": null
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "required": true,
        "default": "clock_timestamp()"
      }
    ],
    "constraints": [
      {
        "name": "original_staff_password_requests_pkey",
        "type": "p",
        "keys": [
          "actor_user_id",
          "request_id"
        ]
      },
      {
        "name": "original_staff_password_requests_receipt_fk",
        "type": "f",
        "keys": [
          "actor_user_id",
          "request_id"
        ],
        "target": "agentstudio_auth.original_staff_receipts",
        "target_keys": [
          "actor_user_id",
          "request_id"
        ],
        "update": "a",
        "delete": "r"
      },
      {
        "name": "original_staff_password_requests_record_ck",
        "type": "c",
        "expression": "length(password_record) BETWEEN 100 AND 320 AND left(password_record,20)='scrypt$v1$32768$8$1$'"
      },
      {
        "name": "original_staff_password_requests_actor_user_id_not_null",
        "type": "n",
        "keys": [
          "actor_user_id"
        ]
      },
      {
        "name": "original_staff_password_requests_request_id_not_null",
        "type": "n",
        "keys": [
          "request_id"
        ]
      },
      {
        "name": "original_staff_password_requests_password_record_not_null",
        "type": "n",
        "keys": [
          "password_record"
        ]
      },
      {
        "name": "original_staff_password_requests_created_at_not_null",
        "type": "n",
        "keys": [
          "created_at"
        ]
      }
    ]
  }
])
export const originalStaffRevisionGuardSha256="c17dfe3384bc8f0137ca2b52c79a8bd409068d453ef1e08988729079af0cb481"
