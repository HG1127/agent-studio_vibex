# Desktop application startup correction — 2026-11-03

The release preserves the verified preview.16 employee UI, research platform,
LLM transport recovery, local connections, application approvals and updater.
The complete preview.16 source was recorded on this isolated branch as
`8dc4d6082401aeccc8ea123539ecbbac45df1812`, rather than rebuilding from the older
desktop release checkout or the independent PostgreSQL experiment.

## Confirmed causes

1. Electron `fork()` injected `ELECTRON_RUN_AS_NODE` after the desktop supplied
   its filtered environment. The bundled connector inherited that variable and
   passed it to WorkBuddy. The real packaged-client reproduction recorded exit
   code 9. WorkBuddy interpreted the GUI startup argument as a Node option.
   Removing this variable in an isolated copy of the same client changed the
   result from `application_launch_failed` to a verified visible window.
2. Qoder shortcuts point to a small per-user helper, with the editor installation
   in their working directory. Discovery now uses that directory to inspect the
   actual editor for a new explicit permission review. The original saved helper
   grant is not silently redirected to another executable.
3. Qoder's `.qoder-versions/*` directories contained downloaded payloads marked
   `pending-asar-v1`, including `app.asar.qoder-pending`. These are not active
   window owners. The actual running process was `D:\Qoder\Qoder.exe`; treating
   the newest downloaded directory as the window owner caused a permanent wait.
   Resolution now excludes those pending payloads.

Window identity now uses QueryFullProcessImageName with limited query access
instead of enumerating process modules. The final Qoder reproduction verified
both cold startup and the immediate subsequent window refresh.

Window list probes now use a release-time compiled x64 helper containing the
same executable/visibility policy, without starting PowerShell or loading UI
Automation/drawing assemblies. The packaged runtime requires this fixed helper;
development source retains its existing PowerShell path. The helper accepts only
bounded window-query JSON, rejects unsafe paths and unknown fields, and exposes
no control/input endpoint. Compiler and console encoding are explicit UTF-8 so
Chinese sensitive-window rules and window titles are preserved. Launch also restores a
verified minimized window and attempts foreground activation. Plain window
refreshes do not change focus, and normal/maximized window sizes are preserved.

## Changes and scope

The services entry clears Electron's injected Node-mode flag. The GUI launch
boundary independently removes Electron/Node execution and connector IPC control
variables without changing the connector's environment. Exact executable hashes,
window identity, cancellation checks, fixed arguments, per-action confirmations,
and the rule against automatic resubmission remain enforced.

Discovery uses shortcut metadata as data only. It executes no shortcut commands
and accepts no model-supplied paths or arguments. Qoder users with the old helper
grant must explicitly select the discovered editor and save the permission.

The former WinForms cold-start fixture could not detect Electron Node mode.
The packaged-client acceptance now also launches a real isolated Electron GUI,
checks its visible window, verifies browser mode and tests warm window reuse.
This check is included in the desktop release workflow. The old preview.16
installer fails the new Electron acceptance, reproducing the original defect.

Overlapping verification runs on the busy host produced native timeouts and
backend/installer startup failures. Those logs are retained and excluded from
final passing evidence. Final acceptance is serialized. The old preview.16
bootstrap installer reached its 180-second integrity-check limit; an independent
complete verification subsequently passed all 9,862 files. Update acceptance
reuses that verified isolated installation, without touching the employee install.
A first upgrade attempt stopped before replacement because that recovered test
installation lacked its generated completion marker. The marker was restored
only after the complete file verification and a fresh ASAR hash check. The real
employee installation already had its preview.16 marker; it was not modified.
Previously passed application checks were retained when resuming update tests.
Preview.20 also uses four bounded streaming workers for full installer verification
and eight for release-manifest hashing. Path, size and digest checks still run for
every entry; corruption, outside paths, missing files and aggregate failure order
are covered by regression tests. Runtime source is `e20f118b357c57b28f2b3626e8a39201e6db8ad6`;
the installer/build verification source is `8a8f1fac621043ab36f48f0965a149a8d2c7e104`.

## Validation and delivery evidence

Machine-readable final evidence is retained in the isolated release checkout's
`.tmp/verification20.json`. It distinguishes source checks, real application
startup, signed update publication, native HTTPS download, in-place restart,
configuration preservation and rollback.

Preview.17, preview.18 and preview.19 were unpublished validation candidates and are not
promoted to the update channel. Final delivery uses preview.20 and the existing signing key,
static update origin and rollback mechanism. Business services, PocketBase data,
PostgreSQL migration state and Git remotes are outside this release.

The failure-recovery exercise reached an actual installer exit code 2 before the
intentionally incorrect version could be inspected. The updater restored preview.20.
The original assertion failure (which expected only a version mismatch) is retained;
acceptance instead independently verifies every backup/restored file against the
accepted preview.20 inventory and opens the restored Electron client. This proves
installer-failure recovery and does not claim a version-mismatch rejection occurred.

## Accepted preview.20 evidence

- `pnpm check`: all 122 discovered unit files, TypeScript, production build and 119-asset PG isolation check passed.
- Desktop unit suite: 41 cases passed, including corruption, outside-path and aggregate failure checks.
- Actual installed Electron fixture: cold start, shown window, browser mode, warm reuse, verified employee identity and cancelled permission review passed.
- Actual WorkBuddy and Qoder: initially no window; launch returned ready with a non-minimized window; later refresh still returned a visible window. No app input or business task was performed.
- Actual installed preview.16 to preview.20: signed update UI, package download, same-directory replacement, restart health and configuration preservation passed. This busy-host run took about 20 minutes.
- Failure recovery: a real installer failure triggered rollback; all 9,865 original managed files and settings were restored and the preview.20 Electron window reopened. This run did not reach the separate version-mismatch check.
- Final isolated PocketBase E2E: 42/42 passed with one worker.
- Existing static update source promoted from preview.14 to preview.20 with the original Ed25519 key. Native Electron HTTPS check reported an available update and downloaded the complete package with normal TLS and pinned signature verification.
- Installer SHA-256: `f0fe2274c5cb2b60354539230e912f3aa0f5d2c3d49c843bf9eb0a04624e894d`; bytes: `275815065`.
- Signed manifest SHA-256: `d4d9da2dbba57b1ea87ad13b8076c08a5951b2f6d8d757cc73149debd27384f1`.

The employee installation was not replaced by the acceptance harness. Employees update through the application version center. Qoder users with the old helper grant must explicitly select `D:\Qoder\Qoder.exe` and save the application permission. Business services, real company databases and Git remotes were not changed.
