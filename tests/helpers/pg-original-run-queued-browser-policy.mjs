import {originalLoginPath} from './pg-original-login-browser-guard.mjs'
export {originalLoginPath as originalRunQueuedPath}
const prefix='/__pg_native/api/',v2=prefix+'v2/',auth=prefix+'native-auth/',uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
const collections=['runs','workflow-runs','workflow-v2-runs','agent-autonomous-runs'],metadata=new Set(['own-overview','own-todos','original-ui/agent-workspace','original-ui/agent-pending','original-ui/monitor-inbox','original-ui/agent-catalog','original-ui/home-resources'].map(v=>v2+v))
function modelQuery(raw,p){if(raw===p)return true;const q=new URL(raw,'https://localhost').searchParams;if(raw!==p+'?'+q.toString()||[...q.keys()].some(k=>!['paging','limit','cursor'].includes(k)||q.getAll(k).length!==1))return false;if(q.size===1&&q.get('limit')==='50')return true;return q.get('paging')==='owner_cursor_v1'&&q.get('limit')==='50'&&(q.get('cursor')===null||/^mcpg1\.[A-Za-z0-9_-]{80,2000}$/.test(q.get('cursor')))}
function stepsQuery(raw,p){const q=new URL(raw,'https://localhost').searchParams;return raw===p+'?'+q.toString()&&[...q.keys()].join(',')==='limit,after'&&q.get('limit')==='100'&&/^(|wf2_[0-9]{5}_[A-Za-z0-9_-]{1,100})$/.test(q.get('after')??'!')}
export function originalRunQueuedBrowserPolicy(method,raw,accept='',story='original-agent-run-queued'){
 const p=originalLoginPath(raw);if(!p)return{kind:'denied',pathname:'/invalid-path'}
 if(/^\/__(?:pb|pg)(?:\/|$)/.test(p))return{kind:'legacy_denied',pathname:p}
 if(p.startsWith('/__pg_native/')){
  if(raw.split('?',1)[0]!==p)return{kind:'api_denied',pathname:p}
  if(method==='GET'){
   if(p===v2+'model-connections'&&modelQuery(raw,p))return{kind:'native',pathname:p}
   if(raw===p&&metadata.has(p)||p===v2+'original-ui/agent-workspace'&&raw===p+'?limit=12')return{kind:'native',pathname:p}
   if(p===v2+'original-ui/agent-specs'&&raw===p+'?limit=50')return{kind:'native',pathname:p}
   if(p===v2+'agent-memories'){const q=new URL(raw,'https://localhost').searchParams;if(raw===p+'?'+q.toString()&&[...q.keys()].join(',')==='spec_id'&&new RegExp('^'+uuid+'$').test(q.get('spec_id')??''))return{kind:'native',pathname:p}}
   if(new RegExp('^'+v2+'(agent-autonomous-runs|workflow-v2-runs)/'+uuid+'/steps$').test(p)&&stepsQuery(raw,p))return{kind:'native',pathname:p}
   if(raw===p&&([auth+'me',auth+'capabilities',...collections.map(v=>v2+v),v2+'tool-connections',v2+'mcp-connections',v2+'knowledge-bases',v2+'shared-knowledge',v2+'knowledge-embedding/consent'].includes(p)||new RegExp('^'+v2+'('+collections.join('|')+')/'+uuid+'$').test(p)||new RegExp('^'+v2+'(agent-specs|original-ui/agent-specs|agent-feedback|agent-memories)/'+uuid+'$').test(p)||new RegExp('^'+v2+'workflow-v2-runs/'+uuid+'/outputs$').test(p)))return{kind:'native',pathname:p}
  }
  if(method==='POST'&&raw===p&&(([auth+'login',auth+'logout'].includes(p)||story==='original-agent-run-queued'&&new RegExp('^'+v2+'agent-feedback/'+uuid+'/(change|confirm)$').test(p))||new RegExp('^'+v2+'agent-autonomous-runs/'+uuid+'/(pause|resume|pause-confirm|resume-confirm|cancel)$').test(p)||new RegExp('^'+v2+'workflow-v2-runs/'+uuid+'/cancel$').test(p)||story==='original-agent-run-queued'&&new RegExp('^'+v2+'agent-specs/'+uuid+'/autonomous-runs$').test(p)))return{kind:'native',pathname:p}
  return{kind:'api_denied',pathname:p}
 }
 if(p==='/api'||p.startsWith('/api/')||p.startsWith('/__'))return{kind:'api_denied',pathname:p}
 if(!['GET','HEAD'].includes(method))return{kind:'denied',pathname:p}
 if(p==='/index.html'||p==='/agent-studio.svg'||p.startsWith('/assets/'))return{kind:'asset',pathname:p}
 if(['/','/login','/agent-run','/run-detail'].includes(p)&&accept.includes('text/html'))return{kind:'spa',pathname:p}
 return{kind:'denied',pathname:p}
}
