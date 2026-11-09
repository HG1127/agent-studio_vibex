import {defineConfig} from '@playwright/test'
export default defineConfig({testDir:'.',testMatch:'pg-original-version-release-completion-genuine.spec.mjs',timeout:300000,expect:{timeout:15000},fullyParallel:false,workers:1,retries:0,reporter:'line',outputDir:'../.tmp/original-version-release-completion-genuine-results',use:{trace:'off',video:'off',screenshot:'off'}})
