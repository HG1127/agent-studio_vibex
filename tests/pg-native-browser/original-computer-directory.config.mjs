import {defineConfig} from '@playwright/test'
export default defineConfig({testDir:'.',testMatch:'original-computer-directory-pg18.spec.mjs',workers:1,retries:0,timeout:180000,globalTimeout:600000,expect:{timeout:15000},reporter:'line',outputDir:'../../.tmp/ci-original-directory-results',use:{trace:'off',video:'off',screenshot:'off',actionTimeout:15000,navigationTimeout:20000}})
