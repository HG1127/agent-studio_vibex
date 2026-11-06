# Independent complete069 Bound and Knowledge Broker source review

This is a source/assets review supplement. Production remains NO-GO. It adds
no role, SQL, ledger entry, credential, TLS material, runtime authorization or
service installation. The original entrypoints, configurations, auditors and
preflight commands are unchanged. C3 remains its separate frozen delivery.

| Required companion | Original entry / preflight | Listener in separately approved serve mode | Existing LOGINs |
| --- | --- | --- | --- |
| Bound Broker | bound-dispatch-server.ts --preflight | https://127.0.0.1:7453 | stage_login, bound_dispatch_login, model_broker_login (all prefixed agentstudio_) |
| Knowledge Broker | knowledge-index-service.ts --preflight broker | https://127.0.0.1:7455 | knowledge_index_broker_login, model_broker_login (all prefixed agentstudio_) |

Bound Broker carries the bound model path and, under their independent gates,
Workflow V2 model/tool/agent effects and Autonomous Agent effects. Relevant
model/Workflow V2/Autonomous Workers need this companion when those paths are
enabled. Knowledge Worker index/query paths need the Knowledge Broker when
their index/query approvals are enabled. The Knowledge Broker uses its own
index-broker pool and a model-secret-broker pool; it does not open an API pool
merely because its target selector uses the API environment convention.

## What the original seven-entry qualification does not prove

The unchanged live contract starts prepare, model, workflow_safe, workflow_v2,
agent_autonomous, knowledge and assessment Workers. Its knowledge entry is
knowledge-index-service.ts --serve worker, not broker. No entry launches
bound-dispatch-server.ts. Thus its eight telemetry kinds and minimum
86400000 ms/run do not establish that 7453/7455 listen, accept the intended mTLS
client or can dispatch work. Idle queues can leave these companion paths unused.
Keep the original seven/eight/duration contract intact and record any companion
proof separately. This source supplement is not such execution evidence.

Other feature-dependent companion processes remain separate: original Review
Broker at 7459 is required for assessment and enabled Design work, while the
seven-entry assessment process is --serve worker; the F05 Plan Workflow Broker
uses its separately reviewed origin/configuration and is also outside the
seven entries. Its worker and the Design feature mode are not extra entries in
the original list. Native/Executor setup and long-run device/UAT proof are
separate requirements. This supplement implements source delivery only for
the Bound and Knowledge Brokers above.

## Exact existing credentials, unit and TLS ABI

Bound uses /run/credentials/agentstudio-pg18-dispatch.service and the unchanged
agentstudio-pg18-dispatch.service.example. Its leaves are api.secret,
identity.secret, broker.secret, model-encryption.secret, dispatch-ca.pem,
dispatch-server.pem and dispatch-server.key. API/identity/model-broker logins
remain independent. AGENT_STUDIO_PG_BOUND_DISPATCH_REVIEWED must be true and
AGENT_STUDIO_PG_BOUND_DISPATCH_CLIENT_FINGERPRINT is the reviewed client pin.
Optional Workflow and Autonomous modes require their original independent
gates and distinct client pins; no base preflight silently enables them.

Knowledge uses /run/credentials/agentstudio-pg18-knowledge-index-broker.service
and the unchanged agentstudio-pg18-knowledge-index-broker.service.example. Its
leaves are index.secret, broker.secret, model-encryption.secret, dispatch-ca.pem,
dispatch-server.pem and dispatch-server.key. Its index and secret-broker values
must differ. AGENT_STUDIO_PG_KNOWLEDGE_INDEX_REVIEWED and the reviewed
AGENT_STUDIO_PG_KNOWLEDGE_INDEX_CLIENT_FINGERPRINT remain required. Index/query,
knowledge sharing and tool gates stay independent; query requires sharing.
Knowledge worker mounts its client material under its own existing directory
and pins the server fingerprint. It is not given the Broker's encryption key.

