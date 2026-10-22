# Workflow Agent nodes — isolated local candidate

Production remains **NO-GO**. This candidate restores bounded multi-round Agent nodes within V2 Workflows. It does not claim standalone Agent runs, marketplace MCP, collaboration, semantic/team knowledge, the employee canvas or operational acceptance are complete. No company database or paid provider has been used.

## Persistent execution

An Agent node binds an exact owner role-card revision, input template and one-to-five model rounds (default three). Its optional owner model override takes precedence over the role card's model binding. Submission verifies a ready owner model and private KB references. After the employee approves the parent node, the Worker freezes the role card and digest in a bounded private Agent state. It never executes a model while initializing that state.

Each model round produces one proposed declared Tool call or a final answer. Model and Tool requests receive separate invocation keys, input hashes and employee approvals. The Worker persists each result before the next operation; a new Worker instance reconstructs the same pending request from the sealed role/input/journal. Plain-text final answers remain supported. Only the role's declared builtin tools are allowed; the model cannot add a Tool, KB scope, URL override or connection credential. Existing private Tool adapters perform approved operations. Known Tool errors and rejected Tool proposals are bounded observations for a separately approved next model round. Rejecting a model step skips the Agent; the parent Workflow can continue. Exhausting the round budget fails without a sixth model call.

Provider action summaries are not used for control flow or copied into subsequent prompts/public history/audit. Tool and knowledge observations are explicitly untrusted data. The Agent provider profile instructs one JSON decision, uses a bounded 131,072-character prompt/512-KiB request and 4096 output tokens. Ordinary Model/summary profiles retain their previous bounds. Agent observations are bounded to 4000 characters. Only the active Agent state remains in the Workflow checkpoint; completed role snapshots are archived privately with the logical parent effect, and individual operation results remain in their private ledgers. Public history exposes bounded parent/round/phase metadata, never the role snapshot, replay journal or credentials.

## Private dispatch and recovery

The existing Model/Tool mTLS request adds only an optional `parent_step_key` for Agent child operations. No prompt, employee, URL or key is accepted from the Worker. Proposed migration 027 adds two separately scoped SECURITY DEFINER identity functions for Agent model/tool children. It checks the active owner, exact live lease, Workflow/role revisions, parent approval, child approval/hash, prepared checkpoint dispatch and primary started effect. Existing direct-node identity functions are unchanged. API/Worker/Broker groups cannot call these reverse-identity functions; no table or credential grant is added.

The Broker replays and revalidates the actual Agent child request, current role snapshot, model/KB resources and both approvals before reserving its one-shot effect and decrypting owner credentials through the independent Broker pool. Its Agent scope is disabled by default, even if direct Model/Tool execution is enabled. Child model and tool identities cannot substitute for each other. Removing the parent reference or changing the input hash cannot resolve the same Agent child.

Every external operation retains the primary and secondary no-replay records. Unknown provider/socket/timeout outcomes pause the whole Workflow. A Worker or result-commit crash leaves a started record that blocks reclaim; expired ambiguity is reconciled to paused/unknown. The checkpoint stage and run status agree after reconciliation. Parent Agent completion is a local transaction, not another provider request. A known Tool validation failure is recorded as failed and can inform the next round; it is not treated as permission to retry an uncertain POST.

## Approval and deployment scope

Serving the Agent controller requires the existing explicit Worker, V2 runtime, private Model and private Tool approvals plus:

```text
AGENT_STUDIO_PG_WORKFLOW_V2_AGENTS_ENABLED=true
AGENT_STUDIO_PG_WORKFLOW_V2_AGENTS_APPROVED=APPROVE_DISPOSABLE_PG18_WORKFLOW_V2_AGENTS_ONLY
```

Worker and Broker both reject an incomplete combination. The protected Workflow client certificate and its distinct reviewed fingerprint remain mandatory. The Broker's read-only preflight verifies both new identity functions and the deterministic-failure constraint for all three independent logins. Upgrade order is reviewed 024 → 025 → 026 → proposed 027, after the separately reviewed Native Auth baseline. Source examples are not authorization to apply SQL, install units, enable Workers or make paid calls.

The Native HTTP API remains a queue/approval/history service and never starts an executor. Child approvals use the same verified Cookie/CSRF/owner boundary. Revoking V2 admission blocks new decisions; safe cancellation and history remain available. Step cursors support bounded child keys, and approval/history lists remain bounded.

## Evidence and remaining requirements

The pure Agent machine suite covers deterministic restart, result/hash/order checks, frozen role digests, declared tools, known failures/rejections, five-round bounds, raw final answers and the separate provider profile. Real embedded SQL/RLS plus temporary loopback mTLS tests cover Model → Tool → Model using a new Worker per tick, long node IDs, owner denial, private snapshot archival, identity/parent/hash/kind fences, no shared fallback, independent activation, configuration drift, unknown outcomes, result-commit failure and owner-private KB scope. All final provider responses are synthetic. Native Cookie/CSRF tests additionally exercise Agent child approval, revoked admission and paginated history through the actual client and HTTP handler.

Real PG18 restricted-login HTTPS/mTLS assertions for the same Agent flow have been added to CI source, but have **not** run remotely for this candidate. Standalone autonomous Agent runs and marketplace MCP still need integration; the PG employee canvas, complete release CI, target-host credentials/roles/TLS, employee UAT, long-running recovery, backups/restores and old-site rollback remain required. No full-migration gate is enabled.

Local checkpoint: Agent suites **11/11** (pure machine 5, real embedded SQL/private mTLS 6); focused Native HTTP/Agent/Broker checks **20/20**. Main `pnpm check` **335/335**, API types, normal 90-asset isolation and the PG-only build passed; current PocketBase E2E **23/23**, two workers, **116.9 seconds**. The independent candidate branch `codex/pg18-workflow-v2-agents-20261022`, based on Tool commit `4856b7f`, contains **35 allowlisted files**. Its own check **235/235**, API types, 95-asset isolation, PG-only build, Native auth/session/RLS **91/91**, and canonical PocketBase E2E **19/19** (**98.9 seconds**, two workers) passed. Its Agent test additionally checks active parent/hash/kind identity fences before dispatch.

The final main-worktree read-only gate remains **241 frontend files, 38 PocketBase-dependent files, 10 blocked gates, cutover=false**. This candidate remains local; prior named UI, configuration, runtime, Model and Tool refs and their upload scopes are preserved.
