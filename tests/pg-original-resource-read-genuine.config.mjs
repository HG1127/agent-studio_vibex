import {defineConfig} from '@playwright/test'
export default defineConfig({testDir:'.',testMatch:'pg-original-resource-read-genuine.spec.mjs',fullyParallel:false,workers:1,retries:0,timeout:300000,globalTimeout:600000,expect:{timeout:15000},reporter:'line',outputDir:'../.tmp/original-resource-read-genuine-results',use:{trace:'off',video:'off',screenshot:'only-on-failure'}})
