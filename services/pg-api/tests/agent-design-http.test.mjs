// Stream/repository fixtures, no listener, authentication service or DB positive.
import test from 'node:test'
import assert from 'node:assert/strict'
import {Readable} from 'node:stream'
import {NATIVE_SESSION_COOKIE} from '../src/native-employee-auth.mjs'
import {createAgentDesignHttpHandler} from '../src/agent-design-http.ts'
import {createNativeAuthHttpHandler} from '../src/native-auth-http.mjs'
const origin='http://127.0.0.1:7458',identity={issuer:'urn:agentstudio:local:v1',subject:'employee'}
const choice={action:'preview',purpose:'generate',instruction:'Create role',model_binding:{connection_id:'00000000-0000-4000-8000-000000000002',connection_revision:1,model_id:'model'},output_token_limit:4096,source:null}
function req(path,body=choice,extra={}){const text=typeof body==='string'?body:JSON.stringify(body),r=Readable.from([Buffer.from(text)]);Object.assign(r,{url:path,method:'POST',headers:{origin,'x-agentstudio-request':'1',cookie:NATIVE_SESSION_COOKIE+'='+'a'.repeat(43),'content-type':'application/json','content-length':String(Buffer.byteLength(text)),...extra}});return r}
const res=()=>({writeHead(status){this.status=status},end(body){this.body=JSON.parse(body)}})

test('actual Native authentication closure reports expired opaque Cookie as401 before design access',async()=>{
 let sessions=0,designs=0
 const unused=async()=>{throw Error('unexpected_auth_operation')}
 const native=createNativeAuthHttpHandler({allowedOrigin:origin,businessHandler:unused,auth:{login:unused,getSessionProfile:unused,revokeSession:unused,provisionEmployee:unused,verifySession:async()=>{sessions++;return null}}})
 const run=createAgentDesignHttpHandler({repository:{preview:async()=>{designs++}},allowedOrigin:origin,authenticateRequest:native.authenticateRequest}),out=res()
 await run(req('/api/v2/agent-design/preview'),out)
 assert.equal(sessions,1);assert.equal(designs,0);assert.equal(out.status,401);assert.deepEqual(out.body,{error:'session_required'})
 const broken=createAgentDesignHttpHandler({repository:{},allowedOrigin:origin,authenticateRequest:async()=>{throw Object.assign(Error('private_backend_failure'),{status:401})}}),failed=res()
 await broken(req('/api/v2/agent-design/preview'),failed);assert.equal(failed.status,500);assert.deepEqual(failed.body,{error:'internal_error'})
})
test('other route families return false without authentication or stream reads',async()=>{let calls=0;const run=createAgentDesignHttpHandler({repository:{},allowedOrigin:origin,authenticateRequest:async()=>{calls++;throw Error()}}),out=res();assert.equal(await run(req('/api/else'),out),false);assert.equal(calls,0)})
test('forged identity headers, missing CSRF and alias paths never invoke repository',async()=>{let calls=0;const run=createAgentDesignHttpHandler({repository:{preview:async()=>{calls++}},allowedOrigin:origin,authenticateRequest:async()=>identity});for(const [path,headers] of [['/api/v2/agent-design/preview',{'x-rh-user-id':'fake'}],['/api/v2/agent-design/preview',{'x-agentstudio-request':undefined}],['/api/v2/agent-design/%70review',{}],['/api/v2/agent-design/preview?alias=1',{}]]){const out=res();await run(req(path,choice,headers),out);assert.ok([400,403].includes(out.status))}assert.equal(calls,0)})
test('duplicate keys and malformed bodies are rejected; fulfilled projection failure is uncertain500',async()=>{let calls=0;const run=createAgentDesignHttpHandler({repository:{preview:async()=>{calls++;return {recorded:true,secret:'not-safe'}}},allowedOrigin:origin,authenticateRequest:async()=>identity});const duplicate=res();await run(req('/api/v2/agent-design/preview','{"action":"preview","action":"submit"}'),duplicate);assert.equal(duplicate.status,400);assert.equal(calls,0);const out=res();await run(req('/api/v2/agent-design/preview'),out);assert.equal(calls,1);assert.equal(out.status,500);assert.deepEqual(out.body,{error:'internal_error'})})
