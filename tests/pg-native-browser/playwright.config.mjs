import {defineConfig} from "@playwright/test"
export default defineConfig({testDir:".",testMatch:"*.spec.mjs",workers:1,
  retries:0,timeout:180000,globalTimeout:600000,reporter:"line",expect:{timeout:15000},
  outputDir:"../../.tmp/pg-migration-completion/ci-browser-results",
  // Browser launch is manual, strictly after the CI guard in the test body.
  use:{trace:"off",video:"off",screenshot:"off",actionTimeout:15000,navigationTimeout:20000}})
