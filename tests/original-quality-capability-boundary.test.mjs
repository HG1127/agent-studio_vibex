// Actual HTTP capability handler and SDK with closed request/response ports.
// Hook expressions are read from the real AST; no React, socket or SQL runs.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {Readable} from 'node:stream'
import ts from 'typescript'
import {createNativeAuthHttpHandler} from '../services/pg-api/src/native-auth-http.mjs'
import {createPgNativePilotApi} from '../src/lib/pgNativePilotApi.ts'
import {originalAgentQualityProtocol as protocol} from '../shared/original-agent-quality-contract.ts'

const employee='11111111-1111-4111-8111-111111111111',origin='https://localhost:17443'
async function capabilities(selected,{signedIn=true,configurationWrites=false,requestOrigin=origin}={}){
 let profiles=0
 const auth={login:async()=>assert.fail('no login'),revokeSession:async()=>assert.fail('no logout'),provisionEmployee:async()=>assert.fail('no provisioning'),getSessionProfile:async()=>{profiles++;return{id:employee,email:'synthetic@example.test',display_name:'Synthetic',is_admin:false}}}
 const handler=createNativeAuthHttpHandler({auth,allowedOrigin:origin,businessHandler:()=>assert.fail('no business dispatch'),originalQualityProtocol:selected,allowConfigurationWrites:configurationWrites})
 const req=Object.assign(Readable.from([]),{url:'/api/native-auth/capabilities',method:'GET',headers:{origin:requestOrigin,...(signedIn?{cookie:'__Host-agentstudio_session='+'a'.repeat(43)}:{})}})
 let status,body,headers;await handler.handler(req,{writeHead(s,h){status=s;headers=h},end(bytes){body=JSON.parse(bytes)}})
 return{status,body,headers,profiles}
}
test('unmounted or unknown quality protocol is never advertised by the actual verified-Cookie capability handler',async()=>{
 for(const value of [undefined,null,false,true,'unknown-quality-version']){const r=await capabilities(value);assert.equal(r.status,200);assert.equal(r.profiles,1);assert.equal(Object.hasOwn(r.body,'original_agent_quality_protocol'),false);assert.equal(r.headers['Cache-Control'],'no-store')}
})
test('the exact mounted protocol is read availability only and does not grant writes or task execution',async()=>{
 for(const writes of [false,true]){const r=await capabilities(protocol,{configurationWrites:writes});assert.equal(r.status,200);assert.equal(r.body.original_agent_quality_protocol,protocol);assert.equal(r.body.config_writes_enabled,writes);assert.equal(r.body.run_execution_enabled,false);assert.equal(Object.hasOwn(r.body,'autonomous_agent_submission_enabled'),false)}
})
test('absent Cookie and foreign Origin cannot disclose quality capabilities',async()=>{
 const absent=await capabilities(protocol,{signedIn:false}),foreign=await capabilities(protocol,{requestOrigin:'https://foreign.invalid'});assert.equal(absent.status,401);assert.equal(absent.profiles,0);assert.equal(foreign.status,403);assert.equal(foreign.profiles,0);for(const r of [absent,foreign])assert.equal(Object.hasOwn(r.body,'original_agent_quality_protocol'),false)
})
const sdk=extra=>createPgNativePilotApi(async(path,init)=>{assert.equal(path,'/__pg_native/api/native-auth/capabilities');assert.equal(init.method,'GET');return new Response(JSON.stringify({mode:'native_pg18',config_writes_enabled:false,model_probe_enabled:false,run_execution_enabled:false,...extra}),{headers:{'content-type':'application/json'}})})
test('actual SDK accepts absent availability and the exact quality version without inventing an available feature',async()=>{
 const absent=await sdk({}).getConfigCapabilities(),present=await sdk({original_agent_quality_protocol:protocol}).getConfigCapabilities();assert.equal(absent.original_agent_quality_protocol,undefined);assert.equal(present.original_agent_quality_protocol,protocol);assert.equal(present.config_writes_enabled,false)
})
test('actual SDK refuses malformed or unknown quality versions before publishing capabilities',async()=>{
 for(const v of [null,false,true,{},[],0,'unknown-quality-version'])await assert.rejects(sdk({original_agent_quality_protocol:v}).getConfigCapabilities(),e=>e.code==='invalid_native_capabilities')
})
const source=fs.readFileSync(new URL('../src/pages/AgentRun/usePgOriginalAgentRun.ts',import.meta.url),'utf8'),tree=ts.createSourceFile('hook.ts',source,ts.ScriptTarget.Latest,true)
assert.equal(tree.parseDiagnostics.length,0)
const declarations=[],calls=[];function visit(n){if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name))declarations.push(n);if(ts.isCallExpression(n)&&n.expression.getText(tree)==='useOriginalAgentQuality')calls.push(n);ts.forEachChild(n,visit)}visit(tree)
assert.equal(calls.length,1);const args=calls[0].arguments;assert.equal(args.length,1);assert(ts.isObjectLiteralExpression(args[0]));const properties=new Map(args[0].properties.map(p=>{assert(ts.isPropertyAssignment(p));return[p.name.getText(tree),p.initializer.getText(tree)]})),availability=declarations.find(n=>n.name.text==='qualityAvailable');assert(availability?.initializer)
const available=vm.compileFunction('return '+availability.initializer.getText(tree),['view']),readReady=vm.compileFunction('return '+properties.get('ready'),['privacy','selectedSpecId','qualityAvailable'])
test('actual hook admission requires both current private UI scope and the exact server-advertised protocol',()=>{
 for(const caps of [undefined,{}, {original_agent_quality_protocol:false},{original_agent_quality_protocol:'wrong'}])assert.equal(readReady({canAct:true},employee,available({caps})),false)
 assert.equal(readReady({canAct:true},employee,available({caps:{original_agent_quality_protocol:protocol}})),true);assert.equal(readReady({canAct:false},employee,true),false);assert.equal(readReady({canAct:true},'',true),false)
})
test('actual in-flight quality scope rechecks the live controller protocol after revocation and owner suspension',()=>{
 let allowed=true,caps={original_agent_quality_protocol:protocol};const controller={current:{snapshot:()=>({employeeId:employee,selectedAgentId:employee,identityEpoch:1,qualitySelectionEpoch:2,caps})}},make=vm.compileFunction('return '+properties.get('liveScope'),['controller','lifecycle','canAct']),scope=make(controller,{current:9},()=>allowed);assert.equal(scope().ready,true);caps={};assert.equal(scope().ready,false);caps={original_agent_quality_protocol:protocol};allowed=false;assert.equal(scope().ready,false);assert.equal(scope().employeeId,employee)
})
