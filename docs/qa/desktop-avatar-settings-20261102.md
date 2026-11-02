# Desktop avatar settings and application discovery — 2026-11-02

The candidate is based on unified desktop preview.12 (`519ca570`), with desktop
preview.13 and connector preview.21 metadata. Existing cold-start/application
task support and the pinned-key update/rollback implementation remain included.

## Employee behavior

- The lower-left avatar opens an accessible account menu with Settings and,
  in the desktop app, Check for updates. The collapsed sidebar keeps this menu.
- Settings opens inside the employee UI and links to account/security, computer
  authorizations, the native server settings window and the native updater.
- Opening the updater does not download or install a release. Installation
  continues to require the existing explicit restart confirmation.
- Older desktop bridges show the existing native-menu fallback instead of
  pretending that an unsupported IPC call succeeded. The web account menu
  retains its existing account/security and administrator links.

## Application findings and changes

WorkBuddy 5.9.3 was registered with an uninstall `DisplayIcon` entry, but had
no CLI on PATH. The previous discovery omitted that installation source and
limited results to 120 applications. Discovery now reads bounded install and
shortcut metadata, accepts only local executable icon paths, and still validates
and pins an executable when the employee explicitly grants it. Discovery never
executes candidates or uninstall commands. The real metadata scan returned 138
grantable applications, including WorkBuddy, without hashing every binary.

A WorkBuddy accessibility document URL contained an internal token query
parameter. Model-visible window titles, control names and values now mask common
credential query parameters. Raw identity data stays local for exact control
revalidation; the change does not weaken approval or observation expiry checks.

## Verification evidence

- `pnpm check`: full unit inventory, TypeScript and production build.
- `pnpm test:e2e:parallel`: real isolated PocketBase integration suite. Busy
  Windows cleanup artifacts are retained and explicitly reported; their cleanup
  status does not hide the individual test outcomes.
- `node --test desktop/tests/*.test.cjs`: desktop, updater and boundary tests.
- `desktop/tests/connection-flow.integration.mjs`: original employee pages,
  real isolated backend/connector and avatar/settings interactions; native
  window-opening requests are recorded by explicit test adapters in this test.
- `desktop/tests/packaged-smoke.mjs --desktop-entry-smoke`: optional isolated
  packaged-app checks open the actual native settings and updater windows through
  the production preload. The updater must remain idle and report its own version.
- `desktop/tests/updates.windows.mjs`: isolated previous-to-current update with
  the actual installer, signature checks, same installation directory, restart
  health evidence and preservation of an account/configuration sentinel.

Final local results: 761 unit tests, TypeScript and production build passed;
34 desktop tests and all 34 E2E cases passed. The avatar/settings browser flow,
packaged startup/verified employee/file-job checks, actual native settings and
updater entry checks, and real preview.12 → preview.13 upgrade all passed.
The upgrade returned healthy at 384 seconds and retained the test configuration.
Native-window closure is asynchronous: the dedicated native-settings test polls
until only the main window remains, rather than relying on an immediate count.
Ten packaged native/connector source files matched the corresponding source bytes.

The signed update artifact is 217,423,082 bytes with SHA-256
`7da02501b6f0226ad72a3159f1ccde12faae9cf7f834aba6e876f0305200f81d`.
The existing LAN static update channel was advanced from preview.12 to preview.13
after checking the previous manifest hash, backing it up, and verifying the new
files. Existing employees use the native update menu once; the upgraded version
then exposes the new avatar entries. No employee app restart was forced.

## WorkBuddy business-case status

The requested public AI-workbench design research has **not** been submitted or
accepted as complete. Direct accessibility assignment displayed the prompt while
Send remained disabled. Screenshot/focus operations subsequently failed with
`window capture timed out` / `FrameArrived timed out`, including a fresh window
binding after activation. No result or quota consumption was confirmed.

This case therefore does not prove Agent Studio task submission, model planning,
research completion or report retrieval in WorkBuddy. The discovery fix and
settings acceptance must not be presented as that business-case acceptance.
The pending task still needs a working computer-control channel, actual approved
product dispatch, an application completion receipt and an independently readable
report with checked public sources. Do not repeat an uncertain send operation.
