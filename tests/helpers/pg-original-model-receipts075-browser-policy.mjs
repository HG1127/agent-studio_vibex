import {originalLoginPath} from './pg-original-login-browser-guard.mjs'
export {originalLoginPath as originalModelReceipts075Path}
const auth='/__pg_native/api/native-auth/',v2='/__pg_native/api/v2/',model=v2+'model-connections',ops=v2+'model-config-operations',uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}',item=new RegExp('^'+model+'/'+uuid+'$'),receipt=new RegExp('^'+ops+'/'+uuid+'$'),metadata=new Set([v2+'own-overview',v2+'own-todos',v2+'original-ui/agent-workspace',v2+'original-ui/agent-pending',v2+'original-ui/monitor-inbox',v2+'original-ui/agent-catalog',v2+'original-ui/home-resources'])
export function originalModelReceipts075Policy(method,raw,accept=''){
 const pathname=originalLoginPath(raw);if(!pathname)return{kind:'denied',pathname:'/invalid-path'}
 if(/^\/__(?:pb|pg)(?:\/|$)/.test(pathname))return{kind:'legacy_denied',pathname}
 if(pathname.startsWith('/__pg_native/')){
  if(raw.split('?',1)[0]!==pathname)return{kind:'api_denied',pathname}
  if(method==='GET'&&([auth+'me',auth+'capabilities',model].includes(pathname)||item.test(pathname)||receipt.test(pathname)||metadata.has(pathname))){if(pathname.startsWith(ops)&&raw!==pathname)return{kind:'api_denied',pathname};return{kind:'native',pathname}}
  if(raw===pathname&&method==='POST'&&[auth+'login',auth+'logout',ops].includes(pathname))return{kind:'native',pathname}
  // Old mutation endpoints, draft/saved provider tests, runs and secrets denied.
  return{kind:'api_denied',pathname}
 }
 if(pathname==='/api'||pathname.startsWith('/api/')||pathname.startsWith('/__'))return{kind:'api_denied',pathname}
 if(!['GET','HEAD'].includes(method))return{kind:'denied',pathname}
 if(pathname==='/index.html'||pathname==='/agent-studio.svg'||pathname.startsWith('/assets/'))return{kind:'asset',pathname}
 if(['/login','/model-connections'].includes(pathname)&&typeof accept==='string'&&accept.includes('text/html'))return{kind:'spa',pathname}
 return{kind:'denied',pathname}
}
