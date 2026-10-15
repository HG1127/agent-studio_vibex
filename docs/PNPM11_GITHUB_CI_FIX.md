# GitHub Actions CI diagnostics — Public runner / pnpm 11 (2026-10-15)

**Migration production status remains NO-GO.** This note records actual CI runs and the precise fix; neither result is evidence of successful PostgreSQL data cutover.

## Verified change of blocker

- Earlier run [38678068716](https://github.com/HG1127/agent-studio_vibex/actions/runs/38678068716) failed with **zero runner steps** because the GitHub account was rejected by Billing / spending state. The repository was and remains Public.
- The new migration branch run [38686102450](https://github.com/HG1127/agent-studio_vibex/actions/runs/38686102450) **obtained actual Ubuntu runners and executed dependency install steps**. The earlier account Billing error therefore did not block this run.
- The second run failed before running useful PostgreSQL assertions. For example, its `test:stage-history-import` job log reported `ERR_PNPM_IGNORED_BUILDS` during pnpm 11's implicit dependencies status check, listing `@parcel/watcher`, `@swc/core`, `core-js`, `less` and `protobufjs`.
- The original `pnpm-workspace.yaml` contained unreviewed literal placeholders `set this to true or false` for those dependencies. With pnpm 11 `strictDepBuilds: true` this is not a valid security approval.

## Implemented narrow CI fix (without weakening supply-chain trust globally)

- Changed each of those five dependencies to an explicit **false** under `allowBuilds`: no dependency lifecycle scripts are automatically approved. If a later build proves a particular trusted native package genuinely needs its lifecycle script, it must be reviewed and approved separately, not given a blanket grant.
- Set `verifyDepsBeforeRun: warn` in root `pnpm-workspace.yaml`: CI already performs explicit locked installs; `pnpm run` should not re-execute `pnpm install` on every test invocation and fail on unresolved build approvals.
- Added `tests/pnpm-ci-policy.test.mjs` and wired it into root tests. A separate workflow path trigger includes `pnpm-workspace.yaml` changes.
- Did **not** enable `dangerouslyAllowAllBuilds` or turn off `strictDepBuilds`, did not touch BaoTa/PocketBase/production databases or enable scheduled workflows.

## Next acceptance requirement

Only a *new* GitHub run that really executes `pg17-tcp-isolated` and returns successful TCP SQL / JWT / RLS / worker fencing evidence may satisfy the real PostgreSQL 17 barrier. If pnpm dependency scripts remain a blocker, inspect the new runner logs; do not turn on all lifecycle scripts to hide the issue.

Local PGlite tests and build are separate. The migration development branch is independent from `main`; production cutover remains **NO-GO**.
