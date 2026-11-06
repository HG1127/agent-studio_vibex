import {defineConfig} from '@playwright/test'
export default defineConfig({testDir:'.',testMatch:'pg-original-agent-run-queued-genuine.spec.mjs',timeout:300000,globalTimeout:600000,workers:1,fullyParallel:false,retries:0,reporter:'line',outputDir:'../.tmp/original-agent-run-queued-genuine-browser-results',use:{trace:'off',video:'off',screenshot:'off'}})