Both original credential readers require a nonroot Linux UID, the exact
credential directory, safe owners/modes, regular non-symlink files and stable
reads. Original server TLS validation checks current CA/server validity, CA
signatures, private-key matching, serverAuth EKU and localhost plus 127.0.0.1
SANs. The original listener requests and verifies client certificates and pins
the separately reviewed client. No live CA, certificate, private key, DB secret
or encryption key is in this source archive.

Both original preflights READ AND PARSE a model encryption key, then zero it
on shutdown. They are not the Review Broker's metadata-only key preflight.
They perform original real pool/catalog checks without constructing providers
or listeners in preflight mode. Bound reports verified_roles=3 and
writes_performed=false / port_opened=false / external_model_calls=false.
Knowledge reports roles_verified=true / provider_calls=false / workers_started=false
and network_used=true for its actual DB access; it does not report a numeric
role count or a writes_performed/port_opened field. Do not synthesize those
missing original fields or label a source capture as a successful preflight.

The two existing units stay readonly Type=oneshot, Restart=no, fixed original
--preflight and no Install section. They are review examples, not background
serve units or installation authority. The old model Worker example is itself
a base preflight example; enabling all TLS feature modes needs separate worker
credential/gate review rather than treating any example as a full deployment.

## Independent closed source/assets seal and archive

pg18-complete-companion-sources.mjs captures the exact current complete069
parent seal plus the original two Broker roots, literal static/dynamic/type
module imports, the unchanged live qualification contract and fixed review
assets. It never imports or executes either application entrypoint. Every path
and raw UTF-8 file is checked, symlinks/hardlinks and unknown external/dynamic
imports refuse. The closure is a source-import closure; package-owned runtime
assets and optional document extraction dependencies are not installed or
attested. The five fixed assets are the two old Broker unit examples, this
guide and both old/new source review builders. They are hashed in the separate
complete069_broker_companion_sources_v1 manifest. The original complete069,
059/060 and seven-Worker source definitions are untouched.

The new ops/build-pg18-complete069-companion-review-bundle.mjs keeps the old
builder/CLI unchanged. --plan reads only the reviewed source/assets and returns
both seals. Build requires --profile complete069 --expected-source-sha256 C_SHA
--expected-companion-sha256 COMPANION_SHA --output-dir ABSOLUTE_EXTERNAL_DIR.
It reuses the original pinned complete069 collector (53 SQL, original API
package/lock and four exact TS parser files), adds the companion closure/assets,
retains BASE_COMPLETE069_REVIEW_MANIFEST.json as source-subset provenance and
preserves every file listed in that base manifest, including the original
README. A separate BROKER_COMPANION_README_REVIEW_ONLY.txt directs review of
the supplement. It regenerates its own REVIEW_MANIFEST.json/SHA256SUMS and
never treats the old
manifest as attesting the expanded archive. Publication is exclusive and the
builder verifies extracted inventory and file hashes. Root owns actual archive
creation/extraction verification; source tests do not claim those operations.

## Next guarded execution review, not implemented here

A separate hosted synthetic CI should require the original guard, attested
new disposable physical PG18 target, exact parent/companion seals, locked PG
runtime and existing fixed C credentials before any effect. Stage readonly
runtime and exact credential mounts with a nonroot UID; use synthetic keys and
distinct synthetic CA/server/client certificates. Invoke the two unchanged
original preflights with original pool/auditors. Check actual original report
fields, closed failure codes and ledger/all133-table-image/catalog equality.
Never re-run an old exact C/Review/Executor phase observer after legitimate
later accounts; use its original real auditor and a separate exact matrix.
Never enter the full profile inspector from a second admin connection while
the schema lock is held; retain complete profile checks before/after that lock.

Test absent review, wrong target, bad credential directories/modes/aliases,
wrong TLS material/pins and unsafe role/membership boundaries with restoration
on that owned target. Guarded short serve checks, if separately reviewed,
need distinct ports, denied provider egress, empty protected queues, explicit
original serve opt-ins, bounded lifetime and verified mTLS handshake/stop. They
must have their own evidence namespace and must not claim paid work, UAT or
day-long qualification. Knowledge serve constructs embedding transport and
requires index/query opt-in; Bound serve constructs the provider executor.
No such execution, key staging, SQL or listener check is part of this batch.
