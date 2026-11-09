# Preview31: local confirmation visibility

Status: local technical acceptance passed; publication requires approval.

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
- Standards/spec review and test-isolation follow-up: no outstanding findings.

## Proposed delivery and rollback

Only the existing computer-use acceptance feed is proposed for Preview31:
`https://192.168.1.133:8443/desktop-updates/acceptance/computer-use-20261106/stable/latest.json`.

Prepared signed manifest SHA-256:
`5ace00b1d5444ed50c18812c6637b7af753ce6b99ebb8ec2c674a6d7e92e0d0a`.
The current Preview30 manifest SHA-256 is
`a26b69e2d9935ad98cc58eb2139cf5fd615ee21a99a3374d1edf7ef102ea58f3`.
Publication will check that baseline, back it up, verify the immutable installer
through company HTTPS, atomically replace the signed feed, then read it back.
Publication failure restores the prior feed only if it still contains our
candidate. Client installation failure retains the existing transactional
rollback. A successfully installed newer version is not silently downgraded.

No backend restart, database change or general-channel promotion is needed for
this client-only fix. The general channel remains Preview26. The existing
PocketBase/Worker source `dc842bd6bdab5e8aac9d10cd5386b70d8feec719` remains compatible.

After approval: verify an actual company-HTTPS 30→31 upgrade, update the desktop
release baseline, then resume the original WorkBuddy case in the employee EXE.
The complete research/report/source business case remains **pending**.
