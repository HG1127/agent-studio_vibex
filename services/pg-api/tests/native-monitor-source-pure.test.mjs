import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {compareMonitorRelations} from '../../../shared/monitor-semantics.mjs'
import {createWorkflowToolNetwork} from '../src/workflow-v2-tool-network.ts'
import {monitorSourceProjection,monitorEventDedup,monitorHash} from '../src/native-monitor-source-contract.ts'
// Pure scripted transports only: no DNS, socket, SQL, Worker or provider.
const resolver={async resolve4(){return['93.184.216.34']},async resolve6(){return[]}},signal=()=>new AbortController().signal
function scripted(specs,events=[]){let n=0;return(options,callback)=>{const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=()=>req.emit('error',Error('scripted request failure'));req.end=body=>{events.push({options,body});const spec=specs[Math.min(n++,specs.length-1)];queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=spec.status??200;res.headers={'content-type':'text/plain',...spec.headers};res.destroy=()=>{};callback(res);queueMicrotask(()=>{if(spec.aborted){res.emit('aborted');return}res.emit('data',Buffer.isBuffer(spec.body)?spec.body:Buffer.from(spec.body??''));res.emit('end')})})};return req}}
const material={url:'https://public.example.com/source',method:'GET',body_template:'',timeout_s:20,headers:[]}
const source={source_id:'roles',adapter_id:'http.json-items.v1',scope_key:'declared-roles',required_markers:[]}
test('complete monitor receipt retains actual response tail while existing tools stay bounded4000',async()=>{
 const body=JSON.stringify({scope_key:source.scope_key,complete:true,has_more:false,next_cursor:null,items:[{text:'x'.repeat(5000),last:'TAIL_MARKER'}]}),events=[]
 const net=createWorkflowToolNetwork(resolver,scripted([{body,headers:{'content-type':'application/json','content-length':String(Buffer.byteLength(body))}}],events))
 assert.equal((await net.http(material,{},signal())).length,4000)
 const receipt=await net.monitorHttp(material,{},signal());assert.equal(receipt.text,body);assert.equal(receipt.structuredContent.items[0].last,'TAIL_MARKER');assert.equal(receipt.coverage.stored_complete,true)
 const projection=monitorSourceProjection(source,receipt);assert.equal(projection.projection_hash,monitorHash(receipt.structuredContent.items));assert.equal(projection.scope,'declared_request_response_only')
 assert.equal(events.length,2);assert(events.every(e=>e.options.rejectUnauthorized===true&&e.options.agent===false))
})
test('incomplete/truncated/compressed/bad UTF8/length and POST sources do not become complete proof',async()=>{
 for(const spec of [{body:Buffer.alloc(131073)},{aborted:true},{body:'x',headers:{'content-encoding':'gzip'}},{body:Buffer.from([0xc3,0x28])},{body:'x',headers:{'content-length':'2'}},{body:'x',headers:{'content-length':'01'}}])await assert.rejects(()=>createWorkflowToolNetwork(resolver,scripted([spec])).monitorHttp(material,{},signal()))
 const events=[];await assert.rejects(()=>createWorkflowToolNetwork(resolver,scripted([{body:'unused'}],events)).monitorHttp({...material,method:'POST'},{},signal()),/monitor_requires_read_only_source/);assert.equal(events.length,0)
})
test('secret redaction is explicit and cannot be accepted as evidence completeness',async()=>{
 const secret='synthetic-secret-123',body='full source response includes '+secret+' and enough extra characters to otherwise satisfy markers'
 const net=createWorkflowToolNetwork(resolver,scripted([{body}]))
 const receipt=await net.monitorHttp({...material,headers:[{key:'Authorization',value:'Bearer '+secret}]},{},signal())
 assert.equal(receipt.redacted,true);assert.equal(receipt.usable_as_evidence,false);assert.equal(receipt.text.includes(secret),false)
 assert.throws(()=>monitorSourceProjection({...source,adapter_id:'web.text.v1',required_markers:['source']},receipt),/coverage_incomplete/)
})
test('marked web text uses complete declared response and final media type, never search absence',async()=>{
 const body='<p>PUBLIC_MARKER '+('long synthetic evidence '.repeat(250))+' TAIL_MARKER</p>',net=createWorkflowToolNetwork(resolver,scripted([{body,headers:{'content-type':'text/html; charset=utf-8'}}]))
 const receipt=await net.monitorWebFetch('https://public.example.com/page',signal());assert(receipt.text.length>4000);assert(receipt.text.endsWith('TAIL_MARKER'))
 assert.doesNotThrow(()=>monitorSourceProjection({...source,adapter_id:'web.text.v1',required_markers:['PUBLIC_MARKER','TAIL_MARKER']},receipt))
 assert.throws(()=>monitorSourceProjection({...source,adapter_id:'web.text.v1',required_markers:['MISSING']},receipt))
})
test('JSON scope/complete/continuation/count errors cannot manufacture a source receipt',async()=>{
 const base={structuredContent:{scope_key:source.scope_key,complete:true,has_more:false,next_cursor:null,items:[]},coverage:{stored_complete:true},redacted:false,usable_as_evidence:true}
 for(const change of [{scope_key:'other'},{complete:false},{has_more:true},{next_cursor:'next'},{items:Array(1001)}])assert.throws(()=>monitorSourceProjection(source,{...base,structuredContent:{...base.structuredContent,...change}}))
 assert.throws(()=>monitorSourceProjection(source,{...base,coverage:{stored_complete:false}}));assert.throws(()=>monitorSourceProjection(source,{...base,validation:{status:'invalid'}}))
})
const def={target_entity_ids:['person'],relation_types:['EMPLOYMENT','BOARD','CO_WORK']},baseline=Date.parse('2026-10-20T12:00:00Z'),now=Date.parse('2026-10-29T12:00:00Z')
const entity=(id,type)=>({record_id:id,version:1,schema_id:'research.entity.v1',payload:{entity_type:type,identity_status:'CONFIRMED'}})
const relation=(id,to,from='2024',end=null,status='SOURCE_SUPPORTED')=>({record_id:id,version:1,schema_id:'research.relation.v1',payload:{from_id:'person',to_id:to,relation_type:'EMPLOYMENT',description:'Synthetic quote',valid_from:from,valid_to:end,status},source_refs:[{result_id:'source'}],relation_versions:[{record_id:'person',version:1},{record_id:to,version:1}]})
const snapshot=roles=>({payload:{records:[entity('person','PERSON'),entity('orgA','ORGANIZATION'),entity('orgB','ORGANIZATION'),...roles]}})
test('shared relation comparison is exactly the original PB algorithm on baseline/prose/time/absence/conflict cases',()=>{
 const reference=readFileSync(new URL('./helpers/monitor074-original-pb-semantics-reference.cjs',import.meta.url),'utf8');assert.equal(createHash('sha256').update(reference).digest('hex'),'a40efb70300d9259e3560250aba04a856f756e88a35e6a6cd24b4e13fc6af2e7')
 const module={exports:{}};runInNewContext(reference,{module})
 const old=relation('r','orgA'),newRole=relation('new','orgB','2026-10-25'),ended={...old,payload:{...old.payload,valid_to:'2026-10-25'}}
 const cases=[[null,[old]],[[old],[{...old,payload:{...old.payload,description:'only prose changed'}}]],[[old],[old,newRole]],[[old],[ended]],[[old],[]],[[old],[relation('new','orgB','2020')]],[[old],[relation('r','orgA','2024',null,'CONFLICT')]],[[old],[relation('r','orgA','2024',null,'INVALIDATED')]],[[old],[old,relation('undated','orgB',null)]]]
 for(const[a,b]of cases){const before=a?snapshot(a):null,after=snapshot(b),actual=compareMonitorRelations(before,after,def,baseline,now),expected=module.exports.compare(before,after,def,baseline,now);assert.deepEqual(actual,JSON.parse(JSON.stringify(expected)))}
 assert.equal(compareMonitorRelations(snapshot([old]),snapshot([old,newRole]),def,baseline,now).events[0].kind,'additional_role')
 assert.equal(compareMonitorRelations(snapshot([old]),snapshot([]),def,baseline,now).events.some(e=>e.kind==='role_ended'),false)
})
test('event identity binds revision/prior baseline/kind/fact and excludes wording or check replay',()=>{
 const v={monitor_id:'owned-monitor',revision:2,baseline_check_id:'accepted-baseline',kind:'additional_role',fact:{from_id:'p',to_id:'org',relation_type:'EMPLOYMENT',valid_from:'2026-10-25',valid_to:null,status:'SOURCE_SUPPORTED'}}
 assert.equal(monitorEventDedup(v),monitorEventDedup({...v,fact:{...v.fact}}))
 for(const change of [{revision:3},{baseline_check_id:'other'},{kind:'role_started'},{fact:{...v.fact,valid_to:'2026-10-29'}}])assert.notEqual(monitorEventDedup(v),monitorEventDedup({...v,...change}))
 assert.equal(monitorEventDedup({...v,check_id:'new-check',description:'new prose'}),monitorEventDedup(v))
})
