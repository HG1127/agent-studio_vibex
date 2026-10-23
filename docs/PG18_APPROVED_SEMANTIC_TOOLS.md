# Approved semantic tools — isolated runtime and employee controls

This is a PG18 migration candidate, not production activation. PocketBase is
still the current runtime. SQL040 adds actual semantic/hybrid execution to the
approved Workflow Tool, Workflow Agent and autonomous Agent paths. The isolated
employee forms also support frozen retrieval modes and per-step charge review.
Hosted acceptance must correspond to the final source revision; this does not
replace real employee UAT or the remaining cutover gates.

## Employee configuration and review

Agent KB binding and Workflow knowledge Tool forms default to keyword retrieval.
An explicit metadata read checks the independently enabled Tool capability and
the current employee's query profile/consent and currently readable KB metadata.
Semantic choices require at least one currently permitted semantic source; hybrid
can also include currently readable keyword-only sources. Both choices freeze
the exact profile UUID, profile revision and consent revision. Existing bindings
never silently upgrade; a stale/unavailable binding must be explicitly replaced
or cleared by choosing keyword mode. Removing every KB or changing the Tool clears
the binding. Saving and reading metadata do not submit queries or call a provider.

The server remains authoritative for current KB grants and index compatibility;
changed or unavailable resources can stop a step before provider dispatch. The
approval view shows the frozen query, retrieval mode and current KB names. Both Workflow
and standalone Agent views require a separate unchecked semantic-query fee
checkbox in addition to ordinary operation review. Model calls retain separate
approval. Neither form accepts a payer, credential or provider override.

The fee acknowledgement is part of the immutable pending decision intent,
together with its run, step, hash and decision. A lost response permits only an
explicit exact retry or current-state read; it cannot turn a later step into the
original charge intent. Refusal and ordinary Tool/model decisions carry no
semantic fee acknowledgement. Missing capability, stale profile/consent or scope
metadata blocks a fresh paid approval. The backend independently verifies all
of these boundaries.

Hidden/replaced durable task views discard retained prompts/results and ignore late
reads. Background read failures clear cached detail and list previews. A late
mutation can confirm its original intent while hidden but cannot repopulate its
retained result. Fee checkboxes reset when the step, review context or visible
approval capability changes. Logout/session replacement disposes the controller.

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
These durable checks cover the new semantic Tool path. Equivalent retained
content/version evidence for existing free keyword Tool observations and
automatic historical debug/cross-run sample provenance still need completion;
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
