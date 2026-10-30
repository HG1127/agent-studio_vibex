import {defineConfig} from '@playwright/test'
export default defineConfig({testDir:'.',testMatch:'pg-native-tool-hub-genuine.spec.mjs',fullyParallel:false,workers:1,retries:0,timeout:300000,globalTimeout:600000,expect:{timeout:15000},reporter:'line',outputDir:'../.tmp/F16-19-genuine-browser-results',use:{trace:'off',video:'off',screenshot:'only-on-failure'}})
