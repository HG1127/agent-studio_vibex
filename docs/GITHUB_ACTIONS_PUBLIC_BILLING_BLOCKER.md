# Public GitHub Actions blocked before runner startup — verified 2026-10-15

Target: [HG1127/agent-studio_vibex](https://github.com/HG1127/agent-studio_vibex), public, `main`. Do **not** equate a queued/failed GitHub Actions job with failed PostgreSQL code.

## Observed GitHub API evidence

- [Workflow run 38678068716](https://github.com/HG1127/agent-studio_vibex/actions/runs/38678068716): all Jobs failed within a few seconds with **zero executed steps**; runner_id was 0.
- GitHub check-run annotation for Job 116236098617: `The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings`.
- GitHub REST Actions permissions endpoint: `enabled=true`, `allowed_actions=all`; repository visibility `isPrivate=false`.
- GitHub officially documents standard GitHub-hosted runners in **public repositories** as free. That pricing fact does not override a GitHub account-level payment/credit restriction surfaced by the runner provider.

## Required human-owned remediation

1. Review [GitHub Billing & Licensing](https://github.com/settings/billing) for failed/expired payment authorization, unpaid charges and any owner/account spending hold. Do **not** assume a standard runner requires purchasing minutes.
2. If Billing looks normal yet Jobs still get the same annotation, open a [GitHub Support](https://support.github.com/) ticket with the exact run URL and annotation message; ask why free public-repository Actions were blocked.
3. Re-run only after GitHub confirms the account restriction is cleared. The true PG17 TCP test must yield its own successful runner steps and **PG17_PASS** output. Running the TypeScript/PGlite suites locally is not a substitute.
4. Until real PG17 pass, source snapshot reconciliation and rollback drills are completed, formal cutover remains **NO-GO**.

## Work that can continue independently

- Code-level domain migrations W1–W7, deterministic identity crosswalks, frozen content archives, atomic importer tests, RLS and static schema checks.
- Unit SQL tests on the embedded PostgreSQL PGlite engine and ordinary TypeScript/frontend production builds.
- Prepare a migration-only development branch for review when explicitly approved. **Never auto-push directly to `main` or run against PocketBase live database or the BaoTa production server.**

Note: An existing connected Neon project was observed at PostgreSQL 18; it is not a substitute for required PostgreSQL **17** isolated, synthetic-data acceptance and should not be used without an explicitly approved clean environment.
