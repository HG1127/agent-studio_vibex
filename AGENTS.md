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

- The user explicitly requires **preserving the existing employee UI and
  interactions while replacing only the underlying database and backend**.
  This supersedes earlier plans to deliver the separate PG Native workbench
  as the replacement employee application.
- Use the existing `src/main.tsx -> src/App.tsx` pages, routes, navigation,
  layouts and components as the delivery baseline. Adapt authentication,
  API clients, business hooks, DTOs and status/error mapping as necessary to
  connect that UI to the PostgreSQL backend. Preserve server-verified identity,
  owner/team authorization, approvals and auditability; do not retain insecure
  legacy authentication merely for interface compatibility.
- Reuse completed PG backend/Worker work. Keep `pg18-app` and
  `src/pages/PgNativePilot` as isolated verification/reference tools; do not
  delete previous work or count their UI as acceptance of the original pages.
- Prioritize a page/action mapping from the actual existing UI to PG APIs,
  missing backend contracts and end-to-end acceptance in those same pages.
  Do not expand migration scope into UI redesign or unrelated new capabilities.
- Old PocketBase remains recoverable until explicit cutover approval. This
  strategy clarification does not authorize deployment, production database
  changes, paid provider calls, Git uploads or destructive cleanup.

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
