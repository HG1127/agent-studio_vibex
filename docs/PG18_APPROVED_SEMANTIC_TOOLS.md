# Approved semantic tools — isolated backend runtime

This is a PG18 migration candidate, not production activation. PocketBase is
still the current runtime. SQL040 adds actual semantic/hybrid execution to the
approved Workflow Tool, Workflow Agent and autonomous Agent paths. Employee
configuration/review controls for this new Tool capability still need completion
and browser acceptance before it can be considered ready for employee UAT.

## Execution and cost boundaries

`knowledge_retrieval` is a closed stored configuration with `mode` (semantic or
hybrid), the reader's configuration UUID, profile revision and consent revision.
It requires declared KB IDs. It is included in the graph/spec snapshot and the
actual pending step hash. A planner can propose only the query; it cannot choose
the payer, provider, URL, mode, credential or KB scope in Tool arguments.

Approving a paid knowledge Tool requires the separate decision field
`knowledge_query_charge=PAY_ONCE_FOR_THIS_APPROVED_KNOWLEDGE_TOOL`, tied to its
run, step and input hash. Rejecting needs no charge acknowledgement. Ordinary
model/Tool decisions retain their existing contract. Saving, preparing and
previewing remain free of embedding calls. The older single-shot Agent queue
rejects these declarations rather than silently using a different retrieval mode.

After the private Tool Broker reserves its one dispatch, it submits one query
with a stable reader/run/step request UUID. It holds no SQL transaction while
waiting. A separate Query Worker and pinned private mTLS Query Broker perform
the paid operation using only the reader's own query and key. The Tool polls
receipts and never retries submission/dispatch on an ambiguous outcome. Its
existing 25-second deadline bounds the whole operation; queue/provider delay can
pause a run with an unknown outcome. This needs workload/long-running acceptance.

SQL039's approval/lease/root/checkpoint fence remains in force. SQL040 additionally
checks metadata for referenced models, HTTP/MCP declarations, header versions,
Agent specs and knowledge grants, without reading credential columns. Earlier
semantic observations are rechecked in the asynchronous Query Broker immediately
before and after provider I/O, including when the new query uses a different KB.

The result contains at most six current references, 320 codepoints per snippet
and 200 per citation. Formatting also respects the 4,000-character replay output,
14,336-byte evidence and 16,384-byte escaped private response limits. It never
forwards all standalone search snippets. A later model gets a newly frozen
prompt and a separate approval; validation never substitutes new text into an
already approved prompt.

## Durable evidence and current reads

The ordinary query payload still expires after 15 minutes. A private trigger
retains only selected references, content hashes, vector versions and scope
fences for a completed execution. It retains no query text or retrieved snippet.
The existing private task checkpoint still contains its bounded frozen outputs
for replay; every new external effect and approval checks current provenance.
This lets a human resume approval after query expiry without another embedding
charge, while content/vector/profile changes or revoke/regrant invalidate old
evidence. No run deletion cascades into the billing fence.

Run result text, list previews, pending prompts, citation metadata and explicit
Workflow output/history reads are redacted/refused when semantic provenance is
unavailable. Role, routine, alias, trigger and metadata-column audits apply even
when this capability is off. The pre-semantic submission alias has no API grant.
These new durable checks cover the new semantic Tool path. Equivalent retained
content/version evidence for existing free keyword Tool observations, frontend
cache/review handling and historical debug-sample provenance still need review;
do not infer that this change completes all knowledge privacy/parity work.

## Independent operator approval (all remain off by default)

The Native API, Workflow/autonomous Worker CLI, private dispatch Broker, and
Query Worker/Broker each need their own reviewed environment/configuration and
SQL040 preflight. The additional pair is:

```text
AGENT_STUDIO_PG18_KNOWLEDGE_TOOL_UAT_ENABLED=true
AGENT_STUDIO_PG18_KNOWLEDGE_TOOL_UAT_APPROVED=APPROVE_DISPOSABLE_PG18_APPROVED_SEMANTIC_TOOLS
```

It requires the existing sharing and query-runtime approval pairs. Native API
metadata/consent gates and existing Model/Tool/Agent execution gates remain
independent. This pair does not enable indexing, create employee consent, load
owner keys into a Worker, start a service or authorize a production deployment.
Do not enable a real provider as part of these synthetic migration checks.

Code rollback must match the schema/privilege version: older audits may correctly
reject SQL040's additional restricted metadata grants. Actual backup/restore and
rollback signoff remain required.

Verification uses synthetic data/providers with actual SQL, employee decisions
and private TLS endpoints. Real employee UAT, the remaining UI/feature parity,
target access/networking, real service lifetime/loss/restart behavior and actual
backup/restore/cutover acceptance are outstanding. Production remains **NO-GO**.
