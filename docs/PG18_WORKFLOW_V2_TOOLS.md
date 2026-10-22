# Workflow V2 tools — isolated local candidate

Production remains **NO-GO**. This candidate implements the current five builtins and owner HTTP connections through a private Tool Broker. It does not activate a service, apply SQL to a company database or authorize external calls.

## Execution and permissions

The Worker sends only lease, invocation key and input hash to `/__internal/v2/workflow-tool/dispatch`. The private service verifies actual mutual TLS and the reviewed Workflow client pin, resolves the active employee through proposed migration 026, and replays the stored graph/checkpoint. Model and Tool identity functions reject each other's node kinds. Public Native HTTPS never mounts these private handlers.

Model and Tool dispatch share one owner/lease/approval/snapshot guard and per-kind secondary effect reservation. No owner, URL, headers, arguments or credential can be substituted by the Worker RPC. Owner resources and exact revisions are checked before reservation. Duplicate/concurrent RPCs, lost replies and failed result commits cannot authorize another POST. API and Worker logins cannot read secret columns; the credential Broker retains only its existing owner-scoped grants and receives no new Tool table access. Current metadata is checked through the API pool, and encrypted header IDs/names/timestamps are compared with the reserved selection before decryption through the separate Broker pool.

Known pre-call validation failures have a bounded private error contract and terminate the node/run as failed. Migration 026 also extends the effect status constraint with `failed`, preserving existing records. Invalid arithmetic is no longer classified as a possibly committed external operation. Any uncertainty after private reservation, including provider/socket/timeout/result-commit failure, stays unknown and pauses the run. No failure path automatically resends an external operation.

## Implemented tools

| Tool | Behavior |
| --- | --- |
| `calculate` | Bounded arithmetic parser, precedence/unary/parentheses, no eval, finite result checks |
| `summarize` | Same text/focus prompt semantics, explicit owner model/revision binding, encrypted key through Broker; no shared-provider fallback |
| `knowledge_search` | Explicit owner-private indexed KB citations, including single-character literal queries; without KB bindings searches the sealed instruction/prior node outputs |
| `web_fetch` | Public HTTP/HTTPS only; TLS/public DNS pinning, at most three public GET redirects with revalidation, no HTTPS downgrade, bounded text extraction |
| `web_search` | Existing DuckDuckGo HTML query semantics; bounded validated title/URL/snippet citations; result links are not fetched |
| HTTP connection | Exact enabled owner connection/revision, fixed origin, GET/POST, old body/named-field template semantics, decrypted saved headers, bounded response and secret-reflection redaction |

Summary nodes may save drafts without a model binding, but submission requires an explicit ready owner binding. Other Tool types cannot attach a model binding. Existing graph resource revision checks include this binding.

HTTP templates substitute only into the fixed path/query and body. Named arguments are URL-encoded; `{{input}}` retains the old raw parameter JSON semantics. Protocol/Host/framing/proxy/forwarded-identity headers cannot be overridden. Native employee cookies are not forwarded. Custom POSTs never follow redirects or retry; public GET redirects validate every new destination/DNS answer. A/AAAA private, mixed public/private and reserved addresses are refused before dialing. HTTPS uses normal hostname/CA verification and a pinned vetted address without a second DNS lookup. Response bytes, UTF-8, content encoding/type and elapsed time are bounded. Secret redaction is a single pass to avoid replacement growth with short credentials.

Workflow Tool parameter templates escape substituted values inside JSON strings, so quoted text, backslashes and newlines remain data and cannot introduce argument fields. An unquoted `{{input}}` can still supply an explicit complete JSON object. Model/Agent textual templates retain their original rendering.

Knowledge retrieval here is explicitly keyword/context retrieval, not semantic RAG or team ACL parity. Marketplace MCP/plugin registration, initialization/discovery and tool calls remain a separate migration requirement. Agent nodes and the PG employee canvas remain incomplete.

## Operator prerequisites and evidence

The Worker and Broker require their existing independent approvals and this additional pair (absent by default):

```text
AGENT_STUDIO_PG_WORKFLOW_V2_TOOLS_ENABLED=true
AGENT_STUDIO_PG_WORKFLOW_V2_TOOLS_APPROVED=APPROVE_DISPOSABLE_PG18_WORKFLOW_V2_TOOLS_ONLY
```

Tools use the already protected Workflow TLS credential directory and its distinct client certificate. The Broker's read-only preflight checks the Tool identity function's fixed search path, SECURITY DEFINER setting and execution ACL for all three independent logins. It also rejects a partial upgrade lacking the validated `failed` effect constraint. Summary additionally requires the separate Workflow model approval pair. Source flags/templates do not authorize activation or paid calls.

SQL upgrade order is reviewed 024 → 025 → proposed 026. Fresh isolated schema also permits the new `failed` effect state. No company schema has been changed. Existing installed unit examples remain on their prior read-only entrypoints.

`test:workflow-v2-tools` covers network/argument contracts and real embedded SQL/RLS plus temporary loopback mTLS. Only final provider/socket responses are injected. It exercises all five builtins and HTTP, secret reflection, single-character KB queries, foreign owner/KB denial, wrong kind/hash/lease/revision/approval, deterministic failures, ambiguous POST, concurrent dispatch and result-commit loss. Existing Model/Agent knowledge/configuration/Worker regressions also run. Real PG18 restricted-login HTTPS/mTLS assertions have been added to CI source but have **not** run remotely for this candidate. No external tool or paid model has been called.

Local checkpoint: Tool suite **9/9**; broader configuration/Agent knowledge/Worker/Broker regression **32/32**; JSON-template/replay/Tool runtime checks **13/13**. Final main-worktree `pnpm check` **323/323**, API TypeScript, 90-asset isolation and the PG-only build passed. Current PocketBase E2E **23/23**, two workers, **117.5 seconds**. The independent candidate has **34 allowlisted files** on `codex/pg18-workflow-v2-tools-20261022`, based on model commit `76886c5`: its own check **224/224**, API types, 95-asset isolation, PG-only build, Native auth/session/RLS **91/91**, and canonical PocketBase E2E **19/19** (**98.7 seconds**, two workers) passed. The final partial-upgrade refusal and complete Tool suite also passed on that candidate after the read-only preflight refinement.

The main-worktree read-only gate still reports **241 frontend files, 38 PocketBase-dependent files, 10 blocked gates, cutover=false**. This source remains local. Named UI, configuration, runtime and model candidate refs remain unchanged; their earlier upload permissions do not include this new Tool scope.

A subsequent [Workflow Agent-node candidate](PG18_WORKFLOW_V2_AGENTS.md) reuses these Tool adapters with a frozen role allowlist, owner KB scope and separate per-operation approval. Standalone Agent runs, marketplace MCP, the PG canvas and operational verification remain separate work.
