import {originalLoginPath,originalLoginRequestPolicy as basePolicy} from './pg-original-login-browser-guard.mjs'
const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
const prefix='/__pg_native/api/v2/original-ui/business'
export function originalMonitor074HostPolicy(method,raw,accept){
 const base=basePolicy(method,raw,accept)
 if(typeof raw!=='string')return base
 const at=raw.indexOf('?'),pathname=at<0?raw:raw.slice(0,at)
 if(originalLoginPath(pathname)!==pathname||raw.includes('#')||raw.includes('\\'))return base
 const read=new RegExp('^'+prefix+'/(?:collector-schedules|cases/'+uuid+'(?:/monitors)?|monitors/'+uuid+'(?:/(?:checks|events)(?:/'+uuid+')?)?|monitor-checks/'+uuid+'/review-preview|runs/'+uuid+'/results/'+uuid+')$')
 const post=new RegExp('^'+prefix+'/(?:cases(?:/'+uuid+'/(?:query|records|reviews|monitors|monitors/preview))?|monitors/'+uuid+'/(?:definition|control)|monitor-checks/'+uuid+'/(?:review|discard))$')
 const ack=new RegExp('^/__pg_native/api/v2/original-ui/monitor-events/'+uuid+'/read$')
 let queryOk=at<0
 if(method==='GET'&&at>=0){const u=new URL(raw,'https://localhost'),keys=[...u.searchParams.keys()];const unique=new Set(keys).size===keys.length
  if(/\/(checks|events)$/.test(pathname))queryOk=unique&&keys.every(k=>['limit','after_ms','after_id'].includes(k))&&(!u.searchParams.has('limit')||u.searchParams.get('limit')==='20')&&(u.searchParams.has('after_ms')===u.searchParams.has('after_id'))&&(!u.searchParams.has('after_ms')||/^[1-9][0-9]{0,15}$/.test(u.searchParams.get('after_ms'))&&new RegExp('^'+uuid+'$').test(u.searchParams.get('after_id')))
  else if(/\/runs\/[^/]+\/results\//.test(pathname))queryOk=unique&&keys.every(k=>['field','offset','limit'].includes(k))&&(!u.searchParams.has('field')||['text','structuredContent','content','resources'].includes(u.searchParams.get('field')))&&(!u.searchParams.has('offset')||/^(0|[1-9][0-9]{0,15})$/.test(u.searchParams.get('offset')))&&(!u.searchParams.has('limit')||/^[1-9][0-9]{0,3}$/.test(u.searchParams.get('limit'))&&Number(u.searchParams.get('limit'))<=8000)
 }
 if(method==='GET'&&read.test(pathname)&&queryOk||method==='POST'&&at<0&&(post.test(pathname)||ack.test(pathname)))return{kind:'native',pathname}
 if(pathname===prefix||pathname.startsWith(prefix+'/')||pathname.startsWith('/__pg_native/api/v2/original-ui/monitor-events/'))return{kind:'api_denied',pathname}
 return base
}
