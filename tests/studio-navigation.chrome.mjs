/**
 * Fast isolated browser regression for unsaved SPA navigation, Back/Forward
 * history cancellation, confirmed leave and in-tab Agent draft recovery.
 *
 * Reuses the same actual independent PocketBase + Vite + Chrome setup as the
 * full Workflow smoke without repeating its unrelated 11-node graph checks.
 */
process.env.STUDIO_CHROME_NAV_ONLY = "1"
await import("./workflow-ui.chrome.mjs")
