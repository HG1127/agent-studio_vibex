// Derived from the proposed078 source without executing SQL.
export const originalSchedulesFunctionManifest=[
  {
    "name": "original_schedule_form_valid",
    "signature": "original_schedule_form_valid(jsonb)",
    "returns": "boolean",
    "language": "plpgsql",
    "volatility": "s",
    "defaults": 0,
    "body_sha256": "af279a4b163172398959f9030423cca866d6549366cd6df3ad7dcbe38d15b435",
    "grantees": []
  },
  {
    "name": "original_schedule_actor",
    "signature": "original_schedule_actor()",
    "returns": "uuid",
    "language": "plpgsql",
    "volatility": "s",
    "defaults": 0,
    "body_sha256": "687d5c47c5339736fd5b376b56a48e3e551c5a0b6184029a4df098a0bdb87381",
    "grantees": []
  },
  {
    "name": "original_schedule_rule",
    "signature": "original_schedule_rule(jsonb)",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "i",
    "defaults": 0,
    "body_sha256": "69a5075b88988a3d6f22e9153d933bc9e59d14bc8a639d9d139c266eca9ada73",
    "grantees": []
  },
  {
    "name": "original_schedule_binding",
    "signature": "original_schedule_binding(jsonb)",
    "returns": "jsonb",
    "language": "sql",
    "volatility": "i",
    "defaults": 0,
    "body_sha256": "f252651731d666bb5a8ca68596e8b12056cdb5666375a54f958d8f0e95dc998f",
    "grantees": []
  },
  {
    "name": "original_schedule_material_sha",
    "signature": "original_schedule_material_sha(uuid,uuid)",
    "returns": "text",
    "language": "sql",
    "volatility": "s",
    "defaults": 0,
    "body_sha256": "2b3223acefbbcde89c6603a61c233fc93e3c376a34de87bcfcef8cae5d63a893",
    "grantees": []
  },
  {
    "name": "original_schedule_occurrence_sha",
    "signature": "original_schedule_occurrence_sha(uuid,uuid)",
    "returns": "text",
    "language": "sql",
    "volatility": "s",
    "defaults": 0,
    "body_sha256": "4276d7a7339658277b760e18608ad3fa86e44b3837f4add02aa4003d36a39301",
    "grantees": []
  },
  {
    "name": "original_schedule_legacy_form",
    "signature": "original_schedule_legacy_form(uuid,uuid)",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "s",
    "defaults": 0,
    "body_sha256": "54a56612b6b55e76ba31d947c122d2ab14a181b4097d1a7a04922b95654ad1bb",
    "grantees": []
  },
  {
    "name": "original_schedule_public_row",
    "signature": "original_schedule_public_row(uuid,uuid)",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "s",
    "defaults": 0,
    "body_sha256": "1aa8fc23cb5af549be480ec9685ee966e5a16b102131a07bcb2470e8b250eb84",
    "grantees": []
  },
  {
    "name": "original_schedule_begin",
    "signature": "original_schedule_begin(uuid,text,jsonb)",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "v",
    "defaults": 0,
    "body_sha256": "116b30f40eaea45eac7efa39d54164d41b5749bbebf3f48c0e2a7435a7b101cf",
    "grantees": [
      "agentstudio_api"
    ]
  },
  {
    "name": "original_schedule_put",
    "signature": "original_schedule_put(uuid,jsonb)",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "v",
    "defaults": 0,
    "body_sha256": "f423094dbf6bac63d0d6f0520ca0c453a6f38c27513e33d3f59f3a4d19a0378f",
    "grantees": [
      "agentstudio_api"
    ]
  },
  {
    "name": "original_schedule_tombstone",
    "signature": "original_schedule_tombstone(uuid)",
    "returns": "boolean",
    "language": "plpgsql",
    "volatility": "v",
    "defaults": 0,
    "body_sha256": "cfe9058daf79d6f475efd618fcce196843b42180696a9473c36e6c7443d508f6",
    "grantees": [
      "agentstudio_api"
    ]
  },
  {
    "name": "original_schedule_finish",
    "signature": "original_schedule_finish(uuid,uuid,uuid)",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "v",
    "defaults": 2,
    "body_sha256": "6af58ab811b42dd5ba81974bd94818481625de87798ae729bbe6e7700f5e7b9a",
    "grantees": [
      "agentstudio_api"
    ]
  },
  {
    "name": "original_schedule_operation_immutable",
    "signature": "original_schedule_operation_immutable()",
    "returns": "trigger",
    "language": "plpgsql",
    "volatility": "v",
    "defaults": 0,
    "body_sha256": "f85fcd63a07652eda1ae1f5013ac7b05c4f9925886fc0f3c55be645abf67a380",
    "grantees": []
  },
  {
    "name": "original_schedule_operation_complete",
    "signature": "original_schedule_operation_complete()",
    "returns": "trigger",
    "language": "plpgsql",
    "volatility": "v",
    "defaults": 0,
    "body_sha256": "3bd2bb6fc195fd2b4f26d6c08d4b8cdea09f6e2d193602810a6a733ec75cb595",
    "grantees": []
  },
  {
    "name": "original_schedule_receipt",
    "signature": "original_schedule_receipt(uuid)",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "s",
    "defaults": 0,
    "body_sha256": "26708f3be9febc4bf2b13bebce5f0d8a6c2250f3e58ad4ec90aacdbea95b3fb5",
    "grantees": [
      "agentstudio_api"
    ]
  },
  {
    "name": "original_schedule_get",
    "signature": "original_schedule_get(uuid)",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "s",
    "defaults": 0,
    "body_sha256": "a9ebf632a9853bdf6fac48ba6639c59800449ca81b600a569a8d5a581c69a471",
    "grantees": [
      "agentstudio_api"
    ]
  },
  {
    "name": "original_schedule_list",
    "signature": "original_schedule_list(text,timestamptz,uuid,integer)",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "s",
    "defaults": 0,
    "body_sha256": "dfecd9e460aad854dba012858c523a5874a5145eb88fc05163a13a01209e56c4",
    "grantees": [
      "agentstudio_api"
    ]
  },
  {
    "name": "original_schedule_history",
    "signature": "original_schedule_history(uuid,timestamptz,uuid,integer)",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "s",
    "defaults": 0,
    "body_sha256": "1870d7514f15cb7b930e4253e04b649cd8a848de27089a8bf33aaeabed8c46a1",
    "grantees": [
      "agentstudio_api"
    ]
  },
  {
    "name": "original_schedule_workflow_target",
    "signature": "original_schedule_workflow_target(uuid)",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "s",
    "defaults": 0,
    "body_sha256": "af9b704fc51c6c24a1472e3e6f2facf9abbcbfb3f17393266df140ff1a8aac7f",
    "grantees": [
      "agentstudio_api"
    ]
  },
  {
    "name": "original_schedule_workflow_targets",
    "signature": "original_schedule_workflow_targets(uuid,integer)",
    "returns": "jsonb",
    "language": "plpgsql",
    "volatility": "s",
    "defaults": 0,
    "body_sha256": "30cdb8f9184260bc183e057635327cb7c783c00e649f4e0b2bbb5df26b889226",
    "grantees": [
      "agentstudio_api"
    ]
  }
] as const
export const originalSchedulesMigrationSha256="cad36d38cb9e8ace411d97b1860249372773bc7fa71bd420ef3e1b838728fa41" as const
