import {requireOriginalAgentCreateFreshCi} from './pg-original-agent-create-guard.mjs'
requireOriginalAgentCreateFreshCi()
const [{createRequire},{spawnSync},{dirname,join}]=await Promise.all([import('node:module'),import('node:child_process'),import('node:path')])
const cli=join(dirname(createRequire(import.meta.resolve('@playwright/test')).resolve('playwright/package.json')),'cli.js')
const result=spawnSync(process.execPath,[cli,'install','--with-deps','chromium'],{stdio:'inherit',shell:false,windowsHide:true,timeout:600000})
if(result.error||result.status!==0)throw Error('original_agent_create_locked_chromium_install_failed')
