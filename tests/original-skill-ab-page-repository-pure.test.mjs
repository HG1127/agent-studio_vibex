import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {OriginalSkillAbRepository} from '../services/pg-api/src/original-skill-ab-repository.ts'
import {createOriginalSkillAbHttp} from '../services/pg-api/src/original-skill-ab-http.ts'
import {prepareOriginalRoleUiPool} from '../services/pg-api/src/original-role-ui-policy.ts'
import {prepareSkillAbPool} from '../services/pg-api/src/original-skill-ab-runtime.ts'
import {createSkillAbMutualTlsClient} from '../services/pg-api/src/original-skill-ab-client.ts'
import {skillAbExecutionApproval} from '../services/pg-api/src/original-skill-ab-provider.ts'
import {skillAbFeeAcknowledgement,skillAbIntentHashData} from '../shared/original-skill-ab-execution-contract.ts'
import {originalRoleHash} from '../services/pg-api/src/original-role-execution.mjs'
import {frame,literalConnection,literalSupplier,startup,actor,roleEnv} from './helpers/original-role-client-frames.mjs'
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`,owner=id(1),requestId=id(8),identity={issuer:'urn:agentstudio:local:v1',subject:'literal-native-employee'}
const selection={skill_ref:{id:'abc123abc123abc',version:1,hash:'a'.repeat(64)},model_binding:{connection_id:id(4),connection_revision:3,model_id:'literal-model'}}
const intent={...selection,request_id:requestId,expected_input_sha256:'b'.repeat(64),confirm:true,fee_acknowledgement:skillAbFeeAcknowledgement}
const sha=originalRoleHash(skillAbIntentHashData(intent))
const receipt=()=>({protocol:'original_skill_ab_receipt_v1',owner_user_id:owner,request_id:requestId,request_sha256:sha,selection:structuredClone(selection),input_sha256:'b'.repeat(64),source_sha256:'c'.repeat(64),owner_epoch:8,state:'active',trials:[0,1].map(ordinal=>({ordinal,label:ordinal?'B':'A',variant:ordinal?'with_skill':'baseline',state:'planned',started_once:false,input_tokens:null,output_tokens:null,total_tokens:null,truncated:null,result_sha256:null,elapsed_ms:null})),recorded:true})
const catalog=()=>{const value=JSON.parse(readFileSync(new URL('./fixtures/original-skill-ab-catalog.json',import.meta.url),'utf8'));return frame(/original-skill-ab-v1:complete-catalog/,[{value}])}
const abStartup=()=>[frame(/^BEGIN READ ONLY$/),frame(/SET LOCAL ROLE agentstudio_api/),frame(/SET LOCAL search_path/),frame(/SET LOCAL statement_timeout/),catalog(),frame(/^ROLLBACK$/)]
const nativeActor=()=>{const a=actor(owner);a[0]=frame(/^BEGIN$/);return [...a,frame(/current_user='agentstudio_api'/,[{ok:true}]),frame(/^SET LOCAL search_path=pg_catalog$/),frame(/SET LOCAL statement_timeout/),catalog()]}

test('actual public A/B handler confines its route and rejects normalized or encoded paths before any identity, body or SQL access',async()=>{
 const handler=createOriginalSkillAbHttp({repository:new OriginalSkillAbRepository(undefined),authenticateRequest:undefined,allowedOrigin:'https://127.0.0.1:7403'}),base='/api/v2/original-ui/role-skills/ab'
 assert.equal(await handler({url:'/api/other'},undefined),false)
 for(const url of [base+'/%76iew',base+'/../ab/submit',base+'/submit#fragment']){let status,value;const res={writeHead(s){status=s},end(v){value=JSON.parse(v)}};assert.equal(await handler({url,method:'POST',headers:{}},res),true);assert.equal(status,400);assert.equal(value.error,'invalid_original_skill_ab_route')}
})

test('actual public A/B handler retains Origin/CSRF and Cookie-only rejection status with no fake authenticator or actor',async()=>{
 const origin='https://127.0.0.1:7403',handler=createOriginalSkillAbHttp({repository:new OriginalSkillAbRepository(undefined),authenticateRequest:undefined,allowedOrigin:origin}),url='/api/v2/original-ui/role-skills/ab/submit'
 for(const [headers,status,error]of [[{},403,'origin_or_csrf_header_required'],[{origin:'https://other.invalid'},403,'origin_not_allowed'],[{origin,'x-agentstudio-request':'1',authorization:'Bearer forged'},401,'native_cookie_only'],[{origin,'x-agentstudio-request':'1','x-rh-user-id':owner},401,'native_cookie_only']]){let actual,value;const res={writeHead(s){actual=s},end(v){value=JSON.parse(v)}};await handler({url,method:'POST',headers},res);assert.equal(actual,status);assert.equal(value.error,error)}
})

test('actual original-page metadata advertises disabled execution only after a fresh Native actor and full AB catalogue audit',async()=>{
 const db=literalConnection([...startup(),...abStartup(),...nativeActor(),frame(/^COMMIT$/)]),pool=literalSupplier(db)
 await prepareOriginalRoleUiPool(pool,roleEnv);await prepareSkillAbPool(pool,'agentstudio_api')
 const result=await new OriginalSkillAbRepository(pool).meta(identity,owner)
 assert.deepEqual(result,{skill_ab:false,skill_ab_preview:true});assert.equal(db.calls.filter(c=>/original-skill-ab-v1:complete-catalog/.test(c.sql)).length,2);assert.equal(db.calls.some(c=>/agentstudio_skill_ab\.(record|claim|reserve|finish|control)\(/.test(c.sql)),false);db.done()
})

for(const operation of ['receipt','view','claim'])test('actual '+operation+' cannot substitute a different model behind the original paid intent hash',async()=>{
 const wrong=receipt();wrong.selection.model_binding.model_id='unselected-model'
 if(operation==='claim')wrong.trials[0].state='claimed'
 const value=operation==='view'?{receipt:wrong,result_status:'pending',results:[]}:operation==='claim'?{recorded:false,receipt:wrong,proof:{request_id:requestId,ordinal:0,dispatch_token:id(9)}}:wrong
 const sql={receipt:/SELECT agentstudio_skill_ab.receipt/,view:/SELECT agentstudio_skill_ab.view/,claim:/SELECT agentstudio_skill_ab.claim/}[operation]
 const db=literalConnection([...startup(),...abStartup(),...nativeActor(),frame(sql,[{value}]),frame(/^ROLLBACK$/)]),pool=literalSupplier(db)
 let privatePosts=0;const client=createSkillAbMutualTlsClient({executionEnabled:true,executionApproval:skillAbExecutionApproval,origin:'https://127.0.0.1:7461',reviewedServerFingerprint256:'AA:'.repeat(31)+'AA',ca:Buffer.from('literal-ca'),cert:Buffer.from('literal-cert'),key:Buffer.from('literal-key')},()=>{privatePosts++;throw Error('unreachable private request')})
 try{await prepareOriginalRoleUiPool(pool,roleEnv);await prepareSkillAbPool(pool,'agentstudio_api');const repo=new OriginalSkillAbRepository(pool,{allowSubmissions:true,client})
  await assert.rejects(()=>operation==='claim'?repo.startTrial(identity,owner,requestId,0,{request_sha256:sha}):repo[operation](identity,owner,requestId,sha),/receipt_unconfirmed/)
  assert.equal(privatePosts,0);assert.equal(db.calls.some(c=>/agentstudio_skill_ab\.(reserve|finish)\(/.test(c.sql)),false);db.done()
 }finally{client.close()}
})
