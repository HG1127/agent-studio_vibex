import {defineConfig} from '@playwright/test'
export default defineConfig({testDir:'.',testMatch:'pg-original-version-release-genuine.spec.mjs',timeout:360000,globalTimeout:600000,workers:1,fullyParallel:false,retries:0,reporter:'line',outputDir:'../.tmp/original-version-release-genuine-browser-results',use:{trace:'off',video:'off',screenshot:'off'}})
