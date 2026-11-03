// Exact literal bodies from experimental/desktop-guided-pairing.sql; not runtime-discovered.
export const guidedManifest={
  "routines": {
    "guided_immutable": {
      "args": "",
      "names": null,
      "returns": "trigger",
      "grant": null,
      "sha": "95e8f6f172575390890fc0325ebf44ce021a6dcce7d41f4250c018280f2abc2a"
    },
    "guided_live": {
      "args": "uuid, uuid",
      "names": [
        "p_id",
        "p_owner"
      ],
      "returns": "agentstudio.native_local_devices",
      "grant": null,
      "sha": "83596e20995beb3e7902404ab5d8b857fe816a82a6cf8b44f850f9fb927cde9b"
    },
    "guided_receipt": {
      "args": "jsonb",
      "names": [
        "v"
      ],
      "returns": "jsonb",
      "grant": "agentstudio_api",
      "sha": "ccc8e60a4afb9f94994b11fa65d709fe52f2b64723b8d066e8ea2b716903ce6e"
    },
    "guided_record": {
      "args": "jsonb",
      "names": [
        "v"
      ],
      "returns": "jsonb",
      "grant": "agentstudio_api",
      "sha": "88f8940bd83d024df6a0db412e7ec49cd2c0a26be5bee985508ea99b4e24d14e"
    },
    "guided_status": {
      "args": "",
      "names": null,
      "returns": "jsonb",
      "grant": "agentstudio_api",
      "sha": "54cd3d891defa9ccab81ed3a1f50541d4d794d479779c8af35e6bff124f26e0d"
    },
    "guided_pair": {
      "args": "jsonb, boolean",
      "names": [
        "v",
        "p_confirm"
      ],
      "returns": "jsonb",
      "grant": "agentstudio_local_executor",
      "sha": "8843b8e44f3681891207f66a1a786001d8197f97bda91cbb732acbd8054094e4"
    }
  },
  "columns": [
    [
      "owner_user_id",
      "uuid",
      true
    ],
    [
      "request_id",
      "uuid",
      true
    ],
    [
      "request_sha256",
      "text",
      true
    ],
    [
      "action",
      "text",
      true
    ],
    [
      "device_id",
      "uuid",
      true
    ],
    [
      "owner_epoch",
      "bigint",
      true
    ],
    [
      "code_hash",
      "text",
      true
    ],
    [
      "expires_at",
      "timestamp with time zone",
      true
    ],
    [
      "created_at",
      "timestamp with time zone",
      true
    ]
  ],
  "checks": [
    "request_sha256 ~ '^[a-f0-9]{64}$'::text",
    "action = ANY (ARRAY['create'::text, 'renew'::text])",
    "owner_epoch >= 1 AND owner_epoch <= '9007199254740989'::bigint",
    "code_hash ~ '^[a-f0-9]{64}$'::text",
    "expires_at = (created_at + '00:05:00'::interval)"
  ]
} as const
