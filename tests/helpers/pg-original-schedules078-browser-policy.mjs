import {originalLoginPath} from './pg-original-login-browser-guard.mjs'
import {originalSchedulesRoute} from '../../services/pg-api/src/original-schedules-http-policy.ts'
export {originalLoginPath as originalSchedules078Path}
const auth='/__pg_native/api/native-auth/',root='/__pg_native/api/v2/original-ui/schedules',uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
function selector(method,raw,path){if(method!=='GET')return false;const args=new URLSearchParams(raw.split('?')[1]??'');if(raw!==path+(raw.includes('?')?'?'+args.toString():''))return false
 if(path==='/__pg_native/api/v2/original-ui/agent-catalog')return[...args.keys()].join(',')==='page,perPage,sort'&&/^[1-9][0-9]{0,5}$/.test(args.get('page')??'')&&args.get('perPage')==='50'&&args.get('sort')==='updated_desc'
 if(new RegExp('^/__pg_native/api/v2/(?:original-ui/agent-specs|model-connections)/'+uuid+'$').test(path))return!raw.includes('?')
 if(path==='/__pg_native/api/v2/model-connections')return([...args.keys()].join(',')==='limit'&&args.get('limit')==='50')||[...args.keys()].join(',')===(args.has('cursor')?'paging,limit,cursor':'paging,limit')&&args.get('paging')==='owner_cursor_v1'&&args.get('limit')==='50'&&(!args.has('cursor')||/^mcpg1\.[A-Za-z0-9_-]{80,2000}$/.test(args.get('cursor')??''))
 return false}
/** Closed fixture transport restriction. Real native API owns authorization. */
export function originalSchedules078Policy(method,raw,accept=''){
 const path=originalLoginPath(raw);if(!path)return{kind:'denied',pathname:'/invalid-path'}
 if(/^\/__(?:pb|pg)(?:\/|$)/.test(path))return{kind:'legacy_denied',pathname:path}
 if(path.startsWith('/__pg_native/')){
  if(raw.split('?',1)[0]!==path)return{kind:'api_denied',pathname:path}
  if(path===root||path.startsWith(root+'/')){try{originalSchedulesRoute(raw.slice('/__pg_native'.length),method);return{kind:'native',pathname:path}}catch{return{kind:'api_denied',pathname:path}}}
  if(raw===path&&(method==='GET'&&[auth+'me',auth+'capabilities','/__pg_native/api/v2/own-overview','/__pg_native/api/v2/own-todos'].includes(path)||method==='POST'&&[auth+'login',auth+'logout'].includes(path)))return{kind:'native',pathname:path}
  if(selector(method,raw,path))return{kind:'native',pathname:path};return{kind:'api_denied',pathname:path}
 }
 if(path==='/api'||path.startsWith('/api/')||path.startsWith('/__'))return{kind:'api_denied',pathname:path}
 if(!['GET','HEAD'].includes(method))return{kind:'denied',pathname:path}
 if(path==='/index.html'||path==='/agent-studio.svg'||path.startsWith('/assets/'))return{kind:'asset',pathname:path}
 if(['/login','/scheduled-tasks'].includes(path)&&accept.includes('text/html'))return{kind:'spa',pathname:path}
 return{kind:'denied',pathname:path}
}
