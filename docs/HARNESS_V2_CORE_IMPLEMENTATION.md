# Agent Harness V2 Core — incremental, backward-compatible implementation

Baseline: PocketBase 0.40.5 / SQLite + Node Worker, `origin/main` at 5d044a9.
This branch is **not a production deployment**, a PostgreSQL cutover, a general-purpose
code-execution sandbox, or a claim of exactly-once execution.

## Runtime changes

1. **Shared tool contract** (`modules/harness_tool_contracts.js`) runs before tool
   execution in the Agent runner, Workflow tool nodes and Workflow embedded Agent
   nodes. Built-ins have explicit field type/range checks; external/MCP arguments
   are bounded JSON objects with prototype-related fields, unsafe nesting and
   oversized payloads rejected. Existing owner checks, approval decisions,
   network protections and side-effect journal remain authoritative. The
   contract does **not** trust remote MCP schemas to bypass local limits.
2. **Hard model-call ceiling for Agent runs** (`modules/harness_budget.js`).
   Run start accepts `config.max_model_calls` as integer 1–100. Missing value in
   legacy callers receives max(12, min(100, 3 × max_steps)). Every Agent
   planning, summarize, compaction and final-memory-model attempt uses the same
   counter, **reserved to the run checkpoint before sending a paid request**, and
   is rejected at the limit. Reservation failure blocks the call. Expired-lease
   races are not strictly fenced yet. Estimated character/token stats remain
   estimates, not authoritative billing or dollar spend.
3. **Evidence-reference continuity** (`modules/harness_evidence.js`).
   Successful web fetch, search and linked knowledge-search results preserve
   deduplicated short URL/citation references (max 64) in `checkpoint.evidence_refs`
   independently of rolling step history, and reinject a bounded summary into
   subsequent planning. References are marked `retrieved`, never `verified`.
   Full source text remains in original documents and runtime events; this
   change does NOT build a complete artifact store or prove citation correctness.
4. **Risk management**: new Agent Run UI defaults `require_approval=true` when
   specs have not explicitly chosen otherwise. Operator flag
   `AGENT_STUDIO_HARNESS_V2_STRICT_WRITES=true` forces approval for external
   write tools and market connectors in Agent + Workflow even when a client
   turns approval off. Existing side-effect journal blocks unknown outcomes.
   This opt-in operator flag is intentionally NOT enabled automatically.
5. **Runtime observability / redaction**: Agent Run UI shows max model calls
   and a collapsible provenance ledger with retrieved source references. Model
   tool inputs are validated before execution; run-event and invocation logs
   redact common credential fields while preserving actual execution arguments.
   Logging remains a defense-in-depth filter and must not be relied on to
   sanitize arbitrary personally identifiable information. Cost is not guessed.

## Retained safety boundaries

- Existing PocketBase JWT employee authentication, tenant-scoped knowledge
  access and production data are unchanged.
- No migrations or deletion, no modification to external agent tools, no
  auto-upgrade or production service restart.
- This work does not implement DNS-rebinding-safe outbound proxy, full sandbox
  isolation for external tools, provider-actual token billing, robust fencing
  or arbitrary checkpoint replay. They are **separate P0/P1 tasks**.
- Agent and Workflow still have distinct orchestration loops. Only the common
  tool input contract is extracted here; do not claim they now share a single
  unified Scheduler/Runner.

## Verification & rollout

- `pnpm test:harness-v2` for schema, budget, evidence and integration contracts.
- `pnpm check` + `pnpm test:e2e:parallel` (real isolated PocketBase if available).
- Real isolated PocketBase tests cover bounded model calls, invalid calculator
  parameters, ambiguous external write replay prevention and secret redaction.
  Admin-forced approvals, long-lease recovery, full artifact fidelity and
  multi-user production runs still require additional UAT before rollout.
- Merge through PR + CI; deployment is explicitly a separate approved change.
- Existing Ubuntu CI timer may discover any merged main change; **do not merge
  a backend Hook change until the operator has agreed on maintenance and
  migrations**. Leave feature branch isolated for review.

## Follow-up Harness V2 milestones

P0: Central RunContext/ToolRegistry/ModelGateway interfaces, strict approval
policies, DNS + redirects egress proxy, lease renewal/fencing, trace/span IDs.
P1: Durable artifact/evidence store with hashes and provenance, exact provider
usage/cost budgets, evaluated fixture datasets and regression gates.
P2: Skills packaging, extension sandbox and controlled distributed workers.
