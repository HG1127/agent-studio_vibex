import {defineConfig} from '@playwright/test'
import {fileURLToPath} from 'node:url'

export default defineConfig({
  testDir:fileURLToPath(new URL('./',import.meta.url)),
  testMatch:'pg-original-login-genuine.spec.mjs',
  workers:1,retries:0,timeout:300000,globalTimeout:600000,
  reporter:'line',expect:{timeout:15000},
  outputDir:fileURLToPath(new URL('../.tmp/original-login-genuine-browser-results/',import.meta.url)),
  // Manual browser launch only after both hosted CI and genuine fixture guards.
  use:{trace:'off',video:'off',screenshot:'off',actionTimeout:15000,navigationTimeout:20000},
})
