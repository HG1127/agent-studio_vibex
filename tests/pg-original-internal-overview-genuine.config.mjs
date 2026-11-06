import {defineConfig} from '@playwright/test'
import {fileURLToPath} from 'node:url'
export default defineConfig({testDir:fileURLToPath(new URL('./',import.meta.url)),testMatch:'pg-original-internal-overview-genuine.spec.mjs',workers:1,retries:0,timeout:300000,globalTimeout:600000,reporter:'line',expect:{timeout:15000},outputDir:fileURLToPath(new URL('../.tmp/original-internal-overview-playwright-transient/',import.meta.url)),use:{trace:'off',video:'off',screenshot:'off',actionTimeout:15000,navigationTimeout:20000}})
