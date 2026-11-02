# Desktop version center — preview.14

Date: 2026-11-02. Baseline: verified unified preview.13 (`acb5baddf192f2d7424b74a49fb8dbfd2ae4d102`). Implementation: `36a005624b60a0b9de08c70638581f4de319bc02`.

## Delivered behavior

- The existing avatar/menu update entry opens one native version center with update overview, release history and update settings.
- Current/latest versions, publication date, release title and grouped change notes are visible. History highlights the installed version and expands per release.
- Bundled history covers the verified unified preview.12–14 releases and remains readable offline. Online history/title are part of the signed schema-1 manifest; all text uses DOM text nodes.
- Download progress includes bytes and percentage. Explicit download/restart confirmation, pinned signing key, same-directory installation and failure recovery remain in place. A task blocking restart retains the verified download for retry.
- The right pane scrolls independently and the window fits the active display work area. No new runtime dependencies or changes to employee business pages.

## Source checks

- `pnpm check`: PASS. Initial high-concurrency build encountered local memory pressure; the complete retry passed with `RAYON_NUM_THREADS=2`, `UV_THREADPOOL_SIZE=2`, `GOMAXPROCS=2` and a bounded Node heap.
- `pnpm test:e2e:parallel`: PASS, 34/34 isolated PocketBase/SQLite cases, two workers, temporary data removed.
- `node --test --test-concurrency=2 desktop/tests/*.test.cjs`: PASS, 40 tests, including manifest/history validation and old payload-size limits, tampering, state preservation, display sizing and rollback.
- `node desktop/tests/update-window.chrome.mjs`: PASS for actual HTML/CSS/JS rendering and interaction with an explicit fixture bridge. Covers progress, current-version notes, history, blocked install retry, error actions, preserved settings drafts, hostile text and long notes at 1000/780/560 px. This fixture does not count as actual package upgrade acceptance.
- `node desktop/tests/packaged-smoke.mjs … --system-temp --desktop-entry-smoke`: PASS on the full preview.14 installer, isolated employee identity/PocketBase and a dedicated install directory. Verified embedded connection, real file job, denied unapproved jobs, inline permission review and cancelled-review preservation.
- `node desktop/tests/native-settings.windows.mjs …`: PASS on the installed preview.14 application. Verified actual private preloads, grouped notes/history, work-area bounds, window reuse and eventual close. Captured actual native overview/history screenshots.
- Package/source comparison: PASS for 15 desktop and connector files, including the complete updater UI and bundled history.
- `node desktop/tests/updates.windows.mjs … --from=0.1.0-preview.13 --to=0.1.0-preview.14`: PASS for actual old-client compatibility, tampered-signature rejection, full package download, same-directory upgrade, automatic restart/health proof and preserved account settings. Installation transaction completed in 423 seconds. The initial concurrent run stopped at an ancillary screenshot timeout before installation; the retry brought the test window to front and passed.
- `node desktop/tests/update-rollback.windows.mjs …`: PASS after applying a deliberately mislabeled but validly signed older installer in the same isolated installation. Rejected the internal version mismatch, restored the original preview.14 program bytes, preserved employee settings and restarted preview.14.
- Updated release-baseline guard tests: PASS, 3/3. Future desktop builds require the verified preview.14 implementation ancestor.

## Maintaining release notes

For each future release, add a dated/versioned record to `desktop/release-history.json`, with a short title and grouped change notes. Keep verified historical entries; history is bounded to twelve versions and trimmed to the existing updater's signed-payload size limit. The publisher signs this metadata with the existing pinned release key. A Git merge by itself does not publish an update: complete validation, build the release payload, and publish the signed channel manifest.

## Delivery boundaries

Only the existing desktop update static directory is in scope for publication. No business API, Worker, database, personal installation or Git remote is changed by these acceptance tests. WorkBuddy research execution is a separate unfinished acceptance case and is not claimed by this release.

## Published update

- Version: `0.1.0-preview.14`; 217,432,946 bytes; SHA-256 `ffddc224f2fa73ac00e55bbf7b8dd98020c6216603b21c5fdb373b68715bfe0f`.
- Existing company update channel: `https://192.168.1.133:8443/desktop-updates/stable/latest.json`.
- Atomic publication checked that preview.13's manifest was unchanged, retained a backup, then promoted only the independent desktop update files. No Nginx/service reload was needed.
- Live Windows Electron HTTPS verification: PASS, normal certificate validation, existing pinned public key, three signed history entries and full installer download matching byte count/SHA-256.
- Safe evidence and actual native screenshots are retained under the canonical release checkout's `.tmp/release14-acceptance/`. Private signing material, test profiles and databases are excluded.
- Employees use the existing avatar **检查更新 → 重新检查 → 下载更新 → 重启更新** flow. The personal installation is left for the employee's native restart confirmation.
