import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import {Readable} from 'node:stream'
import {NativeHomeResourcesRepository} from '../src/native-home-resources-repository.ts'
import {createNativeHomeResourcesHttp,originalHomeResourcesPath} from '../src/native-home-resources-http.ts'
import {originalHomeStatisticsFunctionPins} from '../src/native-home-knowledge-stats-pins.ts'
// Pure data/control-flow tests only. No query is parsed or executed by SQL.
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',httpId='33333333-3333-4333-8333-333333333333',mcpId='44444444-4444-4444-8444-444444444444',baseId='55555555-5555-4555-8555-555555555555',sharedId='66666666-6666-4666-8666-666666666666'
const identity={issuer:'urn:agentstudio:local:v1',subject:'verified-employee'},origin='https://studio.example.test',time='2026-10-30T01:02:03.000Z'
const catalog={version:'2025-11-25',tools:[{name:'find',description:'Find public records',input_schema:{type:'object',properties:{token:{type:'string',description:'schema-never-output'}}},read_only:true,destructive:false,requires_tasks:false},{name:'taskOnly',description:'Unavailable task mode',input_schema:{type:'object'},read_only:false,destructive:false,requires_tasks:true}]}
const sql=fs.readFileSync(new URL('../../../db/postgres/migrations/pg_v9_072_home_knowledge_statistics.sql',import.meta.url),'utf8'),body=sql.slice(sql.indexOf('AS $fn$')+7,sql.indexOf('$fn$;',sql.indexOf('AS $fn$')+7))
const oldSql=fs.readFileSync(new URL('../../../db/postgres/migrations/pg_v9_032_knowledge_access.sql',import.meta.url),'utf8')
const functionRows=Object.fromEntries(originalHomeStatisticsFunctionPins.map(pin=>{const isMain=pin.signature==='original_home_knowledge_stats(uuid)',name=pin.signature.split('(')[0],start=oldSql.indexOf('CREATE FUNCTION agentstudio.'+name+'('),from=oldSql.indexOf('AS $function$',start)+'AS $function$'.length,source=isMain?body:oldSql.slice(from,oldSql.indexOf('$function$;',from));return['agentstudio.'+pin.signature,{ok:true,source,result:pin.result}]}))
const connection=(id)=>({id,owner_user_id:owner,revision:'7',name:'Actual connection',description:'Actual description',enabled:true,status:'ok',last_checked_at:time,url:'https://never-output.example',headers:'header-never-output',body_template:'body-never-output'})
const owned=()=>({id:baseId,owner_user_id:owner,revision:'3',name:'Actual owned base',description:'Metadata',created_at:time,updated_at:time,access_role:'owner',document_count:'2',chunk_count:'13'})
function harness(options={}){
  const state={queries:[],http:[{...connection(httpId),method:'POST'}],mcp:[{...connection(mcpId),catalog}],owned:[owned()],shared:[],stats:[],catalog:[{ok:true,source:body}],released:0,releaseArguments:[],...options}
  const pool={knowledgeSharing:state.sharing===true,async connect(){return{release(discard){state.released++;state.releaseArguments.push(discard)},async query(query,args=[]){state.queries.push({query,args});if(query==='ROLLBACK'&&state.rollbackFailure)throw state.rollbackFailure;if(state.failure&&query.includes(state.failure.match))throw state.failure.error
  if(query==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'||query==='COMMIT'||query==='ROLLBACK'||query.startsWith('SET LOCAL ')||query.startsWith('SELECT set_config('))return{rows:[]}
  if(query.startsWith('SELECT agentstudio.identity_user_id('))return{rows:[{id:owner}]}
  if(query.includes('FROM agentstudio.tool_connections'))return{rows:state.http}
  if(query.includes('FROM agentstudio.mcp_connections'))return{rows:state.mcp}
  if(query.includes('FROM agentstudio.knowledge_bases b'))return{rows:state.owned}
  if(query.includes('FROM agentstudio.knowledge_shared_bases()'))return{rows:state.shared}
   if(query.includes("current_user='agentstudio_api' AND session_user"))return{rows:[{ok:state.principal!==false}]}
   if(query.startsWith("SELECT 'migration' AS kind,version AS name"))return{rows:state.presence??[{kind:'migration',name:'pg_v9_072'},{kind:'function',name:'original_home_knowledge_stats'}]}
   if(query.includes('FROM pg_catalog.pg_proc p')){const fallback=functionRows[args[0]];if(args[0]==='agentstudio.original_home_knowledge_stats(uuid)')return{rows:state.catalog.map(row=>({...fallback,...row}))};return{rows:[state.dependencies?.[args[0]]??fallback]}}
  if(query.startsWith('SELECT stats.*'))return{rows:state.stats}
  throw Error('unexpected pure query')
 }}}}
  return{state,repository:new NativeHomeResourcesRepository(pool,{allowSharedStatistics:state.statistics??state.sharing===true})}
}
const shared=()=>({id:sharedId,owner_user_id:other,name:'Actual shared base',description:'Shared metadata',access_role:'viewer',semantic_allowed:false,base_revision:'9'})
const stats=()=>({id:sharedId,owner_user_id:other,revision:'9',created_at:time,updated_at:time,document_count:'8',chunk_count:'52',access_role:'viewer'})
test('actual stored reference projection excludes secrets and does not invent counts or ready',async()=>{
 const h=harness(),value=await h.repository.get(identity)
 assert.equal(value.employee_id,owner);assert.equal(value.knowledge_sharing_enabled,false);assert.equal(value.knowledge_bases[0].document_count,2);assert.equal(value.knowledge_bases[0].chunk_count,13)
 const http=value.http_connections[0],mcp=value.mcp_connections[0];assert.equal(http.revision,7);assert.equal(http.binding.connection_id,httpId);assert.match(http.alias,/^http_[a-z][a-z0-9_]{0,54}$/);assert.equal(mcp.tools.length,1);assert.equal(mcp.tools[0].tool_name,'find');assert.match(mcp.tools[0].binding.catalog_sha256,/^[a-f0-9]{64}$/)
 const text=JSON.stringify(value);for(const secret of ['never-output.example','header-never-output','body-never-output','schema-never-output','input_schema','url','headers'])assert(!text.includes(secret))
 assert.equal(h.state.queries[0].query,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(h.state.queries.at(-1).query,'COMMIT');assert.equal(h.state.released,1)
 assert(h.state.queries.some(item=>item.query.startsWith('SELECT set_config(')&&item.args[0]==='false'))
})
test('disabled and untested persisted connections have no bindings',async()=>{const h=harness();h.state.http[0].enabled=false;h.state.mcp[0].status='untested';h.state.mcp[0].catalog={};const value=await h.repository.get(identity);assert.equal(value.http_connections[0].binding,null);assert.equal(value.mcp_connections[0].catalog_sha256,null);assert.deepEqual(value.mcp_connections[0].tools,[])})
test('MCP annotations preserve all actual read-only and destructive boolean combinations',async()=>{
 for(const read_only of [false,true])for(const destructive of [false,true]){const h=harness();h.state.mcp[0].catalog=structuredClone(catalog);Object.assign(h.state.mcp[0].catalog.tools[0],{read_only,destructive});const value=await h.repository.get(identity),tool=value.mcp_connections[0].tools[0];assert.equal(tool.read_only,read_only);assert.equal(tool.destructive,destructive);assert.equal(tool.binding.connection_revision,7)}
})
test('legitimate empty display descriptions retain real names as HTTP binding descriptions',async()=>{
 for(const description of ['', ' \n ']){const h=harness();h.state.http[0].description=description;h.state.mcp[0].description=description;const value=await h.repository.get(identity);assert.equal(value.http_connections[0].description,description);assert.equal(value.mcp_connections[0].description,description);assert.equal(value.http_connections[0].binding.description,'Actual connection');assert.equal(value.http_connections[0].binding.connection_id,httpId);assert.equal(value.http_connections[0].binding.connection_revision,7)}
})
test('malformed ok catalog rejects the whole result instead of becoming an empty catalog',async()=>{const h=harness();h.state.mcp[0].catalog={};await assert.rejects(h.repository.get(identity),error=>error.code==='original_home_resources_unavailable');assert.equal(h.state.queries.at(-1).query,'ROLLBACK')})
test('foreign-owner connector data is never projected as current employee resources',async()=>{const h=harness();h.state.http[0].owner_user_id=other;await assert.rejects(h.repository.get(identity),error=>error.status===503)})
for(const value of [null,undefined,'',-1,'1.5','9007199254740992'])test('invalid actual chunk count rejects, including '+String(value),async()=>{const h=harness();h.state.owned[0].chunk_count=value;await assert.rejects(h.repository.get(identity),error=>error.status===503)})
test('actual zero count remains zero and actual Date metadata becomes ISO',async()=>{const h=harness();h.state.owned[0].chunk_count='0';h.state.owned[0].document_count=0;h.state.owned[0].created_at=new Date(time);const value=await h.repository.get(identity);assert.equal(value.knowledge_bases[0].chunk_count,0);assert.equal(value.knowledge_bases[0].created_at,time)})
test('database denial propagates and releases, with no success-shaped fallback',async()=>{const error=Object.assign(Error('private database detail'),{code:'42501'}),h=harness({failure:{match:'FROM agentstudio.knowledge_bases b',error}});await assert.rejects(h.repository.get(identity),value=>value===error);assert.equal(h.state.queries.at(-1).query,'ROLLBACK');assert.equal(h.state.released,1)})
test('failed rollback discards the client and retains the original query failure',async()=>{
 const primary=Error('synthetic primary'),h=harness({failure:{match:'FROM agentstudio.knowledge_bases b',error:primary},rollbackFailure:Error('synthetic rollback')})
 await assert.rejects(h.repository.get(identity),error=>error===primary)
 assert.equal(h.state.queries.at(-1).query,'ROLLBACK');assert.deepEqual(h.state.releaseArguments,[true]);assert.equal(h.state.released,1)
})
test('new PG18 transaction and statement budgets stay inside the existing8s wire budget',async()=>{
 const h=harness();await h.repository.get(identity);const queries=h.state.queries.map(item=>item.query)
 assert.equal(queries[1],"SET LOCAL transaction_timeout='5s'");assert.equal(queries[2],"SET LOCAL statement_timeout='5s'");assert(queries.indexOf("SET LOCAL transaction_timeout='5s'")<queries.findIndex(query=>query.startsWith('SELECT set_config(')));assert(!queries.some(query=>query.includes("statement_timeout='10s'")))
})
test('timed-out pool admission issues no actor query and releases its late unclaimed client',async()=>{
 let finish,released=0,queried=0
 const repository=new NativeHomeResourcesRepository({connect:()=>new Promise(resolve=>{finish=resolve})})
 await assert.rejects(repository.get(identity),error=>error.status===503&&error.code==='original_home_resources_connection_timeout')
 finish({query:async()=>{queried++;throw Error('late query forbidden')},release(){released++}})
 await new Promise(resolve=>setImmediate(resolve));assert.equal(released,1);assert.equal(queried,0)
})
test('sharing disabled never invokes shared RPC and preserves capability off',async()=>{const h=harness({shared:[shared()]});const result=await h.repository.get(identity);assert.equal(result.knowledge_bases.length,1);assert(!h.state.queries.some(item=>item.query.includes('knowledge_shared_bases')))})
test('072 off refuses a valid shared selection instead of hiding it or inventing zero',async()=>{const h=harness({sharing:true,statistics:false,shared:[shared()]});await assert.rejects(h.repository.get(identity),error=>error.code==='original_home_knowledge_statistics_disabled');assert(!h.state.queries.some(item=>item.query.startsWith('SELECT stats.*')))})
test('changed original ACL dependency is refused before its metadata RPC can be called',async()=>{const h=harness({sharing:true,statistics:false,shared:[shared()],dependencies:{'agentstudio.knowledge_access_mode(uuid)':{...functionRows['agentstudio.knowledge_access_mode(uuid)'],source:'changed'}}});await assert.rejects(h.repository.get(identity),error=>error.code==='original_home_knowledge_statistics_unavailable');assert(!h.state.queries.some(item=>item.query.includes('FROM agentstudio.knowledge_shared_bases()')))})
test('sharing enabled uses audited actual stats and returns exact ACL role/counts/times',async()=>{const h=harness({sharing:true,shared:[shared()],stats:[stats()]});const result=await h.repository.get(identity),base=result.knowledge_bases.find(item=>item.id===sharedId);assert.equal(base.owner_user_id,other);assert.equal(base.access_role,'viewer');assert.equal(base.document_count,8);assert.equal(base.chunk_count,52);assert.equal(base.semantic_allowed,false);assert.equal(base.updated_at,time)})
test('missing shared stats dependency explicitly fails503 rather than RLS-derived zero',async()=>{const h=harness({sharing:true,shared:[shared()],catalog:[]});await assert.rejects(h.repository.get(identity),error=>error.status===503&&error.code==='original_home_knowledge_statistics_unavailable')})
for(const row of [{ok:false,source:body},{ok:true,source:body+' '}])test('changed stats ACL or exact body refuses the shared result',async()=>{const h=harness({sharing:true,shared:[shared()],stats:[stats()],catalog:[row]});await assert.rejects(h.repository.get(identity),error=>error.code==='original_home_knowledge_statistics_unavailable')})
test('stats with mismatched owner, role or revision cannot attest to a shared base',async()=>{for(const change of [{owner_user_id:owner},{access_role:'editor'},{revision:'10'}]){const h=harness({sharing:true,shared:[shared()],stats:[{...stats(),...change}]});await assert.rejects(h.repository.get(identity),error=>error.status===503)}})
test('overflow and the frozen shared100-row boundary cannot silently truncate',async()=>{const h=harness();h.state.http=Array.from({length:51},()=>h.state.http[0]);await assert.rejects(h.repository.get(identity),error=>error.code==='original_home_resources_limit_exceeded');const s=harness({sharing:true,shared:Array.from({length:100},shared)});await assert.rejects(s.repository.get(identity),error=>error.code==='original_home_resources_limit_exceeded')})
test('non-Native identity is refused before opening an API connection',async()=>{const h=harness();await assert.rejects(h.repository.get({issuer:'https://foreign',subject:'employee'}),error=>error.status===403);assert.deepEqual(h.state.queries,[])})
async function httpRequest({url=originalHomeResourcesPath,method='GET',payload='',auth=async()=>identity,headers={},result={employee_id:owner},failure}={}){
 const req=Readable.from(payload?[Buffer.from(payload)]:[]);req.url=url;req.method=method;req.headers={origin,'x-agentstudio-request':'1',...headers}
 const response={status:null,body:null,writeHead(status){this.status=status},end(value){this.body=JSON.parse(value)}},calls=[]
 const handler=createNativeHomeResourcesHttp({allowedOrigin:origin,authenticateRequest:auth,repository:{get:async actual=>{calls.push(actual);if(failure)throw failure;return result}}})
 const handled=await handler(req,response);return{handled,response,calls}
}
test('GET facade uses verified Native identity and no caller-owned selector',async()=>{const r=await httpRequest();assert.equal(r.response.status,200);assert.deepEqual(r.calls,[identity]);const query=await httpRequest({url:originalHomeResourcesPath+'?owner='+other});assert.equal(query.response.status,400);assert.deepEqual(query.calls,[])})
test('facade refuses body, mutation, foreign Origin and unverified session',async()=>{for(const input of [{payload:'{}'},{method:'POST'},{headers:{origin:'https://foreign.example'}},{auth:async()=>{throw Object.assign(Error('session_required'),{status:401})}}]){const r=await httpRequest(input);assert(r.response.status>=400);assert.deepEqual(r.calls,[])}})
test('unknown repository errors expose fixed failure only; response limit never clips',async()=>{const r=await httpRequest({failure:Error('SELECT credential-body-never-output')});assert.deepEqual(r.response.body,{error:'original_home_resources_unavailable'});const large=await httpRequest({result:{value:'x'.repeat(1048577)}});assert.equal(large.response.status,503);assert.equal(large.response.body.error,'original_home_response_too_large')})
