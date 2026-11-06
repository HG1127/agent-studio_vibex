import {defineConfig} from '@playwright/test'
export default defineConfig({testDir:'.',testMatch:'pg-original-schedules078-genuine.spec.mjs',timeout:600000,globalTimeout:900000,workers:1,fullyParallel:false,retries:0,reporter:'line',outputDir:'../.tmp/original-schedules078-genuine-browser-results',use:{trace:'off',video:'off',screenshot:'off'}})
