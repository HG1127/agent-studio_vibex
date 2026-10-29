// Literal author-reviewed SQL067 catalog pins. Rebuild only after reviewing SQL changes.
export const nativeLocalDeviceManifest={
 "sql_sha256": "003e2e5ffbe7893fe6290b65232c89d0156142ae88c2f6d98078daf6bbcddeb2",
 "tables": {
  "native_local_devices": {
   "fields": [
    [
     "id",
     "uuid",
     true,
     null
    ],
    [
     "owner_user_id",
     "uuid",
     true,
     null
    ],
    [
     "name",
     "text",
     true,
     null
    ],
    [
     "owner_epoch",
     "bigint",
     true,
     null
    ],
    [
     "version",
     "bigint",
     true,
     "1"
    ],
    [
     "revoked",
     "boolean",
     true,
     "false"
    ],
    [
     "pair_hash",
     "text",
     false,
     null
    ],
    [
     "pair_until",
     "timestamp with time zone",
     true,
     null
    ],
    [
     "token_hash",
     "text",
     false,
     null
    ],
    [
     "pair_request_id",
     "uuid",
     false,
     null
    ],
    [
     "pair_request_hash",
     "text",
     false,
     null
    ],
    [
     "seen_at",
     "timestamp with time zone",
     false,
     null
    ],
    [
     "catalog",
     "jsonb",
     true,
     "'[]'::jsonb"
    ],
    [
     "created_at",
     "timestamp with time zone",
     true,
     "clock_timestamp()"
    ]
   ],
   "checks": [
    "length(name) BETWEEN 1 AND 120",
    "owner_epoch BETWEEN 1 AND 9007199254740989",
    "version BETWEEN 1 AND 9007199254740989",
    "pair_hash ~ '^[a-f0-9]{64}$'",
    "token_hash ~ '^[a-f0-9]{64}$'",
    "pair_request_hash ~ '^[a-f0-9]{64}$'",
    "jsonb_typeof(catalog)='array' AND octet_length(catalog::text)<=65000",
    "NOT revoked OR pair_hash IS NULL AND token_hash IS NULL"
   ],
   "keys": [
    {
     "kind": "p",
     "columns": [
      "id"
     ]
    },
    {
     "kind": "u",
     "columns": [
      "pair_hash"
     ]
    },
    {
     "kind": "u",
     "columns": [
      "token_hash"
     ]
    }
   ],
   "foreign": [
    {
     "columns": [
      "owner_user_id"
     ],
     "target": "agentstudio.users",
     "references": [
      "id"
     ]
    }
   ]
  },
  "native_local_receipts": {
   "fields": [
    [
     "owner_user_id",
     "uuid",
     true,
     null
    ],
    [
     "request_id",
     "uuid",
     true,
     null
    ],
    [
     "request_sha256",
     "text",
     true,
     null
    ],
    [
     "receipt",
     "jsonb",
     true,
     null
    ],
    [
     "created_at",
     "timestamp with time zone",
     true,
     "clock_timestamp()"
    ]
   ],
   "checks": [
    "request_sha256 ~ '^[a-f0-9]{64}$'",
    "jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=1024"
   ],
   "keys": [
    {
     "kind": "p",
     "columns": [
      "owner_user_id",
      "request_id"
     ]
    }
   ],
   "foreign": [
    {
     "columns": [
      "owner_user_id"
     ],
     "target": "agentstudio.users",
     "references": [
      "id"
     ]
    }
   ]
  },
  "native_local_run_devices": {
   "fields": [
    [
     "run_id",
     "uuid",
     true,
     null
    ],
    [
     "owner_user_id",
     "uuid",
     true,
     null
    ],
    [
     "device_id",
     "uuid",
     true,
     null
    ],
    [
     "device_version",
     "bigint",
     true,
     null
    ],
    [
     "owner_epoch",
     "bigint",
     true,
     null
    ],
    [
     "catalog",
     "jsonb",
     true,
     null
    ],
    [
     "catalog_sha256",
     "text",
     true,
     null
    ]
   ],
   "checks": [
    "jsonb_typeof(catalog)='array' AND octet_length(catalog::text)<=65000",
    "catalog_sha256 ~ '^[a-f0-9]{64}$'"
   ],
   "keys": [
    {
     "kind": "p",
     "columns": [
      "run_id"
     ]
    }
   ],
   "foreign": [
    {
     "columns": [
      "run_id"
     ],
     "target": "agentstudio.runs",
     "references": [
      "id"
     ]
    },
    {
     "columns": [
      "owner_user_id"
     ],
     "target": "agentstudio.users",
     "references": [
      "id"
     ]
    },
    {
     "columns": [
      "device_id"
     ],
     "target": "agentstudio.native_local_devices",
     "references": [
      "id"
     ]
    }
   ]
  },
  "native_local_jobs": {
   "fields": [
    [
     "id",
     "uuid",
     true,
     null
    ],
    [
     "owner_user_id",
     "uuid",
     true,
     null
    ],
    [
     "device_id",
     "uuid",
     true,
     null
    ],
    [
     "device_version",
     "bigint",
     true,
     null
    ],
    [
     "run_id",
     "uuid",
     false,
     null
    ],
    [
     "step_key",
     "text",
     true,
     "''"
    ],
    [
     "input_sha256",
     "text",
     true,
     null
    ],
    [
     "input",
     "jsonb",
     true,
     null
    ],
    [
     "created_at",
     "timestamp with time zone",
     true,
     null
    ],
    [
     "deadline_at",
     "timestamp with time zone",
     true,
     null
    ],
    [
     "status",
     "text",
     true,
     null
    ],
    [
     "claim_hash",
     "text",
     false,
     null
    ],
    [
     "result",
     "jsonb",
     false,
     null
    ],
    [
     "error",
     "text",
     true,
     "''"
    ],
    [
     "completion_id",
     "uuid",
     false,
     null
    ],
    [
     "completion_hash",
     "text",
     false,
     null
    ],
    [
     "bound_request",
     "jsonb",
     false,
     null
    ]
   ],
   "checks": [
    "length(step_key)<=160",
    "input_sha256 ~ '^[a-f0-9]{64}$'",
    "jsonb_typeof(input)='object' AND octet_length(input::text)<=26000",
    "deadline_at=created_at+interval '120 seconds'",
    "status IN('queued','running','succeeded','failed','cancelled','expired','unknown')",
    "claim_hash ~ '^[a-f0-9]{64}$'",
    "jsonb_typeof(result)='object' AND octet_length(result::text)<=1450000",
    "length(error)<=120",
    "completion_hash ~ '^[a-f0-9]{64}$'",
    "(status IN('succeeded','failed'))=(result IS NOT NULL)",
    "(run_id IS NULL)=(step_key='')"
   ],
   "keys": [
    {
     "kind": "p",
     "columns": [
      "id"
     ]
    },
    {
     "kind": "u",
     "columns": [
      "run_id",
      "step_key"
     ]
    }
   ],
   "foreign": [
    {
     "columns": [
      "owner_user_id"
     ],
     "target": "agentstudio.users",
     "references": [
      "id"
     ]
    },
    {
     "columns": [
      "device_id"
     ],
     "target": "agentstudio.native_local_devices",
     "references": [
      "id"
     ]
    },
    {
     "columns": [
      "run_id"
     ],
     "target": "agentstudio.runs",
     "references": [
      "id"
     ]
    }
   ]
  }
 },
 "routines": {
  "native_local_immutable": {
   "args": "",
   "names": null,
   "defaults": null,
   "returns": "trigger",
   "language": "plpgsql",
   "volatility": "v",
   "sha": "20976d4e5741a3419c69f31ce87d849fd745b9f97de16c690e957d8f886a4045",
   "grant": null
  },
  "native_local_monotone": {
   "args": "",
   "names": null,
   "defaults": null,
   "returns": "trigger",
   "language": "plpgsql",
   "volatility": "v",
   "sha": "e1fe030d9af7079754dcf7efc2a800e61f6a2576186fa2790ce9b71f1e99af23",
   "grant": null
  },
  "native_local_session": {
   "args": "text",
   "names": [
    "p_role"
   ],
   "defaults": null,
   "returns": "void",
   "language": "plpgsql",
   "volatility": "v",
   "sha": "118a6fa553790fb2715cedfb5cf27b1a852df3c029b7d26f06cbcf12b4d9d886",
   "grant": null
  },
  "native_local_digest": {
   "args": "jsonb",
   "names": [
    "v"
   ],
   "defaults": null,
   "returns": "text",
   "language": "sql",
   "volatility": "i",
   "sha": "b6b3f1f25c1d362d9781fe76668212438f29e78baf55b65233fb52197935197d",
   "grant": null
  },
  "native_local_object_size": {
   "args": "jsonb",
   "names": [
    "v"
   ],
   "defaults": null,
   "returns": "bigint",
   "language": "sql",
   "volatility": "i",
   "sha": "70d117200c8f0b1d3131897bdfe1aea8424f699d1ff4e1d22ee6810026a59e6e",
   "grant": null
  },
  "native_local_secret": {
   "args": "text",
   "names": [
    "v"
   ],
   "defaults": null,
   "returns": "text",
   "language": "sql",
   "volatility": "i",
   "sha": "977622c28c4c8133700284c981cb3019ae9266ce9c012e95551f8d3a94ef17b7",
   "grant": null
  },
  "native_local_ms": {
   "args": "timestamp with time zone",
   "names": [
    "v"
   ],
   "defaults": null,
   "returns": "bigint",
   "language": "sql",
   "volatility": "i",
   "sha": "1962ca2e39d24d04c2c0056a15223b0aa6cbe24e8206718dbb934c7a806b5fa4",
   "grant": null
  },
  "native_local_device_view": {
   "args": "agentstudio.native_local_devices",
   "names": [
    "d"
   ],
   "defaults": null,
   "returns": "jsonb",
   "language": "sql",
   "volatility": "s",
   "sha": "83f3f83eb562335afe72cc4e3457748d3ddd2ebbf7f628a9839c2912366c9fd5",
   "grant": null
  },
  "native_local_job_view": {
   "args": "agentstudio.native_local_jobs",
   "names": [
    "j"
   ],
   "defaults": null,
   "returns": "jsonb",
   "language": "sql",
   "volatility": "s",
   "sha": "d9fa2afd11842d6da72bed80837bd78f8843192db16cb5932826e5124ec2141c",
   "grant": null
  },
  "native_local_owner": {
   "args": "",
   "names": null,
   "defaults": null,
   "returns": "uuid",
   "language": "plpgsql",
   "volatility": "v",
   "sha": "6a7c5c0ea5fb40d455a182380a18ca05411d8c5fe0511a6d2b237b038f40215e",
   "grant": null
  },
  "native_local_live": {
   "args": "uuid, uuid",
   "names": [
    "p_id",
    "p_owner"
   ],
   "defaults": null,
   "returns": "agentstudio.native_local_devices",
   "language": "plpgsql",
   "volatility": "v",
   "sha": "c4d45a9edfea92ba724e718def8e93d4baf721e50643d1beedbd31eaf4c09de1",
   "grant": null
  },
  "native_local_expire": {
   "args": "uuid",
   "names": [
    "p_device"
   ],
   "defaults": null,
   "returns": "void",
   "language": "plpgsql",
   "volatility": "v",
   "sha": "276752f3662d95e0f76a277e0d04dd0491798cfeeac5cdd7b1e4fd4b8bbab83b",
   "grant": null
  },
  "native_local_list": {
   "args": "",
   "names": null,
   "defaults": null,
   "returns": "jsonb",
   "language": "plpgsql",
   "volatility": "v",
   "sha": "081179f187c830cf8fa2c7198413b7731073c74e59aeaf9d12ab2b0a8ec8aca4",
   "grant": "agentstudio_api"
  },
  "native_local_get": {
   "args": "uuid",
   "names": [
    "p_job"
   ],
   "defaults": null,
   "returns": "jsonb",
   "language": "plpgsql",
   "volatility": "v",
   "sha": "fecfdb1dc347489e2409038ef87244c2cb6cea189d63319b6b0fff0c25f00762",
   "grant": "agentstudio_api"
  },
  "native_local_receipt": {
   "args": "uuid",
   "names": [
    "p_id"
   ],
   "defaults": null,
   "returns": "jsonb",
   "language": "plpgsql",
   "volatility": "v",
   "sha": "f5eaa5ea5b3f480edce16d6845d8ca691eec27b6a376d33a3088a660a7f16b3b",
   "grant": "agentstudio_api"
  },
  "native_local_insert_job": {
   "args": "uuid, agentstudio.native_local_devices, jsonb, uuid, text, text, jsonb",
   "names": [
    "o",
    "d",
    "p_input",
    "p_run",
    "p_step",
    "p_hash",
    "p_bound"
   ],
   "defaults": "NULL::uuid, ''::text, NULL::text, NULL::jsonb",
   "returns": "uuid",
   "language": "plpgsql",
   "volatility": "v",
   "sha": "de54813e3c17f230f3fc6adf6441a59d930ec634fcca868ef76679cdb74ce7ee",
   "grant": null
  },
  "native_local_record": {
   "args": "jsonb",
   "names": [
    "v"
   ],
   "defaults": null,
   "returns": "jsonb",
   "language": "plpgsql",
   "volatility": "v",
   "sha": "46d2e556198c8991d47271f15a5dd06ee888b607e6cbed1e358996a789d337c2",
   "grant": "agentstudio_api"
  },
  "native_local_pair": {
   "args": "jsonb, boolean",
   "names": [
    "v",
    "p_confirm"
   ],
   "defaults": "false",
   "returns": "jsonb",
   "language": "plpgsql",
   "volatility": "v",
   "sha": "6343d4118a18788291dad7975b5343185a747c99940f1e472f536fa8cbc76792",
   "grant": "agentstudio_local_executor"
  },
  "native_local_token": {
   "args": "text",
   "names": [
    "v"
   ],
   "defaults": null,
   "returns": "agentstudio.native_local_devices",
   "language": "plpgsql",
   "volatility": "v",
   "sha": "5aaf7b04286df35d8ceab902496e5150d551be288305e0c0e06f0ccd8b10f9b3",
   "grant": null
  },
  "native_local_poll": {
   "args": "text, jsonb, text",
   "names": [
    "p_token",
    "p_catalog",
    "p_claim"
   ],
   "defaults": null,
   "returns": "jsonb",
   "language": "plpgsql",
   "volatility": "v",
   "sha": "f2c6076f1f302d052f86cd6c60f4e3c0aba46b5662b22308b0fee000f6747c4d",
   "grant": "agentstudio_local_executor"
  },
  "native_local_check": {
   "args": "text, uuid, text",
   "names": [
    "p_token",
    "p_job",
    "p_claim"
   ],
   "defaults": null,
   "returns": "jsonb",
   "language": "plpgsql",
   "volatility": "v",
   "sha": "dc463911e78c806bb1899d3a551ad41d550fdfd15f1f18a646af9863df9e58c4",
   "grant": "agentstudio_local_executor"
  },
  "native_local_result_safe": {
   "args": "jsonb",
   "names": [
    "v"
   ],
   "defaults": null,
   "returns": "void",
   "language": "plpgsql",
   "volatility": "v",
   "sha": "ecc34a8f2cfa30cee211f34807af4724bf716ebff2c6c1ecdedc6310286be924",
   "grant": null
  },
  "native_local_complete": {
   "args": "text, jsonb, boolean",
   "names": [
    "p_token",
    "v",
    "p_confirm"
   ],
   "defaults": "false",
   "returns": "jsonb",
   "language": "plpgsql",
   "volatility": "v",
   "sha": "015fcae23dfca15616d6517b43fd32cabbe086b92f98ffc85e28fd8228a60d86",
   "grant": "agentstudio_local_executor"
  },
  "native_local_bind": {
   "args": "uuid, uuid, boolean",
   "names": [
    "p_run",
    "p_device",
    "p_confirm"
   ],
   "defaults": "false",
   "returns": "jsonb",
   "language": "plpgsql",
   "volatility": "v",
   "sha": "7d281123ebe304c5af9959d2c5fa20440b14f37a144ded261f8c0ee9024c0cb0",
   "grant": "agentstudio_api"
  },
  "native_local_agent_enqueue": {
   "args": "jsonb, jsonb",
   "names": [
    "v",
    "p_input"
   ],
   "defaults": null,
   "returns": "jsonb",
   "language": "plpgsql",
   "volatility": "v",
   "sha": "d08565d7c6801f9b2a5e807b19e3b6051048842b061e098990274831a13f4976",
   "grant": "agentstudio_api"
  },
  "native_local_run_binding": {
   "args": "uuid",
   "names": [
    "p_run"
   ],
   "defaults": null,
   "returns": "jsonb",
   "language": "plpgsql",
   "volatility": "v",
   "sha": "e9d6ad9e585fbb25cdf087cf3f809a32705c717a56e3481788cd7b0781e1d8e8",
   "grant": "agentstudio_api"
  },
  "native_local_admission_device": {
   "args": "uuid",
   "names": [
    "p_run"
   ],
   "defaults": null,
   "returns": "uuid",
   "language": "plpgsql",
   "volatility": "v",
   "sha": "892c81e802f6d51333b932206f1c327ce8da495c7265e4270bc6b8674d1c2aa1",
   "grant": "agentstudio_api"
  },
  "native_local_run_tasks": {
   "args": "uuid",
   "names": [
    "p_run"
   ],
   "defaults": null,
   "returns": "jsonb",
   "language": "plpgsql",
   "volatility": "v",
   "sha": "7e9badd738dfb6cec04e2a400bc33879287597f2b4d14abe7a97de0f0a7f8b6a",
   "grant": "agentstudio_api"
  },
  "native_local_worker_binding": {
   "args": "jsonb",
   "names": [
    "v"
   ],
   "defaults": null,
   "returns": "jsonb",
   "language": "plpgsql",
   "volatility": "v",
   "sha": "f648eb981d2b88385d4726d27c52f82f0a9672825df28e4cf15a001e5d43eab9",
   "grant": "agentstudio_worker"
  },
  "native_local_images": {
   "args": "uuid",
   "names": [
    "p_run"
   ],
   "defaults": null,
   "returns": "jsonb",
   "language": "plpgsql",
   "volatility": "v",
   "sha": "dfadf3fa28f2a20b391893c3a76da727b371ec3290331ff0c1193b154dc77fc1",
   "grant": "agentstudio_api"
  }
 },
 "dependencies": {
  "agent_design_sort_key": {
   "args": "text",
   "returns": "integer[]",
   "language": "plpgsql",
   "volatility": "i",
   "strict": true,
   "definer": false,
   "sha": "b2387fe445d43eed8e1267340b2a74acc21b9e0082fce36abc90abe95ff1692d"
  },
  "agent_design_number": {
   "args": "numeric",
   "returns": "text",
   "language": "plpgsql",
   "volatility": "i",
   "strict": true,
   "definer": false,
   "sha": "479b0ef8963be176c3225aa1e287c4a97a74e9d40306274ea7a07b3b9d4ea9ca"
  },
  "agent_design_index_key": {
   "args": "text",
   "returns": "bigint",
   "language": "sql",
   "volatility": "i",
   "strict": true,
   "definer": false,
   "sha": "c7f680b7167ad122630adaba380a01b4c1430292b24e81a0959ffcc69e3dae01"
  },
  "agent_design_compact": {
   "args": "jsonb",
   "returns": "text",
   "language": "plpgsql",
   "volatility": "i",
   "strict": true,
   "definer": false,
   "sha": "1e34079e018fd40d5dc9d618c1786f48f40b180e20bb53a69ecb7702b494b3f3"
  },
  "agent_design_digest": {
   "args": "jsonb",
   "returns": "text",
   "language": "sql",
   "volatility": "i",
   "strict": true,
   "definer": false,
   "sha": "00a6b69003296912cda5b8110dce22e43b34ee848d120c2a4d629abbba6847cc"
  },
  "agent_design_native": {
   "args": "uuid",
   "returns": "jsonb",
   "language": "plpgsql",
   "volatility": "v",
   "strict": false,
   "definer": true,
   "sha": "741fd091717c8a41cc592b143264433220651249b0ac60857f6862716c506c1e"
  }
 }
} as const
