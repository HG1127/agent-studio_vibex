import {originalLoginPath} from './pg-original-login-browser-guard.mjs'
export {originalLoginPath as originalModelConnectionsPath}
const prefix='/__pg_native/api/',v2=prefix+'v2/',auth=prefix+'native-auth/',uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}',model=v2+'model-connections',item=new RegExp('^'+model+'/'+uuid+'$')
const metadata=new Set([v2+'own-overview',v2+'own-todos',v2+'original-ui/agent-workspace',v2+'original-ui/agent-pending',v2+'original-ui/monitor-inbox',v2+'original-ui/agent-catalog',v2+'original-ui/home-resources'])
/** Host route restriction only. Native identity/body/CAS checks still run. */
export function originalModelConnectionsPolicy(method,raw,accept=''){
 const pathname=originalLoginPath(raw);if(!pathname)return{kind:'denied',pathname:'/invalid-path'}
 if(/^\/__(?:pb|pg)(?:\/|$)/.test(pathname))return{kind:'legacy_denied',pathname}
 if(pathname.startsWith('/__pg_native/')){
  if(raw.split('?',1)[0]!==pathname)return{kind:'api_denied',pathname}
  if(method==='GET'&&([auth+'me',auth+'capabilities',model].includes(pathname)||item.test(pathname)||metadata.has(pathname)))return{kind:'native',pathname}
  if(raw===pathname&&(method==='POST'&&[auth+'login',auth+'logout',model].includes(pathname)||['PATCH','DELETE'].includes(method)&&item.test(pathname)))return{kind:'native',pathname}
  // No provider probe, completion, draft test, run or secret endpoint is served.
  return{kind:'api_denied',pathname}
 }
 if(pathname==='/api'||pathname.startsWith('/api/')||pathname.startsWith('/__'))return{kind:'api_denied',pathname}
 if(!['GET','HEAD'].includes(method))return{kind:'denied',pathname}
 if(pathname==='/index.html'||pathname==='/agent-studio.svg'||pathname.startsWith('/assets/'))return{kind:'asset',pathname}
 if(['/login','/model-connections'].includes(pathname)&&typeof accept==='string'&&accept.includes('text/html'))return{kind:'spa',pathname}
 return{kind:'denied',pathname}
}
