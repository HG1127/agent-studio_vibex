import {originalLoginPath} from './pg-original-login-browser-guard.mjs'
export {originalLoginPath as originalHomeDesignPath}
const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
const prefix='/__pg_native/api/',auth=prefix+'native-auth/',v2=prefix+'v2/'
const reads=new Set([auth+'me',auth+'capabilities',v2+'model-connections',v2+'own-overview',v2+'own-todos',
 v2+'original-ui/agent-specs',v2+'original-ui/agent-catalog',v2+'original-ui/home-resources',
 v2+'original-ui/agent-workspace',v2+'original-ui/agent-pending',v2+'original-ui/monitor-inbox'])
const readItem=new RegExp('^'+v2+'(?:original-ui/agent-specs/|agent-design/(?:sources|requests)/)'+uuid+'$')
/** Pure host restrictions. Actual Native handlers still validate all queries. */
export function originalHomeDesignPolicy(method,raw,accept=''){
 const pathname=originalLoginPath(raw)
 if(!pathname)return{kind:'denied',pathname:'/invalid-path'}
 if(/^\/__(?:pb|pg)(?:\/|$)/.test(pathname))return{kind:'legacy_denied',pathname}
 if(pathname.startsWith('/__pg_native/')){
  if(raw.split('?',1)[0]!==pathname)return{kind:'api_denied',pathname}
  if(method==='GET'&&(reads.has(pathname)||readItem.test(pathname)))return{kind:'native',pathname}
  if(raw===pathname&&(method==='POST'&&[auth+'login',auth+'logout',v2+'agent-design/preview',v2+'agent-design/submit',v2+'agent-design/confirm',v2+'original-ui/agent-specs'].includes(pathname)||method==='PATCH'&&new RegExp('^'+v2+'original-ui/agent-specs/'+uuid+'$').test(pathname)))return{kind:'native',pathname}
  return{kind:'api_denied',pathname}
 }
 if(pathname==='/api'||pathname.startsWith('/api/')||pathname.startsWith('/__'))return{kind:'api_denied',pathname}
 if(!['GET','HEAD'].includes(method))return{kind:'denied',pathname}
 if(pathname==='/index.html'||pathname==='/agent-studio.svg'||pathname.startsWith('/assets/'))return{kind:'asset',pathname}
 if(['/','/login'].includes(pathname)&&typeof accept==='string'&&accept.includes('text/html'))return{kind:'spa',pathname}
 return{kind:'denied',pathname}
}
