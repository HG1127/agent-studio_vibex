export function originalRoleCatalogFrame(){return structuredClone({
  "format": "original-roles-catalog.v2",
  "context": {
    "database": "agent_studio",
    "database_oid": "16384",
    "host": "127.0.0.1",
    "port": 5333,
    "version": 180005,
    "role": "agentstudio_api",
    "login": "agentstudio_stage_login",
    "primary": true,
    "replication_role": "origin",
    "read_only": true,
    "search_path": "pg_catalog"
  },
  "namespace": {
    "owner": "postgres",
    "acl": [
      {
        "grantor": "postgres",
        "grantee": "postgres",
        "right": "USAGE",
        "grantable": false
      },
      {
        "grantor": "postgres",
        "grantee": "postgres",
        "right": "CREATE",
        "grantable": false
      },
      {
        "grantor": "postgres",
        "grantee": "agentstudio_api",
        "right": "USAGE",
        "grantable": false
      },
      {
        "grantor": "postgres",
        "grantee": "agentstudio_worker",
        "right": "USAGE",
        "grantable": false
      }
    ]
  },
  "stamp": [
    {
      "protocol": "original-roles-v2",
      "source_sha256": "44318220de1d8a4f3f5de9566d83c2380740c9e933b62e00402b341a77aa176c"
    }
  ],
  "roles": [
    {
      "name": "postgres",
      "login": true,
      "super": true,
      "bypass": true,
      "inherit": true,
      "createdb": true,
      "createrole": true,
      "replication": true,
      "config": null,
      "limit": -1,
      "valid_until": null
    },
    {
      "name": "agentstudio_api",
      "login": false,
      "super": false,
      "bypass": false,
      "inherit": false,
      "createdb": false,
      "createrole": false,
      "replication": false,
      "config": null,
      "limit": -1,
      "valid_until": null
    },
    {
      "name": "agentstudio_worker",
      "login": false,
      "super": false,
      "bypass": false,
      "inherit": false,
      "createdb": false,
      "createrole": false,
      "replication": false,
      "config": null,
      "limit": -1,
      "valid_until": null
    },
    {
      "name": "agentstudio_stage_login",
      "login": true,
      "super": false,
      "bypass": false,
      "inherit": false,
      "createdb": false,
      "createrole": false,
      "replication": false,
      "config": null,
      "limit": -1,
      "valid_until": null
    },
    {
      "name": "agentstudio_stage_worker",
      "login": true,
      "super": false,
      "bypass": false,
      "inherit": false,
      "createdb": false,
      "createrole": false,
      "replication": false,
      "config": null,
      "limit": -1,
      "valid_until": null
    },
    {
      "name": "agentstudio_native_auth",
      "login": false,
      "super": false,
      "bypass": false,
      "inherit": false,
      "createdb": false,
      "createrole": false,
      "replication": false,
      "config": null,
      "limit": -1,
      "valid_until": null
    },
    {
      "name": "agentstudio_model_broker",
      "login": false,
      "super": false,
      "bypass": false,
      "inherit": false,
      "createdb": false,
      "createrole": false,
      "replication": false,
      "config": null,
      "limit": -1,
      "valid_until": null
    },
    {
      "name": "agentstudio_bound_dispatch",
      "login": false,
      "super": false,
      "bypass": false,
      "inherit": false,
      "createdb": false,
      "createrole": false,
      "replication": false,
      "config": null,
      "limit": -1,
      "valid_until": null
    },
    {
      "name": "pg_read_all_data",
      "login": false,
      "super": false,
      "bypass": false,
      "inherit": false,
      "createdb": false,
      "createrole": false,
      "replication": false,
      "config": null,
      "limit": -1,
      "valid_until": null
    },
    {
      "name": "pg_write_all_data",
      "login": false,
      "super": false,
      "bypass": false,
      "inherit": false,
      "createdb": false,
      "createrole": false,
      "replication": false,
      "config": null,
      "limit": -1,
      "valid_until": null
    },
    {
      "name": "pg_maintain",
      "login": false,
      "super": false,
      "bypass": false,
      "inherit": false,
      "createdb": false,
      "createrole": false,
      "replication": false,
      "config": null,
      "limit": -1,
      "valid_until": null
    }
  ],
  "members": [
    {
      "role": "agentstudio_api",
      "member": "agentstudio_stage_login",
      "grantor": "postgres",
      "admin": false,
      "inherit": false,
      "set": true
    },
    {
      "role": "agentstudio_api",
      "member": "agentstudio_stage_worker",
      "grantor": "postgres",
      "admin": false,
      "inherit": false,
      "set": true
    },
    {
      "role": "agentstudio_worker",
      "member": "agentstudio_stage_worker",
      "grantor": "postgres",
      "admin": false,
      "inherit": false,
      "set": true
    }
  ],
  "relations": [
    {
      "name": "runtime_profile",
      "kind": "r",
      "owner": "postgres",
      "rls": true,
      "force": true,
      "safe": true
    },
    {
      "name": "original_skills",
      "kind": "r",
      "owner": "postgres",
      "rls": true,
      "force": true,
      "safe": true
    },
    {
      "name": "original_skill_versions",
      "kind": "r",
      "owner": "postgres",
      "rls": true,
      "force": true,
      "safe": true
    },
    {
      "name": "original_skill_reviews",
      "kind": "r",
      "owner": "postgres",
      "rls": true,
      "force": true,
      "safe": true
    },
    {
      "name": "original_role_specs",
      "kind": "r",
      "owner": "postgres",
      "rls": true,
      "force": true,
      "safe": true
    },
    {
      "name": "original_role_extensions",
      "kind": "r",
      "owner": "postgres",
      "rls": true,
      "force": true,
      "safe": true
    },
    {
      "name": "original_role_run_pins",
      "kind": "r",
      "owner": "postgres",
      "rls": true,
      "force": true,
      "safe": true
    },
    {
      "name": "runtime_profile_pkey",
      "kind": "i",
      "owner": "postgres",
      "rls": false,
      "force": false,
      "safe": true
    },
    {
      "name": "original_skills_pkey",
      "kind": "i",
      "owner": "postgres",
      "rls": false,
      "force": false,
      "safe": true
    },
    {
      "name": "original_skills_u1",
      "kind": "i",
      "owner": "postgres",
      "rls": false,
      "force": false,
      "safe": true
    },
    {
      "name": "original_skill_versions_pkey",
      "kind": "i",
      "owner": "postgres",
      "rls": false,
      "force": false,
      "safe": true
    },
    {
      "name": "original_skill_versions_u1",
      "kind": "i",
      "owner": "postgres",
      "rls": false,
      "force": false,
      "safe": true
    },
    {
      "name": "original_skill_reviews_pkey",
      "kind": "i",
      "owner": "postgres",
      "rls": false,
      "force": false,
      "safe": true
    },
    {
      "name": "original_role_specs_pkey",
      "kind": "i",
      "owner": "postgres",
      "rls": false,
      "force": false,
      "safe": true
    },
    {
      "name": "original_role_extensions_pkey",
      "kind": "i",
      "owner": "postgres",
      "rls": false,
      "force": false,
      "safe": true
    },
    {
      "name": "original_role_run_pins_pkey",
      "kind": "i",
      "owner": "postgres",
      "rls": false,
      "force": false,
      "safe": true
    }
  ],
  "columns": [
    {
      "table": "runtime_profile",
      "position": 1,
      "name": "protocol",
      "type": "text",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "runtime_profile",
      "position": 2,
      "name": "source_sha256",
      "type": "text",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "runtime_profile",
      "position": 3,
      "name": "created_at",
      "type": "timestamp with time zone",
      "required": true,
      "default": "clock_timestamp()",
      "safe": true,
      "acl": []
    },
    {
      "table": "original_skills",
      "position": 1,
      "name": "owner_user_id",
      "type": "uuid",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_skills",
      "position": 2,
      "name": "id",
      "type": "text",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_skills",
      "position": 3,
      "name": "name",
      "type": "text",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_skills",
      "position": 4,
      "name": "active",
      "type": "boolean",
      "required": true,
      "default": "true",
      "safe": true,
      "acl": [
        {
          "grantor": "postgres",
          "grantee": "agentstudio_api",
          "right": "UPDATE",
          "grantable": false
        }
      ]
    },
    {
      "table": "original_skills",
      "position": 5,
      "name": "latest_version",
      "type": "integer",
      "required": true,
      "default": null,
      "safe": true,
      "acl": [
        {
          "grantor": "postgres",
          "grantee": "agentstudio_api",
          "right": "UPDATE",
          "grantable": false
        }
      ]
    },
    {
      "table": "original_skills",
      "position": 6,
      "name": "created_at",
      "type": "timestamp with time zone",
      "required": true,
      "default": "clock_timestamp()",
      "safe": true,
      "acl": []
    },
    {
      "table": "original_skills",
      "position": 7,
      "name": "updated_at",
      "type": "timestamp with time zone",
      "required": true,
      "default": "clock_timestamp()",
      "safe": true,
      "acl": [
        {
          "grantor": "postgres",
          "grantee": "agentstudio_api",
          "right": "UPDATE",
          "grantable": false
        }
      ]
    },
    {
      "table": "original_skill_versions",
      "position": 1,
      "name": "owner_user_id",
      "type": "uuid",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_skill_versions",
      "position": 2,
      "name": "skill_id",
      "type": "text",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_skill_versions",
      "position": 3,
      "name": "version",
      "type": "integer",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_skill_versions",
      "position": 4,
      "name": "name",
      "type": "text",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_skill_versions",
      "position": 5,
      "name": "description",
      "type": "text",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_skill_versions",
      "position": 6,
      "name": "content",
      "type": "text",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_skill_versions",
      "position": 7,
      "name": "content_sha256",
      "type": "text",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_skill_versions",
      "position": 8,
      "name": "created_at",
      "type": "timestamp with time zone",
      "required": true,
      "default": "clock_timestamp()",
      "safe": true,
      "acl": []
    },
    {
      "table": "original_skill_reviews",
      "position": 1,
      "name": "owner_user_id",
      "type": "uuid",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_skill_reviews",
      "position": 2,
      "name": "skill_id",
      "type": "text",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_skill_reviews",
      "position": 3,
      "name": "version",
      "type": "integer",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_skill_reviews",
      "position": 4,
      "name": "content_sha256",
      "type": "text",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_skill_reviews",
      "position": 5,
      "name": "reviewed_by",
      "type": "uuid",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_skill_reviews",
      "position": 6,
      "name": "reviewed_at",
      "type": "timestamp with time zone",
      "required": true,
      "default": "clock_timestamp()",
      "safe": true,
      "acl": []
    },
    {
      "table": "original_role_specs",
      "position": 1,
      "name": "owner_user_id",
      "type": "uuid",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_role_specs",
      "position": 2,
      "name": "spec_id",
      "type": "uuid",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_role_specs",
      "position": 3,
      "name": "spec_revision",
      "type": "bigint",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_role_specs",
      "position": 4,
      "name": "spec",
      "type": "jsonb",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_role_specs",
      "position": 5,
      "name": "spec_sha256",
      "type": "text",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_role_specs",
      "position": 6,
      "name": "created_at",
      "type": "timestamp with time zone",
      "required": true,
      "default": "clock_timestamp()",
      "safe": true,
      "acl": []
    },
    {
      "table": "original_role_extensions",
      "position": 1,
      "name": "owner_user_id",
      "type": "uuid",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_role_extensions",
      "position": 2,
      "name": "spec_id",
      "type": "uuid",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_role_extensions",
      "position": 3,
      "name": "spec_revision",
      "type": "bigint",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_role_extensions",
      "position": 4,
      "name": "base_spec_sha256",
      "type": "text",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_role_extensions",
      "position": 5,
      "name": "extension",
      "type": "jsonb",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_role_extensions",
      "position": 6,
      "name": "created_at",
      "type": "timestamp with time zone",
      "required": true,
      "default": "clock_timestamp()",
      "safe": true,
      "acl": []
    },
    {
      "table": "original_role_run_pins",
      "position": 1,
      "name": "owner_user_id",
      "type": "uuid",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_role_run_pins",
      "position": 2,
      "name": "run_id",
      "type": "uuid",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_role_run_pins",
      "position": 3,
      "name": "spec_id",
      "type": "uuid",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_role_run_pins",
      "position": 4,
      "name": "spec_revision",
      "type": "bigint",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_role_run_pins",
      "position": 5,
      "name": "payload",
      "type": "jsonb",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_role_run_pins",
      "position": 6,
      "name": "payload_sha256",
      "type": "text",
      "required": true,
      "default": null,
      "safe": true,
      "acl": []
    },
    {
      "table": "original_role_run_pins",
      "position": 7,
      "name": "created_at",
      "type": "timestamp with time zone",
      "required": true,
      "default": "clock_timestamp()",
      "safe": true,
      "acl": []
    }
  ],
  "constraints": [
    {
      "name": "runtime_profile_protocol_nn",
      "table": "agentstudio_roles.runtime_profile",
      "kind": "n",
      "keys": [
        "protocol"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "runtime_profile_source_sha256_nn",
      "table": "agentstudio_roles.runtime_profile",
      "kind": "n",
      "keys": [
        "source_sha256"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "runtime_profile_created_at_nn",
      "table": "agentstudio_roles.runtime_profile",
      "kind": "n",
      "keys": [
        "created_at"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "runtime_profile_pkey",
      "table": "agentstudio_roles.runtime_profile",
      "kind": "p",
      "keys": [
        "protocol"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "runtime_profile_ck0",
      "table": "agentstudio_roles.runtime_profile",
      "kind": "c",
      "keys": [
        "protocol"
      ],
      "target": null,
      "target_keys": null,
      "expression": "protocol='original-roles-v2'",
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "runtime_profile_ck1",
      "table": "agentstudio_roles.runtime_profile",
      "kind": "c",
      "keys": [
        "source_sha256"
      ],
      "target": null,
      "target_keys": null,
      "expression": "source_sha256 ~ '^[a-f0-9]{64}$'",
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skills_owner_user_id_nn",
      "table": "agentstudio_roles.original_skills",
      "kind": "n",
      "keys": [
        "owner_user_id"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skills_id_nn",
      "table": "agentstudio_roles.original_skills",
      "kind": "n",
      "keys": [
        "id"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skills_name_nn",
      "table": "agentstudio_roles.original_skills",
      "kind": "n",
      "keys": [
        "name"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skills_active_nn",
      "table": "agentstudio_roles.original_skills",
      "kind": "n",
      "keys": [
        "active"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skills_latest_version_nn",
      "table": "agentstudio_roles.original_skills",
      "kind": "n",
      "keys": [
        "latest_version"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skills_created_at_nn",
      "table": "agentstudio_roles.original_skills",
      "kind": "n",
      "keys": [
        "created_at"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skills_updated_at_nn",
      "table": "agentstudio_roles.original_skills",
      "kind": "n",
      "keys": [
        "updated_at"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skills_pkey",
      "table": "agentstudio_roles.original_skills",
      "kind": "p",
      "keys": [
        "owner_user_id",
        "id"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skills_u1",
      "table": "agentstudio_roles.original_skills",
      "kind": "u",
      "keys": [
        "owner_user_id",
        "name"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skills_ck0",
      "table": "agentstudio_roles.original_skills",
      "kind": "c",
      "keys": [
        "id"
      ],
      "target": null,
      "target_keys": null,
      "expression": "id ~ '^[A-Za-z0-9]{15}$'",
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skills_ck1",
      "table": "agentstudio_roles.original_skills",
      "kind": "c",
      "keys": [
        "name"
      ],
      "target": null,
      "target_keys": null,
      "expression": "length(name) BETWEEN 1 AND 64 AND name ~ '^[a-z0-9]+(-[a-z0-9]+)*$'",
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skills_ck2",
      "table": "agentstudio_roles.original_skills",
      "kind": "c",
      "keys": [
        "latest_version"
      ],
      "target": null,
      "target_keys": null,
      "expression": "latest_version BETWEEN 1 AND 100",
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skills_fk0",
      "table": "agentstudio_roles.original_skills",
      "kind": "f",
      "keys": [
        "owner_user_id"
      ],
      "target": "agentstudio.users",
      "target_keys": [
        "id"
      ],
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skill_versions_owner_user_id_nn",
      "table": "agentstudio_roles.original_skill_versions",
      "kind": "n",
      "keys": [
        "owner_user_id"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skill_versions_skill_id_nn",
      "table": "agentstudio_roles.original_skill_versions",
      "kind": "n",
      "keys": [
        "skill_id"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skill_versions_version_nn",
      "table": "agentstudio_roles.original_skill_versions",
      "kind": "n",
      "keys": [
        "version"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skill_versions_name_nn",
      "table": "agentstudio_roles.original_skill_versions",
      "kind": "n",
      "keys": [
        "name"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skill_versions_description_nn",
      "table": "agentstudio_roles.original_skill_versions",
      "kind": "n",
      "keys": [
        "description"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skill_versions_content_nn",
      "table": "agentstudio_roles.original_skill_versions",
      "kind": "n",
      "keys": [
        "content"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skill_versions_content_sha256_nn",
      "table": "agentstudio_roles.original_skill_versions",
      "kind": "n",
      "keys": [
        "content_sha256"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skill_versions_created_at_nn",
      "table": "agentstudio_roles.original_skill_versions",
      "kind": "n",
      "keys": [
        "created_at"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skill_versions_pkey",
      "table": "agentstudio_roles.original_skill_versions",
      "kind": "p",
      "keys": [
        "owner_user_id",
        "skill_id",
        "version"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skill_versions_u1",
      "table": "agentstudio_roles.original_skill_versions",
      "kind": "u",
      "keys": [
        "owner_user_id",
        "skill_id",
        "version",
        "content_sha256"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skill_versions_ck0",
      "table": "agentstudio_roles.original_skill_versions",
      "kind": "c",
      "keys": [
        "version"
      ],
      "target": null,
      "target_keys": null,
      "expression": "version BETWEEN 1 AND 100",
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skill_versions_ck1",
      "table": "agentstudio_roles.original_skill_versions",
      "kind": "c",
      "keys": [
        "name"
      ],
      "target": null,
      "target_keys": null,
      "expression": "length(name) BETWEEN 1 AND 64",
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skill_versions_ck2",
      "table": "agentstudio_roles.original_skill_versions",
      "kind": "c",
      "keys": [
        "description"
      ],
      "target": null,
      "target_keys": null,
      "expression": "length(description) BETWEEN 1 AND 1024",
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skill_versions_ck3",
      "table": "agentstudio_roles.original_skill_versions",
      "kind": "c",
      "keys": [
        "content"
      ],
      "target": null,
      "target_keys": null,
      "expression": "length(content) BETWEEN 15 AND 16000",
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skill_versions_ck4",
      "table": "agentstudio_roles.original_skill_versions",
      "kind": "c",
      "keys": [
        "content",
        "content_sha256"
      ],
      "target": null,
      "target_keys": null,
      "expression": "content_sha256 ~ '^[a-f0-9]{64}$' AND content_sha256=encode(sha256(convert_to(content,'UTF8'::name)),'hex')",
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skill_versions_fk0",
      "table": "agentstudio_roles.original_skill_versions",
      "kind": "f",
      "keys": [
        "owner_user_id",
        "skill_id"
      ],
      "target": "agentstudio_roles.original_skills",
      "target_keys": [
        "owner_user_id",
        "id"
      ],
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skill_reviews_owner_user_id_nn",
      "table": "agentstudio_roles.original_skill_reviews",
      "kind": "n",
      "keys": [
        "owner_user_id"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skill_reviews_skill_id_nn",
      "table": "agentstudio_roles.original_skill_reviews",
      "kind": "n",
      "keys": [
        "skill_id"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skill_reviews_version_nn",
      "table": "agentstudio_roles.original_skill_reviews",
      "kind": "n",
      "keys": [
        "version"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skill_reviews_content_sha256_nn",
      "table": "agentstudio_roles.original_skill_reviews",
      "kind": "n",
      "keys": [
        "content_sha256"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skill_reviews_reviewed_by_nn",
      "table": "agentstudio_roles.original_skill_reviews",
      "kind": "n",
      "keys": [
        "reviewed_by"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skill_reviews_reviewed_at_nn",
      "table": "agentstudio_roles.original_skill_reviews",
      "kind": "n",
      "keys": [
        "reviewed_at"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skill_reviews_pkey",
      "table": "agentstudio_roles.original_skill_reviews",
      "kind": "p",
      "keys": [
        "owner_user_id",
        "skill_id",
        "version"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skill_reviews_ck0",
      "table": "agentstudio_roles.original_skill_reviews",
      "kind": "c",
      "keys": [
        "owner_user_id",
        "reviewed_by"
      ],
      "target": null,
      "target_keys": null,
      "expression": "reviewed_by=owner_user_id",
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_skill_reviews_fk0",
      "table": "agentstudio_roles.original_skill_reviews",
      "kind": "f",
      "keys": [
        "owner_user_id",
        "skill_id",
        "version",
        "content_sha256"
      ],
      "target": "agentstudio_roles.original_skill_versions",
      "target_keys": [
        "owner_user_id",
        "skill_id",
        "version",
        "content_sha256"
      ],
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_specs_owner_user_id_nn",
      "table": "agentstudio_roles.original_role_specs",
      "kind": "n",
      "keys": [
        "owner_user_id"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_specs_spec_id_nn",
      "table": "agentstudio_roles.original_role_specs",
      "kind": "n",
      "keys": [
        "spec_id"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_specs_spec_revision_nn",
      "table": "agentstudio_roles.original_role_specs",
      "kind": "n",
      "keys": [
        "spec_revision"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_specs_spec_nn",
      "table": "agentstudio_roles.original_role_specs",
      "kind": "n",
      "keys": [
        "spec"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_specs_spec_sha256_nn",
      "table": "agentstudio_roles.original_role_specs",
      "kind": "n",
      "keys": [
        "spec_sha256"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_specs_created_at_nn",
      "table": "agentstudio_roles.original_role_specs",
      "kind": "n",
      "keys": [
        "created_at"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_specs_pkey",
      "table": "agentstudio_roles.original_role_specs",
      "kind": "p",
      "keys": [
        "owner_user_id",
        "spec_id",
        "spec_revision"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_specs_ck0",
      "table": "agentstudio_roles.original_role_specs",
      "kind": "c",
      "keys": [
        "spec_revision"
      ],
      "target": null,
      "target_keys": null,
      "expression": "spec_revision>0",
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_specs_ck1",
      "table": "agentstudio_roles.original_role_specs",
      "kind": "c",
      "keys": [
        "spec"
      ],
      "target": null,
      "target_keys": null,
      "expression": "jsonb_typeof(spec)='object'",
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_specs_ck2",
      "table": "agentstudio_roles.original_role_specs",
      "kind": "c",
      "keys": [
        "spec_sha256"
      ],
      "target": null,
      "target_keys": null,
      "expression": "spec_sha256 ~ '^[a-f0-9]{64}$'",
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_specs_fk0",
      "table": "agentstudio_roles.original_role_specs",
      "kind": "f",
      "keys": [
        "spec_id",
        "owner_user_id"
      ],
      "target": "agentstudio.agent_specs",
      "target_keys": [
        "id",
        "owner_user_id"
      ],
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_extensions_owner_user_id_nn",
      "table": "agentstudio_roles.original_role_extensions",
      "kind": "n",
      "keys": [
        "owner_user_id"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_extensions_spec_id_nn",
      "table": "agentstudio_roles.original_role_extensions",
      "kind": "n",
      "keys": [
        "spec_id"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_extensions_spec_revision_nn",
      "table": "agentstudio_roles.original_role_extensions",
      "kind": "n",
      "keys": [
        "spec_revision"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_extensions_base_spec_sha256_nn",
      "table": "agentstudio_roles.original_role_extensions",
      "kind": "n",
      "keys": [
        "base_spec_sha256"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_extensions_extension_nn",
      "table": "agentstudio_roles.original_role_extensions",
      "kind": "n",
      "keys": [
        "extension"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_extensions_created_at_nn",
      "table": "agentstudio_roles.original_role_extensions",
      "kind": "n",
      "keys": [
        "created_at"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_extensions_pkey",
      "table": "agentstudio_roles.original_role_extensions",
      "kind": "p",
      "keys": [
        "owner_user_id",
        "spec_id",
        "spec_revision"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_extensions_ck0",
      "table": "agentstudio_roles.original_role_extensions",
      "kind": "c",
      "keys": [
        "base_spec_sha256"
      ],
      "target": null,
      "target_keys": null,
      "expression": "base_spec_sha256 ~ '^[a-f0-9]{64}$'",
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_extensions_ck1",
      "table": "agentstudio_roles.original_role_extensions",
      "kind": "c",
      "keys": [
        "extension"
      ],
      "target": null,
      "target_keys": null,
      "expression": "jsonb_typeof(extension)='object'",
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_extensions_fk0",
      "table": "agentstudio_roles.original_role_extensions",
      "kind": "f",
      "keys": [
        "owner_user_id",
        "spec_id",
        "spec_revision"
      ],
      "target": "agentstudio_roles.original_role_specs",
      "target_keys": [
        "owner_user_id",
        "spec_id",
        "spec_revision"
      ],
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_run_pins_owner_user_id_nn",
      "table": "agentstudio_roles.original_role_run_pins",
      "kind": "n",
      "keys": [
        "owner_user_id"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_run_pins_run_id_nn",
      "table": "agentstudio_roles.original_role_run_pins",
      "kind": "n",
      "keys": [
        "run_id"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_run_pins_spec_id_nn",
      "table": "agentstudio_roles.original_role_run_pins",
      "kind": "n",
      "keys": [
        "spec_id"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_run_pins_spec_revision_nn",
      "table": "agentstudio_roles.original_role_run_pins",
      "kind": "n",
      "keys": [
        "spec_revision"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_run_pins_payload_nn",
      "table": "agentstudio_roles.original_role_run_pins",
      "kind": "n",
      "keys": [
        "payload"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_run_pins_payload_sha256_nn",
      "table": "agentstudio_roles.original_role_run_pins",
      "kind": "n",
      "keys": [
        "payload_sha256"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_run_pins_created_at_nn",
      "table": "agentstudio_roles.original_role_run_pins",
      "kind": "n",
      "keys": [
        "created_at"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_run_pins_pkey",
      "table": "agentstudio_roles.original_role_run_pins",
      "kind": "p",
      "keys": [
        "owner_user_id",
        "run_id"
      ],
      "target": null,
      "target_keys": null,
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_run_pins_ck0",
      "table": "agentstudio_roles.original_role_run_pins",
      "kind": "c",
      "keys": [
        "payload"
      ],
      "target": null,
      "target_keys": null,
      "expression": "jsonb_typeof(payload)='object'",
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_run_pins_ck1",
      "table": "agentstudio_roles.original_role_run_pins",
      "kind": "c",
      "keys": [
        "payload_sha256"
      ],
      "target": null,
      "target_keys": null,
      "expression": "payload_sha256 ~ '^[a-f0-9]{64}$'",
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_run_pins_fk0",
      "table": "agentstudio_roles.original_role_run_pins",
      "kind": "f",
      "keys": [
        "run_id",
        "owner_user_id"
      ],
      "target": "agentstudio.runs",
      "target_keys": [
        "id",
        "owner_user_id"
      ],
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_run_pins_fk1",
      "table": "agentstudio_roles.original_role_run_pins",
      "kind": "f",
      "keys": [
        "owner_user_id",
        "spec_id",
        "spec_revision"
      ],
      "target": "agentstudio_roles.original_role_specs",
      "target_keys": [
        "owner_user_id",
        "spec_id",
        "spec_revision"
      ],
      "expression": null,
      "safe": true,
      "operators_safe": true
    },
    {
      "name": "original_role_run_pins_fk2",
      "table": "agentstudio_roles.original_role_run_pins",
      "kind": "f",
      "keys": [
        "owner_user_id",
        "spec_id",
        "spec_revision"
      ],
      "target": "agentstudio_roles.original_role_extensions",
      "target_keys": [
        "owner_user_id",
        "spec_id",
        "spec_revision"
      ],
      "expression": null,
      "safe": true,
      "operators_safe": true
    }
  ],
  "indexes": [
    {
      "name": "runtime_profile_pkey",
      "table": "runtime_profile",
      "keys": [
        "protocol"
      ],
      "primary": true,
      "unique": true,
      "opclasses": [
        "pg_catalog.text_ops"
      ],
      "collations": [
        "pg_catalog.default"
      ],
      "safe": true
    },
    {
      "name": "original_skills_pkey",
      "table": "original_skills",
      "keys": [
        "owner_user_id",
        "id"
      ],
      "primary": true,
      "unique": true,
      "opclasses": [
        "pg_catalog.uuid_ops",
        "pg_catalog.text_ops"
      ],
      "collations": [
        "-",
        "pg_catalog.default"
      ],
      "safe": true
    },
    {
      "name": "original_skills_u1",
      "table": "original_skills",
      "keys": [
        "owner_user_id",
        "name"
      ],
      "primary": false,
      "unique": true,
      "opclasses": [
        "pg_catalog.uuid_ops",
        "pg_catalog.text_ops"
      ],
      "collations": [
        "-",
        "pg_catalog.default"
      ],
      "safe": true
    },
    {
      "name": "original_skill_versions_pkey",
      "table": "original_skill_versions",
      "keys": [
        "owner_user_id",
        "skill_id",
        "version"
      ],
      "primary": true,
      "unique": true,
      "opclasses": [
        "pg_catalog.uuid_ops",
        "pg_catalog.text_ops",
        "pg_catalog.int4_ops"
      ],
      "collations": [
        "-",
        "pg_catalog.default",
        "-"
      ],
      "safe": true
    },
    {
      "name": "original_skill_versions_u1",
      "table": "original_skill_versions",
      "keys": [
        "owner_user_id",
        "skill_id",
        "version",
        "content_sha256"
      ],
      "primary": false,
      "unique": true,
      "opclasses": [
        "pg_catalog.uuid_ops",
        "pg_catalog.text_ops",
        "pg_catalog.int4_ops",
        "pg_catalog.text_ops"
      ],
      "collations": [
        "-",
        "pg_catalog.default",
        "-",
        "pg_catalog.default"
      ],
      "safe": true
    },
    {
      "name": "original_skill_reviews_pkey",
      "table": "original_skill_reviews",
      "keys": [
        "owner_user_id",
        "skill_id",
        "version"
      ],
      "primary": true,
      "unique": true,
      "opclasses": [
        "pg_catalog.uuid_ops",
        "pg_catalog.text_ops",
        "pg_catalog.int4_ops"
      ],
      "collations": [
        "-",
        "pg_catalog.default",
        "-"
      ],
      "safe": true
    },
    {
      "name": "original_role_specs_pkey",
      "table": "original_role_specs",
      "keys": [
        "owner_user_id",
        "spec_id",
        "spec_revision"
      ],
      "primary": true,
      "unique": true,
      "opclasses": [
        "pg_catalog.uuid_ops",
        "pg_catalog.uuid_ops",
        "pg_catalog.int8_ops"
      ],
      "collations": [
        "-",
        "-",
        "-"
      ],
      "safe": true
    },
    {
      "name": "original_role_extensions_pkey",
      "table": "original_role_extensions",
      "keys": [
        "owner_user_id",
        "spec_id",
        "spec_revision"
      ],
      "primary": true,
      "unique": true,
      "opclasses": [
        "pg_catalog.uuid_ops",
        "pg_catalog.uuid_ops",
        "pg_catalog.int8_ops"
      ],
      "collations": [
        "-",
        "-",
        "-"
      ],
      "safe": true
    },
    {
      "name": "original_role_run_pins_pkey",
      "table": "original_role_run_pins",
      "keys": [
        "owner_user_id",
        "run_id"
      ],
      "primary": true,
      "unique": true,
      "opclasses": [
        "pg_catalog.uuid_ops",
        "pg_catalog.uuid_ops"
      ],
      "collations": [
        "-",
        "-"
      ],
      "safe": true
    }
  ],
  "policies": [
    {
      "table": "runtime_profile",
      "name": "runtime_profile_owner",
      "command": "*",
      "permissive": true,
      "roles": [
        "agentstudio_api"
      ],
      "using": "true",
      "check": "false",
      "functions": []
    },
    {
      "table": "original_skills",
      "name": "original_skills_owner",
      "command": "*",
      "permissive": true,
      "roles": [
        "agentstudio_api"
      ],
      "using": "owner_user_id=agentstudio.actor_id() AND session_user::text='agentstudio_stage_login'",
      "check": "owner_user_id=agentstudio.actor_id() AND session_user::text='agentstudio_stage_login'",
      "functions": [
        "agentstudio.actor_id"
      ]
    },
    {
      "table": "original_skill_versions",
      "name": "original_skill_versions_owner",
      "command": "*",
      "permissive": true,
      "roles": [
        "agentstudio_api"
      ],
      "using": "owner_user_id=agentstudio.actor_id() AND session_user::text='agentstudio_stage_login'",
      "check": "owner_user_id=agentstudio.actor_id() AND session_user::text='agentstudio_stage_login'",
      "functions": [
        "agentstudio.actor_id"
      ]
    },
    {
      "table": "original_skill_reviews",
      "name": "original_skill_reviews_owner",
      "command": "*",
      "permissive": true,
      "roles": [
        "agentstudio_api"
      ],
      "using": "owner_user_id=agentstudio.actor_id() AND session_user::text='agentstudio_stage_login'",
      "check": "owner_user_id=agentstudio.actor_id() AND session_user::text='agentstudio_stage_login'",
      "functions": [
        "agentstudio.actor_id"
      ]
    },
    {
      "table": "original_role_specs",
      "name": "original_role_specs_owner",
      "command": "*",
      "permissive": true,
      "roles": [
        "agentstudio_api"
      ],
      "using": "owner_user_id=agentstudio.actor_id() AND session_user::text='agentstudio_stage_login'",
      "check": "owner_user_id=agentstudio.actor_id() AND session_user::text='agentstudio_stage_login'",
      "functions": [
        "agentstudio.actor_id"
      ]
    },
    {
      "table": "original_role_extensions",
      "name": "original_role_extensions_owner",
      "command": "*",
      "permissive": true,
      "roles": [
        "agentstudio_api"
      ],
      "using": "owner_user_id=agentstudio.actor_id() AND session_user::text='agentstudio_stage_login'",
      "check": "owner_user_id=agentstudio.actor_id() AND session_user::text='agentstudio_stage_login'",
      "functions": [
        "agentstudio.actor_id"
      ]
    },
    {
      "table": "original_role_run_pins",
      "name": "original_role_run_pins_owner",
      "command": "*",
      "permissive": true,
      "roles": [
        "agentstudio_api"
      ],
      "using": "owner_user_id=agentstudio.actor_id() AND session_user::text='agentstudio_stage_login'",
      "check": "owner_user_id=agentstudio.actor_id() AND session_user::text='agentstudio_stage_login'",
      "functions": [
        "agentstudio.actor_id"
      ]
    }
  ],
  "triggers": [
    {
      "name": "runtime_profile_immutable",
      "table": "agentstudio_roles.runtime_profile",
      "constraint": null,
      "constraint_table": null,
      "internal": false,
      "type": 27,
      "function": "agentstudio_roles.immutable",
      "safe": true
    },
    {
      "name": "original_skill_versions_immutable",
      "table": "agentstudio_roles.original_skill_versions",
      "constraint": null,
      "constraint_table": null,
      "internal": false,
      "type": 27,
      "function": "agentstudio_roles.immutable",
      "safe": true
    },
    {
      "name": "original_skill_reviews_immutable",
      "table": "agentstudio_roles.original_skill_reviews",
      "constraint": null,
      "constraint_table": null,
      "internal": false,
      "type": 27,
      "function": "agentstudio_roles.immutable",
      "safe": true
    },
    {
      "name": "original_role_specs_immutable",
      "table": "agentstudio_roles.original_role_specs",
      "constraint": null,
      "constraint_table": null,
      "internal": false,
      "type": 27,
      "function": "agentstudio_roles.immutable",
      "safe": true
    },
    {
      "name": "original_role_extensions_immutable",
      "table": "agentstudio_roles.original_role_extensions",
      "constraint": null,
      "constraint_table": null,
      "internal": false,
      "type": 27,
      "function": "agentstudio_roles.immutable",
      "safe": true
    },
    {
      "name": "original_role_run_pins_immutable",
      "table": "agentstudio_roles.original_role_run_pins",
      "constraint": null,
      "constraint_table": null,
      "internal": false,
      "type": 27,
      "function": "agentstudio_roles.immutable",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio_roles.original_skills",
      "constraint": "original_skills_fk0",
      "constraint_table": "agentstudio_roles.original_skills",
      "internal": true,
      "type": 5,
      "function": "pg_catalog.RI_FKey_check_ins",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio_roles.original_skills",
      "constraint": "original_skills_fk0",
      "constraint_table": "agentstudio_roles.original_skills",
      "internal": true,
      "type": 17,
      "function": "pg_catalog.RI_FKey_check_upd",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio.users",
      "constraint": "original_skills_fk0",
      "constraint_table": "agentstudio_roles.original_skills",
      "internal": true,
      "type": 9,
      "function": "pg_catalog.RI_FKey_noaction_del",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio.users",
      "constraint": "original_skills_fk0",
      "constraint_table": "agentstudio_roles.original_skills",
      "internal": true,
      "type": 17,
      "function": "pg_catalog.RI_FKey_noaction_upd",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio_roles.original_skill_versions",
      "constraint": "original_skill_versions_fk0",
      "constraint_table": "agentstudio_roles.original_skill_versions",
      "internal": true,
      "type": 5,
      "function": "pg_catalog.RI_FKey_check_ins",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio_roles.original_skill_versions",
      "constraint": "original_skill_versions_fk0",
      "constraint_table": "agentstudio_roles.original_skill_versions",
      "internal": true,
      "type": 17,
      "function": "pg_catalog.RI_FKey_check_upd",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio_roles.original_skills",
      "constraint": "original_skill_versions_fk0",
      "constraint_table": "agentstudio_roles.original_skill_versions",
      "internal": true,
      "type": 9,
      "function": "pg_catalog.RI_FKey_noaction_del",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio_roles.original_skills",
      "constraint": "original_skill_versions_fk0",
      "constraint_table": "agentstudio_roles.original_skill_versions",
      "internal": true,
      "type": 17,
      "function": "pg_catalog.RI_FKey_noaction_upd",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio_roles.original_skill_reviews",
      "constraint": "original_skill_reviews_fk0",
      "constraint_table": "agentstudio_roles.original_skill_reviews",
      "internal": true,
      "type": 5,
      "function": "pg_catalog.RI_FKey_check_ins",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio_roles.original_skill_reviews",
      "constraint": "original_skill_reviews_fk0",
      "constraint_table": "agentstudio_roles.original_skill_reviews",
      "internal": true,
      "type": 17,
      "function": "pg_catalog.RI_FKey_check_upd",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio_roles.original_skill_versions",
      "constraint": "original_skill_reviews_fk0",
      "constraint_table": "agentstudio_roles.original_skill_reviews",
      "internal": true,
      "type": 9,
      "function": "pg_catalog.RI_FKey_noaction_del",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio_roles.original_skill_versions",
      "constraint": "original_skill_reviews_fk0",
      "constraint_table": "agentstudio_roles.original_skill_reviews",
      "internal": true,
      "type": 17,
      "function": "pg_catalog.RI_FKey_noaction_upd",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio_roles.original_role_specs",
      "constraint": "original_role_specs_fk0",
      "constraint_table": "agentstudio_roles.original_role_specs",
      "internal": true,
      "type": 5,
      "function": "pg_catalog.RI_FKey_check_ins",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio_roles.original_role_specs",
      "constraint": "original_role_specs_fk0",
      "constraint_table": "agentstudio_roles.original_role_specs",
      "internal": true,
      "type": 17,
      "function": "pg_catalog.RI_FKey_check_upd",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio.agent_specs",
      "constraint": "original_role_specs_fk0",
      "constraint_table": "agentstudio_roles.original_role_specs",
      "internal": true,
      "type": 9,
      "function": "pg_catalog.RI_FKey_noaction_del",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio.agent_specs",
      "constraint": "original_role_specs_fk0",
      "constraint_table": "agentstudio_roles.original_role_specs",
      "internal": true,
      "type": 17,
      "function": "pg_catalog.RI_FKey_noaction_upd",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio_roles.original_role_extensions",
      "constraint": "original_role_extensions_fk0",
      "constraint_table": "agentstudio_roles.original_role_extensions",
      "internal": true,
      "type": 5,
      "function": "pg_catalog.RI_FKey_check_ins",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio_roles.original_role_extensions",
      "constraint": "original_role_extensions_fk0",
      "constraint_table": "agentstudio_roles.original_role_extensions",
      "internal": true,
      "type": 17,
      "function": "pg_catalog.RI_FKey_check_upd",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio_roles.original_role_specs",
      "constraint": "original_role_extensions_fk0",
      "constraint_table": "agentstudio_roles.original_role_extensions",
      "internal": true,
      "type": 9,
      "function": "pg_catalog.RI_FKey_noaction_del",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio_roles.original_role_specs",
      "constraint": "original_role_extensions_fk0",
      "constraint_table": "agentstudio_roles.original_role_extensions",
      "internal": true,
      "type": 17,
      "function": "pg_catalog.RI_FKey_noaction_upd",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio_roles.original_role_run_pins",
      "constraint": "original_role_run_pins_fk0",
      "constraint_table": "agentstudio_roles.original_role_run_pins",
      "internal": true,
      "type": 5,
      "function": "pg_catalog.RI_FKey_check_ins",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio_roles.original_role_run_pins",
      "constraint": "original_role_run_pins_fk0",
      "constraint_table": "agentstudio_roles.original_role_run_pins",
      "internal": true,
      "type": 17,
      "function": "pg_catalog.RI_FKey_check_upd",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio.runs",
      "constraint": "original_role_run_pins_fk0",
      "constraint_table": "agentstudio_roles.original_role_run_pins",
      "internal": true,
      "type": 9,
      "function": "pg_catalog.RI_FKey_noaction_del",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio.runs",
      "constraint": "original_role_run_pins_fk0",
      "constraint_table": "agentstudio_roles.original_role_run_pins",
      "internal": true,
      "type": 17,
      "function": "pg_catalog.RI_FKey_noaction_upd",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio_roles.original_role_run_pins",
      "constraint": "original_role_run_pins_fk1",
      "constraint_table": "agentstudio_roles.original_role_run_pins",
      "internal": true,
      "type": 5,
      "function": "pg_catalog.RI_FKey_check_ins",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio_roles.original_role_run_pins",
      "constraint": "original_role_run_pins_fk1",
      "constraint_table": "agentstudio_roles.original_role_run_pins",
      "internal": true,
      "type": 17,
      "function": "pg_catalog.RI_FKey_check_upd",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio_roles.original_role_specs",
      "constraint": "original_role_run_pins_fk1",
      "constraint_table": "agentstudio_roles.original_role_run_pins",
      "internal": true,
      "type": 9,
      "function": "pg_catalog.RI_FKey_noaction_del",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio_roles.original_role_specs",
      "constraint": "original_role_run_pins_fk1",
      "constraint_table": "agentstudio_roles.original_role_run_pins",
      "internal": true,
      "type": 17,
      "function": "pg_catalog.RI_FKey_noaction_upd",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio_roles.original_role_run_pins",
      "constraint": "original_role_run_pins_fk2",
      "constraint_table": "agentstudio_roles.original_role_run_pins",
      "internal": true,
      "type": 5,
      "function": "pg_catalog.RI_FKey_check_ins",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio_roles.original_role_run_pins",
      "constraint": "original_role_run_pins_fk2",
      "constraint_table": "agentstudio_roles.original_role_run_pins",
      "internal": true,
      "type": 17,
      "function": "pg_catalog.RI_FKey_check_upd",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio_roles.original_role_extensions",
      "constraint": "original_role_run_pins_fk2",
      "constraint_table": "agentstudio_roles.original_role_run_pins",
      "internal": true,
      "type": 9,
      "function": "pg_catalog.RI_FKey_noaction_del",
      "safe": true
    },
    {
      "name": null,
      "table": "agentstudio_roles.original_role_extensions",
      "constraint": "original_role_run_pins_fk2",
      "constraint_table": "agentstudio_roles.original_role_run_pins",
      "internal": true,
      "type": 17,
      "function": "pg_catalog.RI_FKey_noaction_upd",
      "safe": true
    }
  ],
  "types": [
    {
      "name": "runtime_profile",
      "owner": "postgres",
      "kind": "c",
      "category": "C",
      "relation": "runtime_profile",
      "element": null,
      "safe": true
    },
    {
      "name": "_runtime_profile",
      "owner": "postgres",
      "kind": "b",
      "category": "A",
      "relation": null,
      "element": "runtime_profile",
      "safe": true
    },
    {
      "name": "original_skills",
      "owner": "postgres",
      "kind": "c",
      "category": "C",
      "relation": "original_skills",
      "element": null,
      "safe": true
    },
    {
      "name": "_original_skills",
      "owner": "postgres",
      "kind": "b",
      "category": "A",
      "relation": null,
      "element": "original_skills",
      "safe": true
    },
    {
      "name": "original_skill_versions",
      "owner": "postgres",
      "kind": "c",
      "category": "C",
      "relation": "original_skill_versions",
      "element": null,
      "safe": true
    },
    {
      "name": "_original_skill_versions",
      "owner": "postgres",
      "kind": "b",
      "category": "A",
      "relation": null,
      "element": "original_skill_versions",
      "safe": true
    },
    {
      "name": "original_skill_reviews",
      "owner": "postgres",
      "kind": "c",
      "category": "C",
      "relation": "original_skill_reviews",
      "element": null,
      "safe": true
    },
    {
      "name": "_original_skill_reviews",
      "owner": "postgres",
      "kind": "b",
      "category": "A",
      "relation": null,
      "element": "original_skill_reviews",
      "safe": true
    },
    {
      "name": "original_role_specs",
      "owner": "postgres",
      "kind": "c",
      "category": "C",
      "relation": "original_role_specs",
      "element": null,
      "safe": true
    },
    {
      "name": "_original_role_specs",
      "owner": "postgres",
      "kind": "b",
      "category": "A",
      "relation": null,
      "element": "original_role_specs",
      "safe": true
    },
    {
      "name": "original_role_extensions",
      "owner": "postgres",
      "kind": "c",
      "category": "C",
      "relation": "original_role_extensions",
      "element": null,
      "safe": true
    },
    {
      "name": "_original_role_extensions",
      "owner": "postgres",
      "kind": "b",
      "category": "A",
      "relation": null,
      "element": "original_role_extensions",
      "safe": true
    },
    {
      "name": "original_role_run_pins",
      "owner": "postgres",
      "kind": "c",
      "category": "C",
      "relation": "original_role_run_pins",
      "element": null,
      "safe": true
    },
    {
      "name": "_original_role_run_pins",
      "owner": "postgres",
      "kind": "b",
      "category": "A",
      "relation": null,
      "element": "original_role_run_pins",
      "safe": true
    }
  ],
  "functions": [
    {
      "name": "immutable",
      "args": "",
      "returns": "trigger",
      "owner": "postgres",
      "source": "\nBEGIN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='original_role_record_immutable'; END\n",
      "definer": false,
      "safe": true,
      "acl": [
        {
          "grantor": "postgres",
          "grantee": "postgres",
          "right": "EXECUTE",
          "grantable": false
        }
      ],
      "effective": [
        {
          "role": "postgres",
          "execute": true,
          "grantable": true
        },
        {
          "role": "agentstudio_api",
          "execute": false,
          "grantable": false
        },
        {
          "role": "agentstudio_worker",
          "execute": false,
          "grantable": false
        },
        {
          "role": "agentstudio_stage_login",
          "execute": false,
          "grantable": false
        },
        {
          "role": "agentstudio_stage_worker",
          "execute": false,
          "grantable": false
        },
        {
          "role": "agentstudio_native_auth",
          "execute": false,
          "grantable": false
        },
        {
          "role": "agentstudio_model_broker",
          "execute": false,
          "grantable": false
        },
        {
          "role": "agentstudio_bound_dispatch",
          "execute": false,
          "grantable": false
        },
        {
          "role": "pg_read_all_data",
          "execute": false,
          "grantable": false
        },
        {
          "role": "pg_write_all_data",
          "execute": false,
          "grantable": false
        },
        {
          "role": "pg_maintain",
          "execute": false,
          "grantable": false
        }
      ]
    },
    {
      "name": "worker_pin",
      "args": "uuid, uuid, uuid, bigint, text",
      "returns": "jsonb",
      "owner": "postgres",
      "source": "\nDECLARE result jsonb; admitted boolean; owner_id uuid;\nBEGIN\n IF session_user <> 'agentstudio_stage_worker' THEN RAISE EXCEPTION 'original_role_worker_login_required'; END IF;\n SELECT j.owner_user_id INTO owner_id FROM agentstudio.jobs j JOIN agentstudio.runs r ON r.id=j.run_id AND r.owner_user_id=j.owner_user_id JOIN agentstudio.users u ON u.id=j.owner_user_id\n WHERE j.run_id=$1 AND j.id=$2 AND j.lease_token=$3 AND j.lease_version=$4 AND j.lease_owner=$5 AND j.status='leased' AND j.kind='run_tick' AND j.lease_until>clock_timestamp() AND j.payload->>'phase'='agent_native_v2' AND r.kind='agent' AND r.status IN('queued','running','paused') AND u.status='active' AND j.payload->>'graph_sha256'=r.checkpoint->'machine'->>'graph_sha256' FOR SHARE OF j,r,u;\n IF owner_id IS NULL THEN RAISE EXCEPTION 'original_role_worker_lease_denied'; END IF;\n SELECT EXISTS(SELECT 1 FROM agentstudio_roles.original_role_run_pins WHERE owner_user_id=owner_id AND run_id=$1) INTO admitted;\n IF NOT admitted THEN\n  IF EXISTS(SELECT 1 FROM agentstudio.runs WHERE id=$1 AND checkpoint->'role_run' IS NOT NULL) THEN RAISE EXCEPTION 'original_role_worker_pin_missing'; END IF;\n  RETURN NULL;\n END IF;\n SELECT jsonb_build_object('payload',p.payload,'payload_sha256',p.payload_sha256,'spec',h.spec,'spec_sha256',h.spec_sha256) INTO result\n FROM agentstudio.jobs j JOIN agentstudio.runs r ON r.id=j.run_id AND r.owner_user_id=j.owner_user_id\n JOIN agentstudio_roles.original_role_run_pins p ON p.run_id=r.id AND p.owner_user_id=r.owner_user_id\n JOIN agentstudio_roles.original_role_specs h ON h.owner_user_id=p.owner_user_id AND h.spec_id=p.spec_id AND h.spec_revision=p.spec_revision\n JOIN agentstudio.users u ON u.id=j.owner_user_id\n WHERE j.run_id=$1 AND j.id=$2 AND j.lease_token=$3 AND j.lease_version=$4 AND j.lease_owner=$5\n AND j.status='leased' AND j.kind='run_tick' AND j.lease_until>clock_timestamp()\n AND j.payload->>'phase'='agent_native_v2' AND r.kind='agent' AND r.status IN('queued','running','paused') AND u.status='active'\n AND r.agent_spec_id=p.spec_id AND j.payload->>'agent_spec_id'=p.spec_id::text\n AND (j.payload->>'spec_revision')::bigint=p.spec_revision\n AND j.payload->>'graph_sha256'=r.checkpoint->'machine'->>'graph_sha256'\n AND r.checkpoint->'role_run'->>'profile'='original-roles-v2'\n AND r.checkpoint->'role_run'->>'run_id'=r.id::text\n AND r.checkpoint->'role_run'->>'payload_sha256'=p.payload_sha256\n FOR SHARE OF j,r,p,h,u;\n IF result IS NULL THEN RAISE EXCEPTION 'original_role_worker_lease_denied'; END IF;\n RETURN result;\nEND\n",
      "definer": true,
      "safe": true,
      "acl": [
        {
          "grantor": "postgres",
          "grantee": "postgres",
          "right": "EXECUTE",
          "grantable": false
        },
        {
          "grantor": "postgres",
          "grantee": "agentstudio_worker",
          "right": "EXECUTE",
          "grantable": false
        }
      ],
      "effective": [
        {
          "role": "postgres",
          "execute": true,
          "grantable": true
        },
        {
          "role": "agentstudio_api",
          "execute": false,
          "grantable": false
        },
        {
          "role": "agentstudio_worker",
          "execute": true,
          "grantable": false
        },
        {
          "role": "agentstudio_stage_login",
          "execute": false,
          "grantable": false
        },
        {
          "role": "agentstudio_stage_worker",
          "execute": false,
          "grantable": false
        },
        {
          "role": "agentstudio_native_auth",
          "execute": false,
          "grantable": false
        },
        {
          "role": "agentstudio_model_broker",
          "execute": false,
          "grantable": false
        },
        {
          "role": "agentstudio_bound_dispatch",
          "execute": false,
          "grantable": false
        },
        {
          "role": "pg_read_all_data",
          "execute": false,
          "grantable": false
        },
        {
          "role": "pg_write_all_data",
          "execute": false,
          "grantable": false
        },
        {
          "role": "pg_maintain",
          "execute": false,
          "grantable": false
        }
      ]
    }
  ],
  "acl": [
    {
      "table": "runtime_profile",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "SELECT",
      "grantable": false
    },
    {
      "table": "runtime_profile",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "INSERT",
      "grantable": false
    },
    {
      "table": "runtime_profile",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "UPDATE",
      "grantable": false
    },
    {
      "table": "runtime_profile",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "DELETE",
      "grantable": false
    },
    {
      "table": "runtime_profile",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "TRUNCATE",
      "grantable": false
    },
    {
      "table": "runtime_profile",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "REFERENCES",
      "grantable": false
    },
    {
      "table": "runtime_profile",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "TRIGGER",
      "grantable": false
    },
    {
      "table": "runtime_profile",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "MAINTAIN",
      "grantable": false
    },
    {
      "table": "runtime_profile",
      "grantor": "postgres",
      "grantee": "agentstudio_api",
      "right": "SELECT",
      "grantable": false
    },
    {
      "table": "original_skills",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "SELECT",
      "grantable": false
    },
    {
      "table": "original_skills",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "INSERT",
      "grantable": false
    },
    {
      "table": "original_skills",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "UPDATE",
      "grantable": false
    },
    {
      "table": "original_skills",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "DELETE",
      "grantable": false
    },
    {
      "table": "original_skills",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "TRUNCATE",
      "grantable": false
    },
    {
      "table": "original_skills",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "REFERENCES",
      "grantable": false
    },
    {
      "table": "original_skills",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "TRIGGER",
      "grantable": false
    },
    {
      "table": "original_skills",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "MAINTAIN",
      "grantable": false
    },
    {
      "table": "original_skills",
      "grantor": "postgres",
      "grantee": "agentstudio_api",
      "right": "SELECT",
      "grantable": false
    },
    {
      "table": "original_skills",
      "grantor": "postgres",
      "grantee": "agentstudio_api",
      "right": "INSERT",
      "grantable": false
    },
    {
      "table": "original_skill_versions",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "SELECT",
      "grantable": false
    },
    {
      "table": "original_skill_versions",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "INSERT",
      "grantable": false
    },
    {
      "table": "original_skill_versions",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "UPDATE",
      "grantable": false
    },
    {
      "table": "original_skill_versions",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "DELETE",
      "grantable": false
    },
    {
      "table": "original_skill_versions",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "TRUNCATE",
      "grantable": false
    },
    {
      "table": "original_skill_versions",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "REFERENCES",
      "grantable": false
    },
    {
      "table": "original_skill_versions",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "TRIGGER",
      "grantable": false
    },
    {
      "table": "original_skill_versions",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "MAINTAIN",
      "grantable": false
    },
    {
      "table": "original_skill_versions",
      "grantor": "postgres",
      "grantee": "agentstudio_api",
      "right": "SELECT",
      "grantable": false
    },
    {
      "table": "original_skill_versions",
      "grantor": "postgres",
      "grantee": "agentstudio_api",
      "right": "INSERT",
      "grantable": false
    },
    {
      "table": "original_skill_reviews",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "SELECT",
      "grantable": false
    },
    {
      "table": "original_skill_reviews",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "INSERT",
      "grantable": false
    },
    {
      "table": "original_skill_reviews",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "UPDATE",
      "grantable": false
    },
    {
      "table": "original_skill_reviews",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "DELETE",
      "grantable": false
    },
    {
      "table": "original_skill_reviews",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "TRUNCATE",
      "grantable": false
    },
    {
      "table": "original_skill_reviews",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "REFERENCES",
      "grantable": false
    },
    {
      "table": "original_skill_reviews",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "TRIGGER",
      "grantable": false
    },
    {
      "table": "original_skill_reviews",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "MAINTAIN",
      "grantable": false
    },
    {
      "table": "original_skill_reviews",
      "grantor": "postgres",
      "grantee": "agentstudio_api",
      "right": "SELECT",
      "grantable": false
    },
    {
      "table": "original_skill_reviews",
      "grantor": "postgres",
      "grantee": "agentstudio_api",
      "right": "INSERT",
      "grantable": false
    },
    {
      "table": "original_role_specs",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "SELECT",
      "grantable": false
    },
    {
      "table": "original_role_specs",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "INSERT",
      "grantable": false
    },
    {
      "table": "original_role_specs",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "UPDATE",
      "grantable": false
    },
    {
      "table": "original_role_specs",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "DELETE",
      "grantable": false
    },
    {
      "table": "original_role_specs",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "TRUNCATE",
      "grantable": false
    },
    {
      "table": "original_role_specs",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "REFERENCES",
      "grantable": false
    },
    {
      "table": "original_role_specs",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "TRIGGER",
      "grantable": false
    },
    {
      "table": "original_role_specs",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "MAINTAIN",
      "grantable": false
    },
    {
      "table": "original_role_specs",
      "grantor": "postgres",
      "grantee": "agentstudio_api",
      "right": "SELECT",
      "grantable": false
    },
    {
      "table": "original_role_specs",
      "grantor": "postgres",
      "grantee": "agentstudio_api",
      "right": "INSERT",
      "grantable": false
    },
    {
      "table": "original_role_extensions",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "SELECT",
      "grantable": false
    },
    {
      "table": "original_role_extensions",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "INSERT",
      "grantable": false
    },
    {
      "table": "original_role_extensions",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "UPDATE",
      "grantable": false
    },
    {
      "table": "original_role_extensions",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "DELETE",
      "grantable": false
    },
    {
      "table": "original_role_extensions",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "TRUNCATE",
      "grantable": false
    },
    {
      "table": "original_role_extensions",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "REFERENCES",
      "grantable": false
    },
    {
      "table": "original_role_extensions",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "TRIGGER",
      "grantable": false
    },
    {
      "table": "original_role_extensions",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "MAINTAIN",
      "grantable": false
    },
    {
      "table": "original_role_extensions",
      "grantor": "postgres",
      "grantee": "agentstudio_api",
      "right": "SELECT",
      "grantable": false
    },
    {
      "table": "original_role_extensions",
      "grantor": "postgres",
      "grantee": "agentstudio_api",
      "right": "INSERT",
      "grantable": false
    },
    {
      "table": "original_role_run_pins",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "SELECT",
      "grantable": false
    },
    {
      "table": "original_role_run_pins",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "INSERT",
      "grantable": false
    },
    {
      "table": "original_role_run_pins",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "UPDATE",
      "grantable": false
    },
    {
      "table": "original_role_run_pins",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "DELETE",
      "grantable": false
    },
    {
      "table": "original_role_run_pins",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "TRUNCATE",
      "grantable": false
    },
    {
      "table": "original_role_run_pins",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "REFERENCES",
      "grantable": false
    },
    {
      "table": "original_role_run_pins",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "TRIGGER",
      "grantable": false
    },
    {
      "table": "original_role_run_pins",
      "grantor": "postgres",
      "grantee": "postgres",
      "right": "MAINTAIN",
      "grantable": false
    },
    {
      "table": "original_role_run_pins",
      "grantor": "postgres",
      "grantee": "agentstudio_api",
      "right": "SELECT",
      "grantable": false
    },
    {
      "table": "original_role_run_pins",
      "grantor": "postgres",
      "grantee": "agentstudio_api",
      "right": "INSERT",
      "grantable": false
    }
  ],
  "effective": [
    {
      "table": "runtime_profile",
      "role": "postgres",
      "select": true,
      "insert": true,
      "update": true,
      "delete": true,
      "truncate": true,
      "references": true,
      "trigger": true,
      "maintain": true,
      "column_update": true
    },
    {
      "table": "runtime_profile",
      "role": "agentstudio_api",
      "select": true,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "runtime_profile",
      "role": "agentstudio_worker",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "runtime_profile",
      "role": "agentstudio_stage_login",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "runtime_profile",
      "role": "agentstudio_stage_worker",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "runtime_profile",
      "role": "agentstudio_native_auth",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "runtime_profile",
      "role": "agentstudio_model_broker",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "runtime_profile",
      "role": "agentstudio_bound_dispatch",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "runtime_profile",
      "role": "pg_read_all_data",
      "select": true,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "runtime_profile",
      "role": "pg_write_all_data",
      "select": false,
      "insert": true,
      "update": true,
      "delete": true,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": true
    },
    {
      "table": "runtime_profile",
      "role": "pg_maintain",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": true,
      "column_update": false
    },
    {
      "table": "original_skills",
      "role": "postgres",
      "select": true,
      "insert": true,
      "update": true,
      "delete": true,
      "truncate": true,
      "references": true,
      "trigger": true,
      "maintain": true,
      "column_update": true
    },
    {
      "table": "original_skills",
      "role": "agentstudio_api",
      "select": true,
      "insert": true,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": true
    },
    {
      "table": "original_skills",
      "role": "agentstudio_worker",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_skills",
      "role": "agentstudio_stage_login",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_skills",
      "role": "agentstudio_stage_worker",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_skills",
      "role": "agentstudio_native_auth",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_skills",
      "role": "agentstudio_model_broker",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_skills",
      "role": "agentstudio_bound_dispatch",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_skills",
      "role": "pg_read_all_data",
      "select": true,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_skills",
      "role": "pg_write_all_data",
      "select": false,
      "insert": true,
      "update": true,
      "delete": true,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": true
    },
    {
      "table": "original_skills",
      "role": "pg_maintain",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": true,
      "column_update": false
    },
    {
      "table": "original_skill_versions",
      "role": "postgres",
      "select": true,
      "insert": true,
      "update": true,
      "delete": true,
      "truncate": true,
      "references": true,
      "trigger": true,
      "maintain": true,
      "column_update": true
    },
    {
      "table": "original_skill_versions",
      "role": "agentstudio_api",
      "select": true,
      "insert": true,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_skill_versions",
      "role": "agentstudio_worker",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_skill_versions",
      "role": "agentstudio_stage_login",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_skill_versions",
      "role": "agentstudio_stage_worker",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_skill_versions",
      "role": "agentstudio_native_auth",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_skill_versions",
      "role": "agentstudio_model_broker",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_skill_versions",
      "role": "agentstudio_bound_dispatch",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_skill_versions",
      "role": "pg_read_all_data",
      "select": true,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_skill_versions",
      "role": "pg_write_all_data",
      "select": false,
      "insert": true,
      "update": true,
      "delete": true,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": true
    },
    {
      "table": "original_skill_versions",
      "role": "pg_maintain",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": true,
      "column_update": false
    },
    {
      "table": "original_skill_reviews",
      "role": "postgres",
      "select": true,
      "insert": true,
      "update": true,
      "delete": true,
      "truncate": true,
      "references": true,
      "trigger": true,
      "maintain": true,
      "column_update": true
    },
    {
      "table": "original_skill_reviews",
      "role": "agentstudio_api",
      "select": true,
      "insert": true,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_skill_reviews",
      "role": "agentstudio_worker",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_skill_reviews",
      "role": "agentstudio_stage_login",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_skill_reviews",
      "role": "agentstudio_stage_worker",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_skill_reviews",
      "role": "agentstudio_native_auth",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_skill_reviews",
      "role": "agentstudio_model_broker",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_skill_reviews",
      "role": "agentstudio_bound_dispatch",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_skill_reviews",
      "role": "pg_read_all_data",
      "select": true,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_skill_reviews",
      "role": "pg_write_all_data",
      "select": false,
      "insert": true,
      "update": true,
      "delete": true,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": true
    },
    {
      "table": "original_skill_reviews",
      "role": "pg_maintain",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": true,
      "column_update": false
    },
    {
      "table": "original_role_specs",
      "role": "postgres",
      "select": true,
      "insert": true,
      "update": true,
      "delete": true,
      "truncate": true,
      "references": true,
      "trigger": true,
      "maintain": true,
      "column_update": true
    },
    {
      "table": "original_role_specs",
      "role": "agentstudio_api",
      "select": true,
      "insert": true,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_role_specs",
      "role": "agentstudio_worker",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_role_specs",
      "role": "agentstudio_stage_login",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_role_specs",
      "role": "agentstudio_stage_worker",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_role_specs",
      "role": "agentstudio_native_auth",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_role_specs",
      "role": "agentstudio_model_broker",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_role_specs",
      "role": "agentstudio_bound_dispatch",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_role_specs",
      "role": "pg_read_all_data",
      "select": true,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_role_specs",
      "role": "pg_write_all_data",
      "select": false,
      "insert": true,
      "update": true,
      "delete": true,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": true
    },
    {
      "table": "original_role_specs",
      "role": "pg_maintain",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": true,
      "column_update": false
    },
    {
      "table": "original_role_extensions",
      "role": "postgres",
      "select": true,
      "insert": true,
      "update": true,
      "delete": true,
      "truncate": true,
      "references": true,
      "trigger": true,
      "maintain": true,
      "column_update": true
    },
    {
      "table": "original_role_extensions",
      "role": "agentstudio_api",
      "select": true,
      "insert": true,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_role_extensions",
      "role": "agentstudio_worker",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_role_extensions",
      "role": "agentstudio_stage_login",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_role_extensions",
      "role": "agentstudio_stage_worker",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_role_extensions",
      "role": "agentstudio_native_auth",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_role_extensions",
      "role": "agentstudio_model_broker",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_role_extensions",
      "role": "agentstudio_bound_dispatch",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_role_extensions",
      "role": "pg_read_all_data",
      "select": true,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_role_extensions",
      "role": "pg_write_all_data",
      "select": false,
      "insert": true,
      "update": true,
      "delete": true,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": true
    },
    {
      "table": "original_role_extensions",
      "role": "pg_maintain",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": true,
      "column_update": false
    },
    {
      "table": "original_role_run_pins",
      "role": "postgres",
      "select": true,
      "insert": true,
      "update": true,
      "delete": true,
      "truncate": true,
      "references": true,
      "trigger": true,
      "maintain": true,
      "column_update": true
    },
    {
      "table": "original_role_run_pins",
      "role": "agentstudio_api",
      "select": true,
      "insert": true,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_role_run_pins",
      "role": "agentstudio_worker",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_role_run_pins",
      "role": "agentstudio_stage_login",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_role_run_pins",
      "role": "agentstudio_stage_worker",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_role_run_pins",
      "role": "agentstudio_native_auth",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_role_run_pins",
      "role": "agentstudio_model_broker",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_role_run_pins",
      "role": "agentstudio_bound_dispatch",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_role_run_pins",
      "role": "pg_read_all_data",
      "select": true,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": false
    },
    {
      "table": "original_role_run_pins",
      "role": "pg_write_all_data",
      "select": false,
      "insert": true,
      "update": true,
      "delete": true,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": false,
      "column_update": true
    },
    {
      "table": "original_role_run_pins",
      "role": "pg_maintain",
      "select": false,
      "insert": false,
      "update": false,
      "delete": false,
      "truncate": false,
      "references": false,
      "trigger": false,
      "maintain": true,
      "column_update": false
    }
  ],
  "violations": {
    "default_acl": 0,
    "event_triggers": 0,
    "extensions": 0,
    "other_objects": 0
  }
})}
