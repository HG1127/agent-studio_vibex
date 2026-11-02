import test from 'node:test'
import './pg-original-version-release-completion-dispatch-diagnostic.test.mjs'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
const sha=s=>createHash('sha256').update(s).digest('hex')
const reviewedParentFileSha256="b9d330d0de5ab34b97fadc5f48b54d587d93da04f4420a29e7c3c212a6bb8e99"
const reviewedParentWrapSha256="2908f0095f8421241c1ab53c9faab16ccb4b3df2f093abcf4d01261dec72526c"
const parentWrapSource="  const wrap=(kind,broker)=>({async dispatch(identity,request){assert(!active);assert.equal(identity.subject,f.users.alice);if(privateEvents.length>=10)throw Error('release_private_dispatch_bound');const proof={kind,run_id:request.claim.run_id,step_key:request.step_key,input_sha256:request.input_sha256};privateEvents.push(proof);active=proof;try{return await broker.dispatch(identity,request)}finally{active=null}}})\n"
// Execute only the actual extracted closures. Verified identity, owner-row and
// Broker ports are terminal DATA. No SQL, Worker, TLS/socket/server or provider.
const source=readFileSync(new URL('./helpers/pg-original-version-release-completion-dispatch.mjs',import.meta.url),'utf8')
function wrapSource(text){const first=text.indexOf('  const wrap='),last=text.indexOf('  const privateFactory=',first);assert(first>=0&&last>first);return text.slice(first,last)}
const candidateWrapSource=wrapSource(source),firstIdentity=source.indexOf('  const verifiedAlice='),endIdentity=source.indexOf('  const brokerObserved=',firstIdentity)
assert(firstIdentity>=0&&endIdentity>firstIdentity)
const captureSource=source.slice(firstIdentity,endIdentity)
const capture=vm.runInNewContext('(assert,f)=>{return(async()=>{'+captureSource+';return verifiedAlice})()}',{})
const E='11111111-1111-4111-8111-111111111111',S='22222222-2222-4222-8222-222222222222',B='33333333-3333-4333-8333-333333333333',R='44444444-4444-4444-8444-444444444444'
const alice=()=>({issuer:'urn:agentstudio:local:v1',subject:S})
const request=()=>({claim:{run_id:R},step_key:'wf2_00002_agent_a01m',input_sha256:'a'.repeat(64)})
function actualWrap(text,{expected=alice(),events=[],workerIdentity=alice()}={}){
 const make=vm.runInNewContext('(assert,f,verifiedAlice,privateEvents)=>{let active=null;'+text+';return{wrap,active:()=>active}}',{})
 const port=make(assert,{users:{alice:E}},expected,events)
 return{...port,events,workerIdentity}
}
async function ownerCapture({identity=alice(),rows=[alice()]}={}){
 const trace=[]
 const f={users:{alice:E},identityFor:async who=>{trace.push({kind:'verified-cookie-identity',who});assert.equal(who,'alice');return identity},db:{query:async(sql,args)=>{trace.push({kind:'owner-row',sql,args});assert.equal(sql,"SELECT external_issuer AS issuer,external_subject AS subject FROM agentstudio.users WHERE id=$1::uuid AND status='active'");assert.equal(args.length,1);assert.equal(args[0],E);return{rows}}}}
 return{identity:await capture(assert,f),trace}
}
test('exact reviewed parent wrapper rejects a valid Native subject before any Broker reservation or synthetic wire',async()=>{
 assert.equal(sha(parentWrapSource),reviewedParentWrapSha256);assert.match(reviewedParentFileSha256,/^[a-f0-9]{64}$/);assert.notEqual(E,S)
 const p=actualWrap(parentWrapSource);let brokerCalls=0
 await assert.rejects(p.wrap('model',{dispatch:async()=>{brokerCalls++;return{status:'succeeded',text:'Synthetic'}}}).dispatch(alice(),request()))
 assert.equal(brokerCalls,0);assert.equal(p.events.length,0);assert.equal(p.active(),null)
})
test('actual owner-capture closure binds Cookie identity to the real active users.id row with one readonly query',async()=>{
 const p=await ownerCapture();assert.equal(p.identity.issuer,alice().issuer);assert.equal(p.identity.subject,S);assert.equal(p.trace.length,2);assert.equal(p.trace[1].args[0],E);assert(!p.trace[1].sql.includes('UPDATE'));assert(!p.trace[1].sql.includes('INSERT'))
})
for(const [name,rows]of [['missing',[]],['duplicate',[alice(),alice()]],['foreign subject',[{...alice(),subject:B}]],['foreign issuer',[{...alice(),issuer:'urn:foreign'}]]])test('actual startup owner-capture refuses '+name+' mapping before constructing a dispatcher',async()=>{await assert.rejects(ownerCapture({rows}),/release_completion_verified_owner_identity_unconfirmed/)})
for(const kind of ['model','tool'])test('actual corrected '+kind+' wrapper accepts the verified Native identity while user id differs',async()=>{
 const p=actualWrap(candidateWrapSource);let brokerCalls=0
 const result=await p.wrap(kind,{dispatch:async(identity,raw)=>{brokerCalls++;assert.equal(identity.subject,S);assert.equal(raw.claim.run_id,R);assert.equal(p.active().run_id,R);return{status:'succeeded',text:'Synthetic result'}}}).dispatch(alice(),request())
 assert.equal(result.status,'succeeded');assert.equal(brokerCalls,1);assert.equal(p.events.length,1);assert.equal(p.events[0].kind,kind);assert.equal(p.active(),null)
})
for(const [name,identity]of [['forged subject equals user id',{...alice(),subject:E}],['Bob subject',{...alice(),subject:B}],['issuer mismatch',{...alice(),issuer:'urn:foreign'}],['missing subject',{issuer:alice().issuer}],['missing identity',null]])test('actual corrected wrapper refuses '+name+' without calling Broker',async()=>{
 const p=actualWrap(candidateWrapSource);let brokerCalls=0
 await assert.rejects(p.wrap('model',{dispatch:async()=>{brokerCalls++}}).dispatch(identity,request()),/release_completion_verified_identity_mismatch/);assert.equal(brokerCalls,0);assert.equal(p.events.length,0);assert.equal(p.active(),null)
})
test('actual corrected wrapper preserves one-call unknown outcome and clears the local active guard without replay',async()=>{
 const p=actualWrap(candidateWrapSource);let brokerCalls=0
 await assert.rejects(p.wrap('model',{dispatch:async()=>{brokerCalls++;throw Error('synthetic_outcome_unknown')}}).dispatch(alice(),request()),/synthetic_outcome_unknown/);assert.equal(brokerCalls,1);assert.equal(p.events.length,1);assert.equal(p.active(),null)
})
test('actual corrected wrapper keeps the existing ten-effect hard limit',async()=>{
 const p=actualWrap(candidateWrapSource,{events:Array.from({length:10},()=>({kind:'model'}))});let brokerCalls=0
 await assert.rejects(p.wrap('model',{dispatch:async()=>{brokerCalls++}}).dispatch(alice(),request()),/release_private_dispatch_bound/);assert.equal(brokerCalls,0);assert.equal(p.events.length,10)
})
test('actual corrected wrapper keeps single active dispatch exclusion',async()=>{
 const p=actualWrap(candidateWrapSource);let release,calls=0;const pending=new Promise(resolve=>{release=resolve}),broker={dispatch:async()=>{calls++;return pending}},wrapped=p.wrap('model',broker),first=wrapped.dispatch(alice(),request());await Promise.resolve();await assert.rejects(wrapped.dispatch(alice(),request()));assert.equal(calls,1);release({status:'succeeded',text:'Synthetic'});await first;assert.equal(p.active(),null)
})
test('fixture correction leaves real lease resolvers, original Tick and all synthetic execution bounds in place',()=>{
 assert(source.includes('new modelDispatch.WorkflowV2ModelLeaseIdentity(identityPool)'));assert(source.includes('new toolDispatch.WorkflowV2ToolLeaseIdentity(identityPool)'));assert(source.includes('worker.tick()'));assert(source.includes('privateEvents.length>=10'));assert(source.includes('requests>11'));assert(source.includes('assert.equal(f.providerRequests.length,0)'));assert(!captureSource.includes("'POST'"));assert(!candidateWrapSource.includes('tick('));assert(!candidateWrapSource.includes('decide'));assert(!candidateWrapSource.includes('respond'))
})
