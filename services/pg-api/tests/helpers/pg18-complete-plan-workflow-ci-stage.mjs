// Fixed source-stage extension only. No target, driver, SQL or service launch.
import fs from'node:fs'
import path from'node:path'
import{fileURLToPath,pathToFileURL}from'node:url'
import{createHash}from'node:crypto'
import{assertCompleteProfileCiPermit,completeProfileCiBinding}from'./pg18-complete-install-ci-guard.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..'),sha=b=>createHash('sha256').update(b).digest('hex'),fail=c=>{throw Error('complete_plan_workflow_ci_stage_'+c)}
export function complete069PlanWorkflowCiStageEnabled(permit){assertCompleteProfileCiPermit(permit);const value=process.env.AGENT_STUDIO_PLAN_WORKFLOW_PAIR_CI_PURPOSE;if(value===undefined)return false;if(value!=='YES_DISPOSABLE_FULL069_FIXED_F05_PAIR_ONLY')fail('new_purpose_required');return true}
export async function collectComplete069PlanWorkflowCiStage(permit,complete){
 assertCompleteProfileCiPermit(permit);if(!complete069PlanWorkflowCiStageEnabled(permit)||completeProfileCiBinding(permit).kind!=='provision')fail('provision_required')
 const source=await import(pathToFileURL(path.join(root,'services/pg-api/src/pg18-complete-plan-workflow-sources.mjs'))),snapshot=await source.captureComplete069PlanWorkflowSources();source.assertComplete069PlanWorkflowSources(snapshot,snapshot.source_sha256)
 const original=await import(pathToFileURL(path.join(root,'services/pg-api/src/pg18-complete-profile-source.mjs')));original.assertCompleteProfileSnapshot(complete,snapshot.complete.source_sha256)
 const required=['pg18-complete-plan-workflow-cli.mjs','pg18-complete-plan-workflow-sources.mjs','agent-plan-workflow-service.ts','agent-plan-workflow-service-config.ts'].map(n=>'services/pg-api/src/'+n)
 if(snapshot.complete.source_sha256!==complete.source_sha256||required.some(name=>!snapshot.complete.manifest.sources.some(f=>f.path===name)))fail('root_must_bind_original_and_new_F05_CLI_in_complete_source')
 const entries=[];for(const row of snapshot.manifest.sources){const bytes=fs.readFileSync(path.join(root,row.path));if(sha(bytes)!==row.sha256)fail('source_changed');entries.push({path:row.path,sha256:row.sha256,bytes})}
 source.assertComplete069PlanWorkflowSources(snapshot,snapshot.source_sha256);return{snapshot,entries,manifest:Buffer.from(JSON.stringify(snapshot.manifest))}
}
export async function verifyComplete069PlanWorkflowCiStage(permit,tree,input,complete,expectedSha){
 assertCompleteProfileCiPermit(permit);if(!complete069PlanWorkflowCiStageEnabled(permit))fail('new_purpose_required');const binding=completeProfileCiBinding(permit),prefix='/root/agentstudio-complete-install-input/'+binding.run+'-'+binding.attempt+'-'
 if(typeof input!=='string'||!input.startsWith(prefix)||!/^[a-f0-9]{64}$/.test(input.slice(prefix.length))||tree!==input+'/tree'||typeof expectedSha!=='string'||!/^[a-f0-9]{64}$/.test(expectedSha)||binding.kind==='fixture'&&input.slice(prefix.length)!==binding.nonce)fail('stage_binding')
 const source=await import(pathToFileURL(tree+'/services/pg-api/src/pg18-complete-plan-workflow-sources.mjs')),snapshot=await source.captureComplete069PlanWorkflowSources();source.assertComplete069PlanWorkflowSources(snapshot,expectedSha,{deployment:true})
 const original=await import(pathToFileURL(tree+'/services/pg-api/src/pg18-complete-profile-source.mjs'));original.assertCompleteProfileDeployment(complete,snapshot.complete.source_sha256)
 if(snapshot.complete.source_sha256!==complete.source_sha256)fail('source_cohort')
 const file=input+'/plan-workflow-source-manifest.json',s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.uid!==0||s.gid!==0||s.nlink!==1||(s.mode&0o7777)!==0o600||s.size<1||s.size>4*1024*1024||fs.realpathSync(file)!==file)fail('manifest_metadata');const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let bytes
 try{const opened=fs.fstatSync(fd);for(const k of['dev','ino','size','mtimeMs','ctimeMs','mode','uid','gid'])if(s[k]!==opened[k])fail('manifest_changed');bytes=fs.readFileSync(fd);const after=fs.fstatSync(fd),current=fs.lstatSync(file);for(const k of['dev','ino','size','mtimeMs','ctimeMs','mode','uid','gid'])if(s[k]!==after[k]||s[k]!==current[k])fail('manifest_changed')}finally{fs.closeSync(fd)}if(sha(bytes)!==expectedSha||!bytes.equals(Buffer.from(JSON.stringify(snapshot.manifest))))fail('manifest_changed')
 return{snapshot,sourceSha:snapshot.source_sha256,paths:snapshot.manifest.sources.map(r=>r.path),assert:()=>source.assertComplete069PlanWorkflowSources(snapshot,expectedSha,{deployment:true})}
}
