# PG18 autonomous Agent employee UI — 2026-10-23

Status: local candidate, production **NO-GO**. This is the employee interface for the isolated bounded standalone Agent backend. It does not switch the existing PocketBase application or authorize any deployment or paid calls.

## Employee flow

The Native workbench now has a separate **多轮 Agent** entry. An employee selects their own Agent with an enabled, tested, exact-revision model binding, supplies a task and chooses one to thirty planning rounds. The existing single-model **运行 Agent** entry is preserved. The authenticated Native API's `autonomous_agent_submission_enabled` grant controls submission and decisions; an absent, false, malformed or failed capability response cannot enable them. A lost submission response keeps the original role, instruction and round count visible and uses the same request on retry.

The employee reviews the Agent's task, role goal/scope, declared tools, knowledge-base count and round limit, then separately reviews each proposed model or tool operation. Model and summarize steps require a cost acknowledgement. Consent is keyed to the exact run, step and input digest, so it cannot carry into the next round. The UI displays the task and actual tool parameters as plain escaped text, not a raw model planning transcript. Steps and final results appear with bounded status labels. While a selected run is queued/running and visible, a two-second one-shot read refreshes only that detail; it never submits, approves or replays an effect. Reads stop when hidden, busy, awaiting approval, uncertain, terminal, failed or logged out.

Owner history remains accessible when admission is revoked. Cancellation needs a task-specific confirmation and remains available without a submission grant; the server refuses it for started/unknown effects. A refusal is not displayed as cancellation success. Paused/unknown runs have no resend button. Existing single-model history does not read the private multi-round checkpoint.

## Request and session safety

The memory-only controller coalesces double actions and freezes the Agent ID/revision, task, round limit and idempotency key after any ambiguous submission response. Retrying confirms that original body. Ambiguous approval/cancellation freezes the original run, step/hash and decision; another action cannot replace it. Owner history resolves matching approvals, an opposite committed approval, or an immutable terminal result. An unconfirmed operation is never presented as complete.

The panel remains mounted across workbench tabs. Cleanup disposes all drafts/recovery state and rejects late reads/mutations; effect setup recreates the controller for React StrictMode's cleanup/setup replay. Logout, identity changes and a Native 401 clear private workbench data and form drafts before another employee can see them. Read tickets prevent earlier refreshes from overwriting newer ones or completed mutations. No credentials, tasks, recovery keys or planning data are written to browser storage.

The only backend response change adds `max_steps` to the sanitized public autonomous checkpoint. The private graph and replay journal remain excluded. Client submission acceptance checks the expected role revision and round limit as well as run identity, task and execution mode.

## Evidence and limits

The focused interface suite passes **10/10**: seven pure controller tests, one Vite SSR static-render check and two Native Cookie/CSRF/embedded-SQL HTTP tests. They cover coalescing and frozen retries; committed submission/approval response loss; opposite/terminal resolution; owner/CSRF/queue isolation; uncertain cancellation and in-flight refusal; obsolete reads; logout/401; background detail-only reads; default-disabled controls; per-step cost consent; and escaped untrusted tool parameters. SSR is a static component check, not a browser interaction or visual acceptance claim.

Hosted Linux-only Playwright source now covers actual model → calculate → model over temporary private mTLS, lost submission response across tabs, consent reset per step, desktop/mobile screenshots, safe cancellation, delayed Alice reads after Bob login, and revoked admission. The fixture uses only synthetic employees, encrypted dummy keys and fake final model responses. Its CI guard still refuses this Windows host, root, non-hosted runs and inherited PG credentials. The new browser case is **prepared but not executed**, and no screenshot is claimed. The earlier browser extension issue and UI upload question remain unresolved; no upload authorization is inferred for this combined candidate.

The independent local branch `codex/pg18-autonomous-agent-ui-20261023`, based on `289349aad3f31666dd1f097acc20262c4d77f265`, contains **19 allowlisted files**. Its final `pnpm check` **253/253**, API types, **95-asset** production isolation, PG-only build, Native client contract **32/32**, and canonical PocketBase E2E **19/19** (**117.0 seconds**, two workers) passed. The main PocketBase baseline also passed **23/23** (**116.6 seconds**, two workers). Earlier source refs remain preserved; this later UI candidate is local and unuploaded.

Final main-worktree `pnpm check` passed **353/353**, frontend types/build and **90-asset** production isolation. The PG-only build passed after the final session and background-read changes. The read-only full migration gate remains false; these local results do not prove hosted browser behavior, real PG18/target-host operation or employee acceptance.

The React best-practices skill was applied to the new components: independent reads run together, eligibility/consent derive from current data, transient controllers live in refs, task changes use keyed resets, cleanup fences asynchronous work, controls have explicit labels and untrusted text never becomes HTML. No UI library or runtime dependency was added.

Remaining requirements include actual hosted browser/PG18 CI for this later candidate, employee HTTPS UAT, complete MCP/custom tool and other product parity, PG Workflow canvas, team knowledge/semantic ingestion, schedules/collaboration, target-host credentials and role validation, long-running Workers, backup/restore and old-site rollback. The latest read-only gate is **244 frontend files, 38 PocketBase-dependent files, 10 blocked gates, cutover=false**.
