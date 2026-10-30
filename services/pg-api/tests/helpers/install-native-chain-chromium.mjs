// CI-only dependency browser installation. Ordinary/local invocation refuses
// before importing child_process or resolving browser packages.
import {requireNativeLocalDeviceGenuineCi} from './native-local-device-genuine-guard.mjs'
requireNativeLocalDeviceGenuineCi()
if(!['executor','browser'].includes(process.env.AGENT_STUDIO_F20_F21_GENUINE_SUITE))throw Error('native_chain_browser_install_purpose_required')
const [{createRequire},{spawnSync},{dirname,join}]=await Promise.all([import('node:module'),import('node:child_process'),import('node:path')])
const lockedCli=entry=>join(dirname(createRequire(import.meta.resolve(entry)).resolve('playwright/package.json')),'cli.js')
const cli=new Set([lockedCli('@playwright/mcp')])
if(process.env.AGENT_STUDIO_F20_F21_GENUINE_SUITE==='browser')cli.add(lockedCli('@playwright/test'))
for(const file of cli){const result=spawnSync(process.execPath,[file,'install','--with-deps','chromium'],{stdio:'inherit',shell:false,windowsHide:true,timeout:600000});if(result.error||result.status!==0)throw Error('native_chain_locked_chromium_install_failed')}
