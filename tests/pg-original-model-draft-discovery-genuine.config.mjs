import {defineConfig} from '@playwright/test'
export default defineConfig({testDir:'.',testMatch:'pg-original-model-draft-discovery-genuine.spec.mjs',timeout:300000,globalTimeout:600000,workers:1,fullyParallel:false,retries:0,reporter:'line',outputDir:'../.tmp/original-model-draft-discovery-genuine-browser-results',use:{trace:'off',video:'off',screenshot:'off'}})
