# Agent Studio — Independent Standalone Fork

This source tree is the **independent** Agent Studio application. It is no longer
the original VibeX/RunningHub source export, and must not be uploaded back to
the original running VibeX app.

## Architecture

- React, TypeScript, Vite frontend with its own standalone employee login.
- PocketBase 0.40.5 + SQLite and dedicated Node Agent/Workflow Worker remain
  the current runtime. Never send arbitrary `X-Rh-User-Id` as authentication;
  server-side validation must use the verified `studio_users` identity.
- PostgreSQL 17/pgvector is a **separate isolated experimental migration**.
  Do not switch production flows or mutate real company data without explicit
  authorization, backups, migration maps, and GO/NO-GO verification.
- Team knowledge ACL, semantic RAG, delegated approvals, and Agent collaboration
  must retain owner scoping, server-side checks, and auditability.

## Migration delivery strategy — user clarification 2026-10-30

- Preserve the existing employee UI and interactions while replacing only the underlying database and backend. Use `src/main.tsx -> src/App.tsx` pages, routes, navigation, layouts and components as the delivery baseline.
- Adapt authentication, API clients, hooks and DTOs while retaining verified identity, owner/team authorization, approvals and auditability. Reuse completed PG backend/Worker work, but keep `pg18-app` and `src/pages/PgNativePilot` isolated as reference tools.
- Old PocketBase remains recoverable until explicit cutover approval. This strategy does not authorize deployment, production database changes, paid provider calls, Git uploads or destructive cleanup.

## Unified desktop release baseline — user direction 2026-11-02

- Integrate all verified desktop features before delivery. Start subsequent desktop, connector and employee UI release work from the latest verified local `main` or `codex/desktop-release`; the persistent worktree is `.worktrees/desktop-release`. Archived preview.9/.10/.11 worktrees are historical evidence, not new feature baselines.
- `desktop/release-baseline.json` records mandatory verified ancestor commits. Run `node ops/verify-desktop-release-baseline.mjs` before building; do not remove or bypass this check to package an older branch. Advance the verified ancestor baseline after each accepted release.
- Preserve both application cold-start/task execution and in-app update/rollback capabilities. A higher version number does not imply another parallel branch is included: merge, test and audit the actual sources.
- Preserve `desktop/update-trust.json` and its matching release signing key across builds; never casually generate a replacement key. Never commit or distribute the private key. Published same-version artifacts remain immutable.
- Unfinished PostgreSQL migration work remains isolated until its own verified integration and cutover authorization. This instruction does not authorize Git uploads or business-service/database deployments.

## Testing

Run `pnpm check` (unit tests, TypeScript, build) and `pnpm test:e2e:parallel`
(19 real isolated PocketBase/SQLite E2E tests, two workers by default).
The original `pnpm test:e2e` remains a serial fallback. If Windows C: has
no temporary disk space, set TEMP/TMP/TMPDIR to a dedicated writable folder on
the project drive; do not remove unrelated user/system files.

## Safety for Git and deployment

- NEVER commit `.env*` secrets, API keys, private credentials, PocketBase
  `pb_data`, SQLite DB/WAL, worker secrets, local binaries or generated ZIP
  deliverables. See `.gitignore`.
- Standalone launch/deployment templates are source examples, not permission to
  deploy. Production status remains NO-GO until real employee UAT, networking,
  access control, backups, and long-running Worker validation.
- Do not force push or rewrite an existing remote branch without authorization.
- Do not claim a GitHub push succeeded until the remote acknowledges its ref.
