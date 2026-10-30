// Actual HTTP handler with memory request/response ports only. No listener,
// database, positive runtime permit, business repository or provider is started.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createRequire} from 'node:module'
import {createNativeAuthHttpHandler} from '../src/native-auth-http.mjs'
import {generateOpaqueSession} from '../src/native-employee-auth.mjs'
const protocol='native_model_connections_owner_cas_v1',origin='https://localhost:17443'
async function capabilities(options={},authenticated=true){
 const session=generateOpaqueSession(),profile={id:'10000000-0000-4000-8000-000000000001',email:'synthetic@example.invalid',display_name:'Synthetic',is_admin:false},seen=[]
 const auth={async login(){assert.fail('not a login test')},async getSessionProfile(token){seen.push(token);return authenticated&&token===session.token?profile:null},async revokeSession(){assert.fail('not logout')},async provisionEmployee(){assert.fail('not provisioning')}}
 const native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,businessHandler(){assert.fail('capabilities must not invoke business')},...options}),req={method:'GET',url:'/api/native-auth/capabilities',headers:{origin,cookie:'__Host-agentstudio_session='+session.token}},res={status:null,body:null,writeHead(status){this.status=status},end(bytes){this.body=JSON.parse(bytes)}}
 await native.handler(req,res);assert.deepEqual(seen,[session.token]);assert(!JSON.stringify(res.body).includes(session.token));return res
}
test('original model protocol is absent by default and accepts only exact installed true option',async()=>{
 for(const value of [undefined,false,'true',protocol,1]){const result=await capabilities({allowOriginalModelConnections:value,allowConfigurationWrites:true});assert.equal(result.status,200);assert.equal(result.body.original_model_connections_protocol,undefined)}
 const result=await capabilities({allowOriginalModelConnections:true});assert.equal(result.body.original_model_connections_protocol,protocol);assert.equal(result.body.config_writes_enabled,false);assert.equal(result.body.model_probe_enabled,false)
})
test('protocol advertisement never supplies authentication or grants configuration/probe access',async()=>{
 const missing=await capabilities({allowOriginalModelConnections:true,allowConfigurationWrites:true,allowModelProbe:true},false);assert.equal(missing.status,401);assert.equal(missing.body.original_model_connections_protocol,undefined)
 for(const [config,probe]of [[false,false],[false,true],[true,false],[true,true]]){const result=await capabilities({allowOriginalModelConnections:true,allowConfigurationWrites:config,allowModelProbe:probe});assert.equal(result.body.original_model_connections_protocol,protocol);assert.equal(result.body.config_writes_enabled,config);assert.equal(result.body.model_probe_enabled,config&&probe)}
})
test('Native advertises the protocol of the exact repository instance used by the actual HTTP routes',()=>{
 const source=fs.readFileSync(new URL('../src/native-server.ts',import.meta.url),'utf8'),ts=createRequire(import.meta.url)('typescript'),tree=ts.createSourceFile('native-server.ts',source,ts.ScriptTarget.Latest,true);assert.deepEqual(tree.parseDiagnostics,[])
 let constructor,repository,marker
 function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(tree)==='modelConnections')constructor=n.initializer.getText(tree);if(ts.isPropertyAssignment(n)&&n.name.getText(tree)==='modelConnectionRepository')repository=n.initializer.getText(tree);if(ts.isPropertyAssignment(n)&&n.name.getText(tree)==='allowOriginalModelConnections')marker=n.initializer.getText(tree);ts.forEachChild(n,visit)}visit(tree)
 assert.equal(constructor,'new ModelConnectionRepository(business,modelEncryptionKey,brokerPool?adapter(brokerPool):business)');assert.equal(repository,'modelConnections');assert.equal(marker,"Object.getOwnPropertyDescriptor(modelConnections,'originalUiProtocol')?.value==='native_model_connections_owner_cas_v1'")
 const actual=Function('modelConnections','return '+marker);assert.equal(actual({}),false);assert.equal(actual({originalUiProtocol:protocol}),true);assert.equal(actual(Object.create({originalUiProtocol:protocol})),false);let touched=0;assert.equal(actual({get originalUiProtocol(){touched++;return protocol}}),false);assert.equal(touched,0)
})
