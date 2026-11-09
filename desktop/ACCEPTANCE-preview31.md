# Preview31: local confirmation visibility

Status: published to the existing acceptance feed; actual company-HTTPS
30-to-31 update passed. Employee EXE revalidation and the business case remain pending.

## Problem and change

The original WorkBuddy run `xgyuu8225ixb4q6`, attempt 16, stopped with
`application_confirmation_timeout`. Server approval had completed, but the
separate private local review was outside the employee's viewport. The preceding
read-only screenshot succeeded. No research was submitted.

The same private review now appears above connection management in the main
window. It shows the target computer, full operation and remaining time. A fixed
reminder returns to an offscreen/collapsed review. An open modal keeps its focus;
after it closes the review is revealed. Every new review clears consent, and the
click handler rechecks the deadline before dispatch. No automatic approval,
permission expansion or replay was added.

## Source and artifact identity

- Runtime source: `daa27bea52ab554796c2466e3ababb9f633a4d34`.
- Packaging metadata: `6c145e3780b0ba31ce00bf95e1c1644fa363d7a3`.
- Windows test isolation follow-up: `c0d44a8f3aaeb20fa9a3a0503c71bd5e7bdcd528`.
  It disables the fixture-only Vite watcher; it changes no packaged runtime.
- Desktop: `0.1.0-preview.31`; embedded connector: `0.1.0-preview.32`.
- Installer bytes: `276063429`.
- Installer SHA-256:
  `aa92f066da4e06f95089941642faa6110fcf9e978df6aefa33deb8b456f3f3d2`.
- Company CA SHA-256:
  `ac95db954c5f166dd23b032b058320b0fd20c447782e396439a508b893f03b42`.
- Existing update trust and company-origin TLS checks are retained.
  Windows Authenticode signing remains unavailable; signed update manifests are
  a separate existing mechanism.

## Observed verification, 2026-11-09

- Pristine Preview30 toolbar reproduces the offscreen review (viewport ratio 0).
- StrictMode and real Radix modal regression reproduced before the focus fix.
- Final Chrome checks pass: safe focus after modal close, preserved drafts,
  no approval from focus/Enter, reminder recovery, per-request reset, explicit
  replies, rejection of a late click with a stale timer, expiry and mobile width.
  The native IPC boundary is synthetic in this UI test.
- `pnpm check`: 126 test files, TypeScript and production build/isolation pass.
- `pnpm test:e2e:parallel`: 46/46 pass, 537.8 s, two workers, owned session removed;
  runtime source remains `daa27be` at both start and end.
- Desktop unit suite: 68/68 pass, including signature, integrity and rollback.
- Actual packaged EXE smoke passes against isolated PocketBase: built-in
  connection, verified identity, main-window private permission review, cancelled
  review leaves permissions unchanged, and settings/update entry points.
- Actual unmodified Preview30 updater upgrades to Preview31 in a disposable
  installation: tampered manifest rejected, download/hash/signature verified,
  restart and new-version health acknowledged, entire desktop configuration and
  account marker unchanged. Test installation, profile and feed are removed.
- CI for `c0d44a8f`: all nine jobs pass:
  https://github.com/HG1127/agent-studio_vibex/actions/runs/42564891407 .
- Source/docs `32c69512` also passes all nine branch CI jobs:
  https://github.com/HG1127/agent-studio_vibex/actions/runs/42565595879 .
  Its main CI bootstrap twice stopped on upstream PocketBase download 504s,
  before product tests. A CI-only official-release API fallback was then added;
  local download/checksum proof uses the same 0.40.5 Linux archive SHA-256
  `1dbea1b01eb3dfe64953513859d01e759c96650c4e3264fa4eecd54b769382e4`.
  The fallback changes no packaged runtime or update artifact.
- Final main source `51abafca` passes all nine CI jobs:
  https://github.com/HG1127/agent-studio_vibex/actions/runs/42567736568 .
- Standards/spec review and test-isolation follow-up: no outstanding findings.

## Delivery and rollback

User explicitly approved Preview31 publication on 2026-11-09. Only the existing
computer-use acceptance feed was updated:
`https://192.168.1.133:8443/desktop-updates/acceptance/computer-use-20261106/stable/latest.json`.

Published signed manifest SHA-256:
`5ace00b1d5444ed50c18812c6637b7af753ce6b99ebb8ec2c674a6d7e92e0d0a`.
The backed-up Preview30 manifest SHA-256 is
`a26b69e2d9935ad98cc58eb2139cf5fd615ee21a99a3374d1edf7ef102ea58f3`.
Publication checked that baseline, backed it up, verified the old rollback and
new immutable installers through company HTTPS, atomically replaced the signed
feed, and read it back. Backup:
`/var/backups/agentstudio-lan/desktop-artifacts-20261109T062536Z-preview31`.
The temporary server upload directory was removed after publication.
Publication failure restores the prior feed only if it still contains our
candidate. Client installation failure retains transactional rollback; a
successfully installed newer version is not silently downgraded.

The actual unmodified Preview30 updater then used this company-HTTPS feed in an
isolated installation: verified original signature and candidate hash, downloaded
the published installer, restarted to Preview31 with a successful health receipt,
and retained its entire desktop configuration and synthetic account marker.
Its installation, profile and download copy were removed; only the small receipt,
log and screenshot remain. This test did not use the employee's account/profile.

No backend restart, database change or general-channel promotion was performed.
The general channel remains Preview26. The existing
PocketBase/Worker source `dc842bd6bdab5e8aac9d10cd5386b70d8feec719` remains compatible.

The desktop release baseline now records this technically verified Preview31.
The employee's installed EXE was last observed at Preview30; its in-app update
and the original WorkBuddy research/report/source case remain **pending**.
