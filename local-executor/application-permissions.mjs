import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash,randomBytes} from 'node:crypto'
import {readGuidedProfile} from './profiles.mjs'
import {acquireConnectionLock} from './workspace.mjs'
import {discoverApplications,inspectApplication,validateApplicationControl} from './applications.mjs'

export async function applicationPermissionDraft(id,{home,discover=discoverApplications}={}){
 const p=await readGuidedProfile(id,{home}),candidates=await discover()
 const rows=new Map(candidates.map(a=>[a.id,a]));for(const a of p.applications.grants)if(!rows.has(a.id))rows.set(a.id,a)
 return {id:p.id,name:p.name,fingerprint:p.fingerprint,reviewId:randomBytes(12).toString('hex'),enabled:p.applications.enabled,images:p.applications.images,grants:p.applications.grants,candidates:[...rows.values()]}
}
export async function saveApplicationPermissions(draft,input,{home,inspect=inspectApplication}={}){
 if(!draft||Object.keys(input).some(k=>!['id','fingerprint','reviewId','apps','controls','writes','enabled','images','consent'].includes(k))||input.consent!==true||input.id!==draft.id||input.fingerprint!==draft.fingerprint||input.reviewId!==draft.reviewId||!Array.isArray(input.apps)||!Array.isArray(input.controls)||!Array.isArray(input.writes)||input.apps.length>30||input.controls.length>30||input.writes.length>30||new Set(input.apps).size!==input.apps.length||[...input.controls,...input.writes].some(id=>!input.apps.includes(id))||typeof input.enabled!=='boolean'||typeof input.images!=='boolean')throw Error('invalid_application_grants')
 const p=await readGuidedProfile(draft.id,{home});if(p.fingerprint!==draft.fingerprint)throw Error('local_config_changed')
 const release=await acquireConnectionLock(p.configFile)
 try{
  const before=await fs.readFile(p.configFile,'utf8');if(createHash('sha256').update(before).digest('hex')!==draft.fingerprint)throw Error('local_config_changed')
  const grants=[]
  for(const id of input.apps){const candidate=draft.candidates.find(a=>a.id===id);if(!candidate)throw Error('application_denied');const app=await inspect(candidate.path,{name:candidate.name,adapter:candidate.adapter,control:input.controls.includes(id),allowWrite:candidate.adapter==='codex'&&input.writes.includes(id)});if(app.id!==id)throw Error('application_path_changed');grants.push(app)}
  const applications=validateApplicationControl({format:'agent-studio-applications-v1',enabled:input.enabled,images:input.images,grants}),revision=randomBytes(12).toString('hex')
  const config={...JSON.parse(before),applications,permissionRevision:revision,permissionManagementRevision:revision},text=JSON.stringify(config,null,2)
  if(Buffer.byteLength(text)>24000)throw Error('application_scope_too_large')
  const temp=p.configFile+'.'+randomBytes(8).toString('hex')+'.tmp'
  try{await fs.writeFile(temp,text,{flag:'wx',mode:0o600});await fs.rename(temp,p.configFile)}finally{await fs.unlink(temp).catch(()=>{})}
  return {saved:true,applications:grants.length}
 }finally{await release()}
}
