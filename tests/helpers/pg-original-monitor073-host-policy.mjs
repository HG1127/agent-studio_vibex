import {originalLoginPath,originalLoginRequestPolicy as basePolicy} from './pg-original-login-browser-guard.mjs'
export function originalMonitor073HostPolicy(method,raw,accept){
 const policy=basePolicy(method,raw,accept)
 if(method==='POST'&&typeof raw==='string'&&/^\/__pg_native\/api\/v2\/original-ui\/monitor-events\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/read$/.test(raw)&&originalLoginPath(raw)===raw)return{kind:'native',pathname:raw}
 return policy
}
