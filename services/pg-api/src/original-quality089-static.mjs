const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v)}return v}
export const originalQuality089Static=freeze({
  "profile": "original-quality089",
  "migration": "pg_v9_089",
  "description": "original employee quality revision v1; fresh isolated only",
  "owner": "agentstudio_quality089",
  "functions": [
    {
      "name": "quality089_utf16_length",
      "args": "p_text text",
      "signature": "quality089_utf16_length(text)",
      "returns": "integer",
      "language": "sql",
      "volatility": "IMMUTABLE",
      "api": false,
      "source_sha256": "3c92099839a007a0651dc5b542b46098ab146ad17358a57c619b4f787b848a47"
    },
    {
      "name": "quality089_native_active",
      "args": "p_user uuid",
      "signature": "quality089_native_active(uuid)",
      "returns": "boolean",
      "language": "sql",
      "volatility": "STABLE",
      "api": false,
      "source_sha256": "3f52a2f7b7f043f5b2d00258f020a8e921efb53d7286603d8c2626d5f9464d0c"
    },
    {
      "name": "quality089_source_seal",
      "args": "p_id uuid,p_owner uuid,p_name text,p_revision bigint,p_spec jsonb",
      "signature": "quality089_source_seal(uuid,uuid,text,bigint,jsonb)",
      "returns": "text",
      "language": "sql",
      "volatility": "IMMUTABLE",
      "api": false,
      "source_sha256": "20f2acc5973d99b3e2f384ee886a7937e005851149e9e85b06e3ec5f8c9e2044"
    },
    {
      "name": "quality089_version_sha",
      "args": "p_version uuid",
      "signature": "quality089_version_sha(uuid)",
      "returns": "text",
      "language": "sql",
      "volatility": "VOLATILE",
      "api": false,
      "source_sha256": "51021fdc8779c5a6e598d10f6eae9543c9445beea7e9d71a0ff6e56cf24c3262"
    },
    {
      "name": "quality089_has_text",
      "args": "p_text text",
      "signature": "quality089_has_text(text)",
      "returns": "boolean",
      "language": "sql",
      "volatility": "IMMUTABLE",
      "api": false,
      "source_sha256": "50f24a373fb66d2626dc5c94fea386bf63410b2658a1be133f89718c59dd8ffe"
    },
    {
      "name": "quality089_rules_json",
      "args": "p_checks jsonb",
      "signature": "quality089_rules_json(jsonb)",
      "returns": "text",
      "language": "plpgsql",
      "volatility": "IMMUTABLE",
      "api": false,
      "source_sha256": "180174c4409a1450bc0266d88a65a3df2dbe7cf1f421239fce5f699012d89e2d"
    },
    {
      "name": "quality089_rules_sha",
      "args": "p_checks jsonb",
      "signature": "quality089_rules_sha(jsonb)",
      "returns": "text",
      "language": "sql",
      "volatility": "IMMUTABLE",
      "api": false,
      "source_sha256": "28e207f1c8acf4391c94e4fd2f2c9b357a4bb2407b55f0d4a6e4dd9ce8ce6212"
    },
    {
      "name": "quality089_request_sha",
      "args": "p_owner uuid,p_spec uuid,p_request uuid,p_revision bigint,p_source text,p_checks_sha text,p_checks jsonb",
      "signature": "quality089_request_sha(uuid,uuid,uuid,bigint,text,text,jsonb)",
      "returns": "text",
      "language": "sql",
      "volatility": "IMMUTABLE",
      "api": false,
      "source_sha256": "876d8c40466b12099dcd34122b71035933953858a5b00ecd228015a5a44609d5"
    },
    {
      "name": "quality089_revision_json",
      "args": "p_spec uuid,p_owner uuid,p_revision bigint",
      "signature": "quality089_revision_json(uuid,uuid,bigint)",
      "returns": "jsonb",
      "language": "sql",
      "volatility": "VOLATILE",
      "api": false,
      "source_sha256": "7e7a4c2850a8d81c776eae864105940cbe61a154f6214961a30effa28daf0d91"
    },
    {
      "name": "quality089_read",
      "args": "p_spec uuid,p_expected_employee uuid",
      "signature": "quality089_read(uuid,uuid)",
      "returns": "jsonb",
      "language": "plpgsql",
      "volatility": "VOLATILE",
      "api": true,
      "source_sha256": "b7a13fe8c8d52dd33b277095c8aa09a344836a8ccc0b1392e068e1a938a008e1"
    },
    {
      "name": "quality089_receipt",
      "args": "p_spec uuid,p_request uuid,p_expected_employee uuid",
      "signature": "quality089_receipt(uuid,uuid,uuid)",
      "returns": "jsonb",
      "language": "plpgsql",
      "volatility": "VOLATILE",
      "api": true,
      "source_sha256": "eb98608c75029d0a5a5982617bacb5ebf1f51c73b2788f99208a89c032ada337"
    },
    {
      "name": "quality089_spec_snapshot",
      "args": "",
      "signature": "quality089_spec_snapshot()",
      "returns": "trigger",
      "language": "plpgsql",
      "volatility": "VOLATILE",
      "api": false,
      "source_sha256": "8a8afb12e04c774135d244b33b7b81c5f573cfea7fd19bb32982998606ac8385"
    },
    {
      "name": "quality089_immutable",
      "args": "",
      "signature": "quality089_immutable()",
      "returns": "trigger",
      "language": "plpgsql",
      "volatility": "VOLATILE",
      "api": false,
      "source_sha256": "4cd1d0dd1083e3065b8ee1600435af46497352e06d0b91cff9044952d110fd92"
    },
    {
      "name": "quality089_intent_complete",
      "args": "",
      "signature": "quality089_intent_complete()",
      "returns": "trigger",
      "language": "plpgsql",
      "volatility": "VOLATILE",
      "api": false,
      "source_sha256": "e328dc344148278bc17de92f704f60c603e02580dd0d2be9c6384c955351d661"
    },
    {
      "name": "quality089_save",
      "args": "p_spec uuid,p_expected_employee uuid,p_request uuid,p_revision bigint,p_source text,p_checks_sha text,p_checks jsonb,p_request_sha text",
      "signature": "quality089_save(uuid,uuid,uuid,bigint,text,text,jsonb,text)",
      "returns": "jsonb",
      "language": "plpgsql",
      "volatility": "VOLATILE",
      "api": true,
      "source_sha256": "73bb6dea9d0f2513055d7620b87f2463d0d9d62784f3d756b22ebca1b2bf2c07"
    },
    {
      "name": "quality089_rules_pass",
      "args": "p_checks jsonb,p_output text",
      "signature": "quality089_rules_pass(jsonb,text)",
      "returns": "boolean",
      "language": "plpgsql",
      "volatility": "IMMUTABLE",
      "api": false,
      "source_sha256": "d0f1510e9c84bbec8b15062cc8d5b6e98a7b7177cedbd45e9590958abe99f8cd"
    },
    {
      "name": "quality089_run_passes",
      "args": "p_spec uuid,p_run uuid,p_source text,p_expected_employee uuid",
      "signature": "quality089_run_passes(uuid,uuid,text,uuid)",
      "returns": "boolean",
      "language": "plpgsql",
      "volatility": "VOLATILE",
      "api": true,
      "source_sha256": "c0f7b27b5d7f5d3e0e274be97d47f10f4e2a2b2c5add73b6102aa02efbd16448"
    },
    {
      "name": "quality089_publication_requirements",
      "args": "p_spec uuid,p_version uuid,p_expected_employee uuid",
      "signature": "quality089_publication_requirements(uuid,uuid,uuid)",
      "returns": "jsonb",
      "language": "plpgsql",
      "volatility": "VOLATILE",
      "api": true,
      "source_sha256": "dce4dad218f262d7687ad2e2b15242b08e21f7301bd2e44445565ee523560283"
    },
    {
      "name": "quality089_release_capture",
      "args": "",
      "signature": "quality089_release_capture()",
      "returns": "trigger",
      "language": "plpgsql",
      "volatility": "VOLATILE",
      "api": false,
      "source_sha256": "abe3ce75624f9b0456a551f500a0d6d2e29181e7a63a48928e43d098b74ecca2"
    },
    {
      "name": "quality089_acceptance_guard",
      "args": "",
      "signature": "quality089_acceptance_guard()",
      "returns": "trigger",
      "language": "plpgsql",
      "volatility": "VOLATILE",
      "api": false,
      "source_sha256": "ec97dcd09cf0ee02e02a85a70381e2071f7e8a3a928e27ddb0883df9a6d2020b"
    },
    {
      "name": "quality089_publish_guard",
      "args": "",
      "signature": "quality089_publish_guard()",
      "returns": "trigger",
      "language": "plpgsql",
      "volatility": "VOLATILE",
      "api": false,
      "source_sha256": "3727b3a6cb3cf5808b8f82b44db6e53587a5c6e96172ecf8f2d246fdbeb779d5"
    },
    {
      "name": "quality089_restore_stage",
      "args": "p_spec uuid,p_version uuid,p_revision bigint,p_source text,p_version_sha text,p_version_revision bigint,p_request uuid,p_request_sha text,p_expected_employee uuid",
      "signature": "quality089_restore_stage(uuid,uuid,bigint,text,text,bigint,uuid,text,uuid)",
      "returns": "void",
      "language": "plpgsql",
      "volatility": "VOLATILE",
      "api": true,
      "source_sha256": "e651bebfa099e2059fdceb658e028bdbd64302c729221a4a24405e7e73392c51"
    },
    {
      "name": "quality089_restore_receipt_guard",
      "args": "",
      "signature": "quality089_restore_receipt_guard()",
      "returns": "trigger",
      "language": "plpgsql",
      "volatility": "VOLATILE",
      "api": false,
      "source_sha256": "762aba26cebba2036ff981f2a7c777b0d404ec74c2db1434736522a430744025"
    }
  ],
  "tables": [
    {
      "name": "agent_quality089_revisions",
      "columns": [
        {
          "name": "spec_id",
          "type": "uuid",
          "required": true,
          "default": null
        },
        {
          "name": "owner_user_id",
          "type": "uuid",
          "required": true,
          "default": null
        },
        {
          "name": "spec_revision",
          "type": "bigint",
          "required": true,
          "default": null
        },
        {
          "name": "state",
          "type": "text",
          "required": true,
          "default": null
        },
        {
          "name": "checks",
          "type": "jsonb",
          "required": false,
          "default": null
        },
        {
          "name": "checks_sha256",
          "type": "text",
          "required": false,
          "default": null
        },
        {
          "name": "source_sha256",
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
          "name": "q089_revisions_spec_revision_ck",
          "type": "c",
          "keys": [
            "spec_revision"
          ],
          "expression": "spec_revision BETWEEN 1 AND 9007199254740990"
        },
        {
          "name": "q089_revisions_state_ck",
          "type": "c",
          "keys": [
            "state"
          ],
          "expression": "state IN('missing','configured')"
        },
        {
          "name": "q089_revisions_source_sha256_ck",
          "type": "c",
          "keys": [
            "source_sha256"
          ],
          "expression": "source_sha256~'^[a-f0-9]{64}$'"
        },
        {
          "name": "q089_revisions_pk",
          "type": "p",
          "keys": [
            "spec_id",
            "owner_user_id",
            "spec_revision"
          ]
        },
        {
          "name": "q089_revisions_fk1",
          "type": "f",
          "keys": [
            "spec_id",
            "owner_user_id"
          ],
          "target": "agentstudio.agent_specs",
          "target_keys": [
            "id",
            "owner_user_id"
          ]
        },
        {
          "name": "q089_revisions_ck1",
          "type": "c",
          "expression": "(state='missing' AND checks IS NULL AND checks_sha256 IS NULL) OR (state='configured' AND checks IS NOT NULL AND checks_sha256 IS NOT NULL AND checks_sha256~'^[a-f0-9]{64}$')",
          "keys": [
            "state",
            "checks",
            "checks_sha256"
          ]
        },
        {
          "name": "quality089_revision_rules",
          "type": "c",
          "expression": "state='missing' OR checks_sha256=agentstudio.quality089_rules_sha(checks)",
          "keys": [
            "state",
            "checks_sha256",
            "checks"
          ]
        },
        {
          "name": "agent_quality089_revisions_spec_id_not_null",
          "type": "n",
          "keys": [
            "spec_id"
          ]
        },
        {
          "name": "agent_quality089_revisions_owner_user_id_not_null",
          "type": "n",
          "keys": [
            "owner_user_id"
          ]
        },
        {
          "name": "agent_quality089_revisions_spec_revision_not_null",
          "type": "n",
          "keys": [
            "spec_revision"
          ]
        },
        {
          "name": "agent_quality089_revisions_state_not_null",
          "type": "n",
          "keys": [
            "state"
          ]
        },
        {
          "name": "agent_quality089_revisions_source_sha256_not_null",
          "type": "n",
          "keys": [
            "source_sha256"
          ]
        },
        {
          "name": "agent_quality089_revisions_created_at_not_null",
          "type": "n",
          "keys": [
            "created_at"
          ]
        }
      ]
    },
    {
      "name": "agent_quality089_receipts",
      "columns": [
        {
          "name": "owner_user_id",
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
          "name": "spec_id",
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
          "name": "before_revision",
          "type": "bigint",
          "required": true,
          "default": null
        },
        {
          "name": "after_revision",
          "type": "bigint",
          "required": true,
          "default": null
        },
        {
          "name": "audit_event_id",
          "type": "uuid",
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
          "name": "q089_receipts_request_sha256_ck",
          "type": "c",
          "keys": [
            "request_sha256"
          ],
          "expression": "request_sha256~'^[a-f0-9]{64}$'"
        },
        {
          "name": "q089_receipts_before_revision_ck",
          "type": "c",
          "keys": [
            "before_revision"
          ],
          "expression": "before_revision BETWEEN 1 AND 9007199254740989"
        },
        {
          "name": "q089_receipts_after_revision_ck",
          "type": "c",
          "keys": [
            "after_revision",
            "before_revision"
          ],
          "expression": "after_revision=before_revision+1"
        },
        {
          "name": "q089_receipts_audit_event_id_fk",
          "type": "f",
          "keys": [
            "audit_event_id"
          ],
          "target": "agentstudio.audit_events",
          "target_keys": [
            "id"
          ]
        },
        {
          "name": "q089_receipts_pk",
          "type": "p",
          "keys": [
            "owner_user_id",
            "request_id"
          ]
        },
        {
          "name": "q089_receipts_fk1",
          "type": "f",
          "keys": [
            "spec_id",
            "owner_user_id",
            "after_revision"
          ],
          "target": "agentstudio.agent_quality089_revisions",
          "target_keys": [
            "spec_id",
            "owner_user_id",
            "spec_revision"
          ]
        },
        {
          "name": "agent_quality089_receipts_owner_user_id_not_null",
          "type": "n",
          "keys": [
            "owner_user_id"
          ]
        },
        {
          "name": "agent_quality089_receipts_request_id_not_null",
          "type": "n",
          "keys": [
            "request_id"
          ]
        },
        {
          "name": "agent_quality089_receipts_spec_id_not_null",
          "type": "n",
          "keys": [
            "spec_id"
          ]
        },
        {
          "name": "agent_quality089_receipts_request_sha256_not_null",
          "type": "n",
          "keys": [
            "request_sha256"
          ]
        },
        {
          "name": "agent_quality089_receipts_before_revision_not_null",
          "type": "n",
          "keys": [
            "before_revision"
          ]
        },
        {
          "name": "agent_quality089_receipts_after_revision_not_null",
          "type": "n",
          "keys": [
            "after_revision"
          ]
        },
        {
          "name": "agent_quality089_receipts_audit_event_id_not_null",
          "type": "n",
          "keys": [
            "audit_event_id"
          ]
        },
        {
          "name": "agent_quality089_receipts_created_at_not_null",
          "type": "n",
          "keys": [
            "created_at"
          ]
        }
      ]
    },
    {
      "name": "agent_quality089_versions",
      "columns": [
        {
          "name": "version_id",
          "type": "uuid",
          "required": true,
          "default": null
        },
        {
          "name": "owner_user_id",
          "type": "uuid",
          "required": true,
          "default": null
        },
        {
          "name": "spec_id",
          "type": "uuid",
          "required": true,
          "default": null
        },
        {
          "name": "spec_revision",
          "type": "bigint",
          "required": true,
          "default": null
        }
      ],
      "constraints": [
        {
          "name": "q089_versions_pk",
          "type": "p",
          "keys": [
            "version_id"
          ]
        },
        {
          "name": "q089_versions_fk1",
          "type": "f",
          "keys": [
            "version_id",
            "spec_id",
            "owner_user_id"
          ],
          "target": "agentstudio.agent_release_versions",
          "target_keys": [
            "id",
            "spec_id",
            "owner_user_id"
          ]
        },
        {
          "name": "q089_versions_fk2",
          "type": "f",
          "keys": [
            "spec_id",
            "owner_user_id",
            "spec_revision"
          ],
          "target": "agentstudio.agent_quality089_revisions",
          "target_keys": [
            "spec_id",
            "owner_user_id",
            "spec_revision"
          ]
        },
        {
          "name": "agent_quality089_versions_version_id_not_null",
          "type": "n",
          "keys": [
            "version_id"
          ]
        },
        {
          "name": "agent_quality089_versions_owner_user_id_not_null",
          "type": "n",
          "keys": [
            "owner_user_id"
          ]
        },
        {
          "name": "agent_quality089_versions_spec_id_not_null",
          "type": "n",
          "keys": [
            "spec_id"
          ]
        },
        {
          "name": "agent_quality089_versions_spec_revision_not_null",
          "type": "n",
          "keys": [
            "spec_revision"
          ]
        }
      ]
    },
    {
      "name": "agent_quality089_intents",
      "columns": [
        {
          "name": "backend_pid",
          "type": "integer",
          "required": true,
          "default": null
        },
        {
          "name": "transaction_id",
          "type": "bigint",
          "required": true,
          "default": null
        },
        {
          "name": "spec_id",
          "type": "uuid",
          "required": true,
          "default": null
        },
        {
          "name": "owner_user_id",
          "type": "uuid",
          "required": true,
          "default": null
        },
        {
          "name": "kind",
          "type": "text",
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
          "name": "request_sha256",
          "type": "text",
          "required": true,
          "default": null
        },
        {
          "name": "before_revision",
          "type": "bigint",
          "required": true,
          "default": null
        },
        {
          "name": "before_source",
          "type": "text",
          "required": true,
          "default": null
        },
        {
          "name": "checks",
          "type": "jsonb",
          "required": true,
          "default": null
        },
        {
          "name": "checks_sha256",
          "type": "text",
          "required": true,
          "default": null
        },
        {
          "name": "expected_new_source",
          "type": "text",
          "required": false,
          "default": null
        },
        {
          "name": "version_id",
          "type": "uuid",
          "required": false,
          "default": null
        },
        {
          "name": "consumed_revision",
          "type": "bigint",
          "required": false,
          "default": null
        }
      ],
      "constraints": [
        {
          "name": "q089_intents_kind_ck",
          "type": "c",
          "keys": [
            "kind"
          ],
          "expression": "kind IN('save','restore')"
        },
        {
          "name": "q089_intents_request_sha256_ck",
          "type": "c",
          "keys": [
            "request_sha256"
          ],
          "expression": "request_sha256~'^[a-f0-9]{64}$'"
        },
        {
          "name": "q089_intents_before_revision_ck",
          "type": "c",
          "keys": [
            "before_revision"
          ],
          "expression": "before_revision BETWEEN 1 AND 9007199254740989"
        },
        {
          "name": "q089_intents_before_source_ck",
          "type": "c",
          "keys": [
            "before_source"
          ],
          "expression": "before_source~'^[a-f0-9]{64}$'"
        },
        {
          "name": "q089_intents_checks_sha256_ck",
          "type": "c",
          "keys": [
            "checks_sha256"
          ],
          "expression": "checks_sha256~'^[a-f0-9]{64}$'"
        },
        {
          "name": "q089_intents_pk",
          "type": "p",
          "keys": [
            "backend_pid",
            "transaction_id",
            "spec_id"
          ]
        },
        {
          "name": "q089_intents_fk1",
          "type": "f",
          "keys": [
            "spec_id",
            "owner_user_id"
          ],
          "target": "agentstudio.agent_specs",
          "target_keys": [
            "id",
            "owner_user_id"
          ]
        },
        {
          "name": "q089_intents_ck1",
          "type": "c",
          "expression": "(kind='save' AND version_id IS NULL AND expected_new_source IS NULL) OR (kind='restore' AND version_id IS NOT NULL AND expected_new_source IS NOT NULL AND expected_new_source~'^[a-f0-9]{64}$')",
          "keys": [
            "kind",
            "version_id",
            "expected_new_source"
          ]
        },
        {
          "name": "q089_intents_ck2",
          "type": "c",
          "expression": "consumed_revision IS NULL OR consumed_revision=before_revision+1",
          "keys": [
            "consumed_revision",
            "before_revision"
          ]
        },
        {
          "name": "quality089_intent_rules",
          "type": "c",
          "expression": "checks_sha256=agentstudio.quality089_rules_sha(checks)",
          "keys": [
            "checks_sha256",
            "checks"
          ]
        },
        {
          "name": "agent_quality089_intents_backend_pid_not_null",
          "type": "n",
          "keys": [
            "backend_pid"
          ]
        },
        {
          "name": "agent_quality089_intents_transaction_id_not_null",
          "type": "n",
          "keys": [
            "transaction_id"
          ]
        },
        {
          "name": "agent_quality089_intents_spec_id_not_null",
          "type": "n",
          "keys": [
            "spec_id"
          ]
        },
        {
          "name": "agent_quality089_intents_owner_user_id_not_null",
          "type": "n",
          "keys": [
            "owner_user_id"
          ]
        },
        {
          "name": "agent_quality089_intents_kind_not_null",
          "type": "n",
          "keys": [
            "kind"
          ]
        },
        {
          "name": "agent_quality089_intents_request_id_not_null",
          "type": "n",
          "keys": [
            "request_id"
          ]
        },
        {
          "name": "agent_quality089_intents_request_sha256_not_null",
          "type": "n",
          "keys": [
            "request_sha256"
          ]
        },
        {
          "name": "agent_quality089_intents_before_revision_not_null",
          "type": "n",
          "keys": [
            "before_revision"
          ]
        },
        {
          "name": "agent_quality089_intents_before_source_not_null",
          "type": "n",
          "keys": [
            "before_source"
          ]
        },
        {
          "name": "agent_quality089_intents_checks_not_null",
          "type": "n",
          "keys": [
            "checks"
          ]
        },
        {
          "name": "agent_quality089_intents_checks_sha256_not_null",
          "type": "n",
          "keys": [
            "checks_sha256"
          ]
        },
        {
          "name": "quality089_intent_complete",
          "type": "t",
          "keys": null
        }
      ]
    }
  ],
  "triggers": [
    {
      "name": "quality089_specs_snapshot",
      "table": "agent_specs",
      "type": 21,
      "function": "quality089_spec_snapshot",
      "deferred": false
    },
    {
      "name": "quality089_revision_immutable",
      "table": "agent_quality089_revisions",
      "type": 27,
      "function": "quality089_immutable",
      "deferred": false
    },
    {
      "name": "quality089_receipt_immutable",
      "table": "agent_quality089_receipts",
      "type": 27,
      "function": "quality089_immutable",
      "deferred": false
    },
    {
      "name": "quality089_version_immutable",
      "table": "agent_quality089_versions",
      "type": 27,
      "function": "quality089_immutable",
      "deferred": false
    },
    {
      "name": "quality089_intent_complete",
      "table": "agent_quality089_intents",
      "type": 21,
      "function": "quality089_intent_complete",
      "deferred": true
    },
    {
      "name": "quality089_release_capture",
      "table": "agent_release_versions",
      "type": 5,
      "function": "quality089_release_capture",
      "deferred": false
    },
    {
      "name": "quality089_publish_guard",
      "table": "agent_release_versions",
      "type": 19,
      "function": "quality089_publish_guard",
      "deferred": false
    },
    {
      "name": "quality089_acceptance_guard",
      "table": "agent_release_acceptance_runs",
      "type": 7,
      "function": "quality089_acceptance_guard",
      "deferred": false
    },
    {
      "name": "quality089_restore_receipt_guard",
      "table": "agent_release_receipts",
      "type": 7,
      "function": "quality089_restore_receipt_guard",
      "deferred": false
    }
  ],
  "policies": [
    {
      "name": "quality089_specs_read",
      "schema": "agentstudio",
      "table": "agent_specs",
      "command": "SELECT",
      "expression": "owner_user_id=agentstudio.actor_id()"
    },
    {
      "name": "quality089_specs_write",
      "schema": "agentstudio",
      "table": "agent_specs",
      "command": "UPDATE",
      "expression": "owner_user_id=agentstudio.actor_id()"
    },
    {
      "name": "quality089_versions_read",
      "schema": "agentstudio",
      "table": "agent_release_versions",
      "command": "SELECT",
      "expression": "owner_user_id=agentstudio.actor_id()"
    },
    {
      "name": "quality089_acceptances_read",
      "schema": "agentstudio",
      "table": "agent_release_acceptance_runs",
      "command": "SELECT",
      "expression": "owner_user_id=agentstudio.actor_id()"
    },
    {
      "name": "quality089_runs_read",
      "schema": "agentstudio",
      "table": "runs",
      "command": "SELECT",
      "expression": "owner_user_id=agentstudio.actor_id()"
    },
    {
      "name": "quality089_steps_read",
      "schema": "agentstudio",
      "table": "run_steps",
      "command": "SELECT",
      "expression": "owner_user_id=agentstudio.actor_id()"
    },
    {
      "name": "quality089_users_read",
      "schema": "agentstudio",
      "table": "users",
      "command": "SELECT",
      "expression": "id=agentstudio.actor_id()"
    },
    {
      "name": "quality089_accounts_read",
      "schema": "agentstudio_auth",
      "table": "accounts",
      "command": "SELECT",
      "expression": "user_id=agentstudio.actor_id()"
    },
    {
      "name": "quality089_audit_read",
      "schema": "agentstudio",
      "table": "audit_events",
      "command": "SELECT",
      "expression": "owner_user_id=agentstudio.actor_id()"
    },
    {
      "name": "quality089_audit_write",
      "schema": "agentstudio",
      "table": "audit_events",
      "command": "INSERT",
      "expression": "owner_user_id=agentstudio.actor_id() AND actor_user_id=agentstudio.actor_id()"
    },
    {
      "name": "quality089_private",
      "schema": "agentstudio",
      "table": "agent_quality089_revisions",
      "command": "ALL",
      "expression": "true"
    },
    {
      "name": "quality089_private",
      "schema": "agentstudio",
      "table": "agent_quality089_receipts",
      "command": "ALL",
      "expression": "true"
    },
    {
      "name": "quality089_private",
      "schema": "agentstudio",
      "table": "agent_quality089_versions",
      "command": "ALL",
      "expression": "true"
    },
    {
      "name": "quality089_private",
      "schema": "agentstudio",
      "table": "agent_quality089_intents",
      "command": "ALL",
      "expression": "true"
    }
  ],
  "permissions": [
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "agent_specs",
      "column": "id",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "agent_specs",
      "column": "owner_user_id",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "agent_specs",
      "column": "name",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "agent_specs",
      "column": "spec",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "agent_specs",
      "column": "revision",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "agent_specs",
      "column": "updated_at",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "agent_specs",
      "column": "revision",
      "privilege": "UPDATE",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "agent_specs",
      "column": "updated_at",
      "privilege": "UPDATE",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "table",
      "schema": "agentstudio",
      "name": "agent_release_versions",
      "column": null,
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "table",
      "schema": "agentstudio",
      "name": "agent_release_acceptance_runs",
      "column": null,
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "runs",
      "column": "id",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "runs",
      "column": "owner_user_id",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "runs",
      "column": "workflow_id",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "runs",
      "column": "agent_spec_id",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "runs",
      "column": "kind",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "runs",
      "column": "status",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "runs",
      "column": "checkpoint",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "runs",
      "column": "result_text",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "run_steps",
      "column": "run_id",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "run_steps",
      "column": "owner_user_id",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "run_steps",
      "column": "step_key",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "run_steps",
      "column": "status",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "run_steps",
      "column": "metadata",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "users",
      "column": "id",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "users",
      "column": "status",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "users",
      "column": "external_issuer",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio_auth",
      "name": "accounts",
      "column": "user_id",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio_auth",
      "name": "accounts",
      "column": "enabled",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "audit_events",
      "column": "id",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "audit_events",
      "column": "owner_user_id",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "audit_events",
      "column": "actor_user_id",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "audit_events",
      "column": "action",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "audit_events",
      "column": "target_kind",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "audit_events",
      "column": "target_id",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "audit_events",
      "column": "result",
      "privilege": "SELECT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "audit_events",
      "column": "owner_user_id",
      "privilege": "INSERT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "audit_events",
      "column": "actor_user_id",
      "privilege": "INSERT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "audit_events",
      "column": "action",
      "privilege": "INSERT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "audit_events",
      "column": "target_kind",
      "privilege": "INSERT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "audit_events",
      "column": "target_id",
      "privilege": "INSERT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "audit_events",
      "column": "result",
      "privilege": "INSERT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "column",
      "schema": "agentstudio",
      "name": "audit_events",
      "column": "metadata",
      "privilege": "INSERT",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "schema",
      "schema": "agentstudio",
      "name": "agentstudio",
      "column": null,
      "privilege": "USAGE",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "schema",
      "schema": "agentstudio_auth",
      "name": "agentstudio_auth",
      "column": null,
      "privilege": "USAGE",
      "grantor": "postgres",
      "grantable": false
    },
    {
      "kind": "function",
      "schema": "agentstudio",
      "name": "actor_id()",
      "column": null,
      "privilege": "EXECUTE",
      "grantor": "postgres",
      "grantable": false
    }
  ]
})
