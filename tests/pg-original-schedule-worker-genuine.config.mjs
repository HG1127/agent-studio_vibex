import {defineConfig} from '@playwright/test'
export default defineConfig({testDir:'.',testMatch:'pg-original-schedule-worker-genuine.spec.mjs',timeout:900000,globalTimeout:1200000,workers:1,fullyParallel:false,retries:0,reporter:'line',outputDir:'../.tmp/original-schedule-worker-genuine-results',use:{trace:'off',video:'off',screenshot:'off'}})
