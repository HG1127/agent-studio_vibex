// Actual runtime wiring, AUTHORED/UNRUN by A. Imported only after the pure
// additive purpose and all original F16 guards. Never an alternate identity.
import {randomBytes,randomUUID,createHash} from 'node:crypto'
import {readFileSync,realpathSync} from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {requireOriginalResourceReadCi,originalResourceOwnerRoute} from './original-resource-read-genuine-guard.mjs'
import {inspectAgentMemoryOutcomeSchema} from '../../src/agent-memory-outcome-audit.ts'
import {OwnOperationsRepository,inspectOwnOperationsSchema} from '../../src/own-operations-repository.ts'
import {createNativeOwnOperationsBusinessHandler} from '../../src/own-operations-http.ts'
import {NativeLocalDeviceRepository,NativeLocalExecutorRepository} from '../../src/native-local-device-repository.ts'
import {NativeGuidedOwnerRepository,NativeGuidedExecutorRepository} from '../../src/native-guided-repository.ts'
import {createNativeLocalDeviceHttp} from '../../src/native-local-device-http.ts'
import {createNativeGuidedHttp} from '../../src/native-guided-http.ts'

export function verifyOriginalResourceReadSources(env,root,storyCase){
 requireOriginalResourceReadCi(env,storyCase)
 const actual=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim();if(actual!==env.AGENT_STUDIO_ORIGINAL_RESOURCE_EXPECTED_HEAD)throw Error('original_resource_checkout_head_mismatch')
 const manifestPath=path.join(root,'tests/helpers/pg-original-resource-read-reviewed-sources.json'),bytes=readFileSync(manifestPath);if(createHash('sha256').update(bytes).digest('hex')!==env.AGENT_STUDIO_ORIGINAL_RESOURCE_SOURCES_SHA256)throw Error('original_resource_source_manifest_mismatch')
 const graph=JSON.parse(bytes);if(graph.format!=='original-resource-read-source-graph.v1'||graph.complete!==true||graph.cases?.join(',')!=='harness,execution_51'||!Array.isArray(graph.files)||graph.files.length<100)throw Error('original_resource_complete_source_graph_required')
 const seen=new Set(),realRoot=realpathSync(root)
 for(const pin of graph.files){if(!pin||typeof pin.path!=='string'||!/^[A-Za-z0-9_.][A-Za-z0-9_./-]*$/.test(pin.path)||pin.path.split('/').some(part=>part==='..'||part==='.')||seen.has(pin.path)||!/^[a-f0-9]{64}$/.test(pin.sha256))throw Error('original_resource_source_pin_invalid');const actualPath=realpathSync(path.join(root,pin.path));if(!actualPath.startsWith(realRoot+path.sep)||createHash('sha256').update(readFileSync(actualPath)).digest('hex')!==pin.sha256)throw Error('original_resource_source_changed');seen.add(pin.path)}
 for(const required of ['src/main.tsx','src/App.tsx','src/pages/Harness/HarnessPage.tsx','src/pages/ExecutionConnections/ExecutionConnectionsPage.tsx','services/pg-api/tests/helpers/tool-hub-genuine-fixture.mjs','services/pg-api/src/native-auth-http.mjs','services/pg-api/src/own-operations-repository.ts','db/postgres/migrations/pg_v9_052_agent_memory_outcome.sql','db/postgres/migrations/pg_v9_067_native_local_devices.sql','db/postgres/experimental/desktop-guided-pairing.sql'])if(!seen.has(required))throw Error('original_resource_required_source_missing')
 return graph
}

export async function prepareOriginalResourceReadRuntime({storyCase,pool,executorPool,authenticateRequest,allowedOrigin,policy,identityFor,users}){
 const outcome=await inspectAgentMemoryOutcomeSchema(pool)
 if(outcome!==true||await inspectOwnOperationsSchema(pool,outcome)!==true)throw Error('actual_resource_own_operations_schema_required')
 const own=new OwnOperationsRepository(pool)
 if(typeof own.originalHarness!=='function')throw Error('frozen_original_Harness_contract_required')
 const ownHttp=createNativeOwnOperationsBusinessHandler({repository:own,available:true,policy,authenticateRequest,allowedOrigin,businessHandler:async()=>{throw Error('original_resource_owner_route_not_handled')}})
 let localHttp,guidedHttp,deviceReader,guidedReader,guidedWriter,guidedExecutor
 if(storyCase==='execution_51'){
  if(!executorPool)throw Error('actual_resource_executor_role_pool_required')
  deviceReader=new NativeLocalDeviceRepository(pool,{allowWrites:false});guidedReader=new NativeGuidedOwnerRepository(pool,{allowWrites:false});guidedWriter=new NativeGuidedOwnerRepository(pool,{allowWrites:true});guidedExecutor=new NativeGuidedExecutorRepository(executorPool)
  localHttp=createNativeLocalDeviceHttp({repository:deviceReader,executor:new NativeLocalExecutorRepository(executorPool),authenticateRequest,allowedOrigin,allowWrites:false})
  guidedHttp=createNativeGuidedHttp({repository:guidedReader,executor:guidedExecutor,authenticateRequest,allowedOrigin,allowWrites:false})
 }
 const devices=new Map()
 return Object.freeze({own,
  async owner(req,res){let p;try{p=new URL(req.url??'/',allowedOrigin).pathname}catch{return false}if(!originalResourceOwnerRoute(p,storyCase))return false
   if(p==='/api/v2/local-devices'||p==='/api/v2/local-device-pairings'){
    // Only the existing owner GETs are exposed in this fixture purpose.
    if(req.method!=='GET'){res.writeHead(405,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'method_not_allowed'}));return true}
    if(p==='/api/v2/local-devices')return localHttp(req,res)
    return guidedHttp(req,res)
   }
   await ownHttp(req,res);return true
  },
  async prepareReadOnlyPairedDevice(who){
   if(storyCase!=='execution_51'||!Object.hasOwn(users,who)||typeof identityFor!=='function')throw Error('actual_resource_pair_fixture_scope_required')
   if(devices.has(who))return devices.get(who)
   const identity=await identityFor(who),pairCode=randomBytes(24),token=randomBytes(32),request_id=randomUUID();let ownerIntent,pairIntent
   try{ownerIntent={action:'create',request_id,name:'Original resource paired '+who,pairing_code:pairCode.toString('hex')};const created=await guidedWriter.record(identity,ownerIntent,users[who]);pairIntent={id:created.receipt.id,owner_request_id:request_id,request_id:randomUUID(),pairing_code:pairCode.toString('hex'),device_token:token.toString('hex')};const paired=await guidedExecutor.pair(pairIntent,false);if(paired.id!==created.receipt.id||paired.paired!==true)throw Error('actual_resource_pair_ack_required');const status=await guidedReader.status(identity,users[who]),observed=status.find(row=>row.id===created.receipt.id),rows=await deviceReader.list(identity,users[who]),device=rows.find(row=>row.id===created.receipt.id);if(observed?.paired!==true||!device||device.revoked!==false||device.seen_ms!==0)throw Error('actual_resource_paired_owner_inventory_required');const result=Object.freeze({id:device.id,name:device.name,paired:observed.paired});devices.set(who,result);return result}
   finally{pairCode.fill(0);token.fill(0);if(ownerIntent)ownerIntent.pairing_code='';if(pairIntent){pairIntent.pairing_code='';pairIntent.device_token=''}}
  }
 })
}
