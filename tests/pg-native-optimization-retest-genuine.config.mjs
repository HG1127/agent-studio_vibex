import {defineConfig} from '@playwright/test'
export default defineConfig({testDir:'.',testMatch:'pg-native-optimization-retest-genuine.spec.mjs',workers:1,retries:0,timeout:300000,expect:{timeout:20000},outputDir:'../.tmp/pg-migration-completion/f29-retest-browser-results',use:{trace:'retain-on-failure',screenshot:'only-on-failure'},reporter:'list'})
