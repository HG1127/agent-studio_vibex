# Local file action implementation — 2026-10-29

Scoped runtime/authorization slice implemented in this standalone worktree. The
host owns the computer workspace UI, final integration, checks and packaging.
Contract: [LOCAL_FILE_ACTION_CONTRACT_20261029.md](LOCAL_FILE_ACTION_CONTRACT_20261029.md).

## Result

- Added stat, bounded optimistic update, mkdir, single-file copy/move, app-managed
  trash/list/restore, and inert-document open / Explorer reveal. Existing
  files.read/list/write names and read/create semantics remain available.
- Root `capabilities` has exactly edit/move/delete/open boolean flags, defaulting
  to false. Old writable roots gain only the new create operations (mkdir/copy).
  Read-only and file-only scopes cannot mutate; an explicitly selected file can
  receive open without granting its parent or neighbours.
- Drafts, local manager routes, native review, permission summaries, backend
  controls and workbench controls carry the same flags. Existing non-default
  flags cannot be erased by an older draft/control that omits them. Unsupported
  older control implementations reject new payload fields. Permission-management
  operations remain outside the model tool catalog.
- Workbench edits individual flags, resets the permission draft when changing
  device/account/selection, clears mutation flags when switching to read-only,
  and blocks stale draft versions. Lost grant-edit receipts reconcile the root,
  read_only and **every capability**, rather than read_only alone.
- Changes to permissions or the selected workspace update the execution revision.
  Queued jobs carrying the previous revision fail closed. Backend ownership,
  verified employee identity, expiry, control claim and commit fence remain in use.
- Destructive operations capture and verify a flushed recovery copy and prepared
  receipt before the source effect. Completed/uncertain/restored receipts retain
  the original. A partial move reports uncertainty and a recovery ID, never success
  or an automatic retry. Copies and restores use exclusive destination creation.
- Generic file/office resolution rejects the vault, private filenames, traversal,
  symlinks/junctions and hardlinked files. Vault metadata/data are untrusted:
  bounded schema, canonical original relative path, content hash and confinement
  are rechecked. Restore has no caller-selected destination and never overwrites.
- In-process file effects serialize across overlapping grants. Parents are
  revalidated and cancellation is checked before effects. Catalog roots are
  tool-specific; tools remain limited to 50 and outputs remain bounded. Long
  lists return valid JSON with truncation indicated.

## Validation evidence

Final focused run: **75 passed, 0 failed, 0 skipped** (Node 24.14.1, Windows).

```text
node --test tests/local-file-actions.test.mjs tests/local-file-permissions.test.mjs tests/local-permissions.test.mjs tests/workbench-control-recovery.test.mjs tests/permission-editor-ux.test.mjs tests/permission-entry.test.mjs tests/local-device-usability.test.mjs tests/local-office.test.mjs
node node_modules/typescript/bin/tsc -b --pretty false
```

Both commands completed successfully: **75/75 focused tests passed; TypeScript
build check exited 0**.

The 26 new tests exercise defaults, per-tool eligible roots, file/read-only scopes,
unknown keys/boolean types, owner scoping, UTF-8 and digest bounds, traversal/private
areas, stale revisions, conflict/no overwrite, update recovery, trash/restore,
malformed and linked vaults, cross-root IDs, replaced restore parents, concurrent
updates, cancellation before and after recovery capture, partial move uncertainty,
open type restrictions and literal fixed executable invocation. Existing focused
regressions cover native control claim/expiry/owner checks, lost responses,
office creation and unchanged legacy read/create behavior.

All write/edit/move/delete tests use newly created disposable folders; backend
tests use in-memory SQLite. Existing connection preparation tests stub pairing.
Native picker/confirmation and OS file opening are adapters or stubs; no real
pairing, document launch, paid model call or production database was used.
The dependency reader required sandbox elevation to run installed dependencies.

## Limits and host integration

- Host integration now includes a real Chrome UI, isolated PocketBase backend and
  disposable local file runtime. The 2026-10-29 integration run passed **9 UI/backend
  checks**, including read, edit, move/rename, copy, recoverable delete/restore,
  external-change conflict protection, lost-receipt deduplication, responsive
  layouts and the in-workbench permission shortcut. No user files, paid models or
  native application launch were used.
- Actual Windows document associations, Explorer window state and native confirmation
  dialogs are **not** proven by that browser fixture; it explicitly avoids launching
  native apps. The package-level Windows smoke test covers file/Office/Chrome runtime
  availability but does not claim a clean-machine or code-signing acceptance.
- Stat digests and binary copy/move/trash are bounded to 8 MiB; update source and
  replacement are bounded to 64 KiB valid UTF-8. Existing files.read still has the
  12,000-character output bound. The host must verify the loaded text's SHA256
  against stat before offering whole-file editing; truncated/BOM-normalized text
  cannot be silently saved as the entire original.
- No directory move/delete, recursive deletion, arbitrary restoration path,
  executable/script/HTML/SVG/macro opening, free-form apps.launch or Windows
  Recycle Bin integration. Reveal only selects a regular file. Open paths with
  quotes/commas are conservatively refused by the Windows invocation adapter.
- Move is a verified exclusive copy followed by guarded source unlink; it is not
  an atomic OS rename. Failure between these effects can leave both copies and
  produces an uncertain receipt. Updates are guarded in-place writes with a
  retained original; they are not crash-atomic file replacements.
- The vault is hidden from ordinary application tools, with best-effort private
  filesystem modes. This is not a Windows ACL sandbox, a cryptographically
  authenticated archive, or isolation against hostile external OS races. It has
  no automatic cleanup. Update/move recovery copies are retained for native
  inspection; files.restore deliberately exposes only completed trash entries.
  Interrupted prepared/uncertain receipts require native inspection, not replay.
- Backend and connector control schema changes must be integrated together before
  testing the new controls. Existing unmodified connectors/configurations are
  not automatically upgraded or granted capabilities.

## Files changed by this slice

Runtime and native permissions:

```text
local-executor/file-actions.mjs                     (new)
local-executor/file-capabilities.mjs                (new)
local-executor/runtime.mjs
local-executor/connection.mjs
local-executor/config.example.json
local-executor/setup.mjs
local-executor/workspace.mjs
local-executor/permissions.mjs
local-executor/workbench-control.mjs
local-executor/profiles.mjs
local-executor/desktop.mjs
local-executor/ui/permission-panel.js
local-executor/ui/app.js                           (permission summary only)
pocketbase/pb_hooks/modules/local_devices.js
pocketbase/pb_hooks/modules/workbench_controls.js
src/lib/workbenchPermissions.ts
src/components/tool-hub/DeviceWorkspaceScope.tsx
tests/local-file-actions.test.mjs                   (new, 18 tests)
tests/local-file-permissions.test.mjs               (new, 8 tests)
tests/local-device-usability.test.mjs               (workspace revision assertion)
docs/LOCAL_FILE_ACTION_CONTRACT_20261029.md          (new)
docs/LOCAL_FILE_ACTION_IMPLEMENTATION_20261029.md    (this report)
```

Previous dirty changes were preserved. No edits to LocalDevicesPanel.tsx,
DeviceQuickCheck.tsx, localDeviceActions.ts, or ComputerFileWorkspace files were
made by this slice. No version/package/ZIP build, commit, push, deploy, active
preview10 stop/reconfiguration, or real profile/permission/database change was
performed.
