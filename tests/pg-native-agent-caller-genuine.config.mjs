import {defineConfig} from '@playwright/test'
export default defineConfig({testDir:'.',testMatch:'pg-native-agent-caller-genuine.spec.mjs',workers:1,fullyParallel:false,forbidOnly:true,retries:0,timeout:300000,expect:{timeout:20000},use:{trace:'retain-on-failure',screenshot:'only-on-failure'},reporter:[['line']],outputDir:'.tmp/pg-migration-completion/caller-browser-results'})
