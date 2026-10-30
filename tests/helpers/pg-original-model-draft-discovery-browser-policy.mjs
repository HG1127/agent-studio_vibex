import {originalLoginPath} from './pg-original-login-browser-guard.mjs'
export {originalLoginPath as originalModelDraftDiscoveryPath}
const prefix='/__pg_native/api/',v2=prefix+'v2/',auth=prefix+'native-auth/',model=v2+'model-connections',uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}',item=new RegExp('^'+model+'/'+uuid+'$')
const metadata=new Set([v2+'own-overview',v2+'own-todos',v2+'original-ui/agent-workspace',v2+'original-ui/agent-pending',v2+'original-ui/monitor-inbox',v2+'original-ui/agent-catalog',v2+'original-ui/home-resources'])
function modelReadQuery(raw,pathname){
 if(raw===pathname)return true
 const url=new URL(raw,'https://localhost'),q=url.searchParams
 if(raw!==pathname+'?'+q.toString())return false
 if([...q.keys()].some(k=>!['paging','limit','cursor'].includes(k)||q.getAll(k).length!==1))return false
 if(q.get('limit')==='50'&&q.size===1)return true // actual old partial fallback; no complete-list claim
 if(q.get('paging')!=='owner_cursor_v1'||!/^([1-9]|[1-4][0-9]|50)$/.test(q.get('limit')??''))return false
 const cursor=q.get('cursor');return cursor===null||cursor.length<=2048&&/^mcpg1\.[A-Za-z0-9_-]{80,2000}$/.test(cursor)
}
/** Dedicated host restriction; actual Native Cookie/body/owner checks stay inside. */
export function originalModelDraftDiscoveryPolicy(method,raw,accept=''){
 const pathname=originalLoginPath(raw);if(!pathname)return{kind:'denied',pathname:'/invalid-path'}
 if(/^\/__(?:pb|pg)(?:\/|$)/.test(pathname))return{kind:'legacy_denied',pathname}
 if(pathname.startsWith('/__pg_native/')){
  if(raw.split('?',1)[0]!==pathname)return{kind:'api_denied',pathname}
  if(method==='GET'&&pathname===model&&modelReadQuery(raw,pathname))return{kind:'native',pathname}
  if(method==='GET'&&metadata.has(pathname))return{kind:'native',pathname}
  if(raw===pathname&&method==='GET'&&([auth+'me',auth+'capabilities',model].includes(pathname)||item.test(pathname)))return{kind:'native',pathname}
  if(raw===pathname&&method==='POST'&&[auth+'login',auth+'logout',model,model+'/draft-probe'].includes(pathname))return{kind:'native',pathname}
  return{kind:'api_denied',pathname}
 }
 if(pathname==='/api'||pathname.startsWith('/api/')||pathname.startsWith('/__'))return{kind:'api_denied',pathname}
 if(!['GET','HEAD'].includes(method))return{kind:'denied',pathname}
 if(pathname==='/index.html'||pathname==='/agent-studio.svg'||pathname.startsWith('/assets/'))return{kind:'asset',pathname}
 if(['/login','/model-connections'].includes(pathname)&&typeof accept==='string'&&accept.includes('text/html'))return{kind:'spa',pathname}
 return{kind:'denied',pathname}
}
