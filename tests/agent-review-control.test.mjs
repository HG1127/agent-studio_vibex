import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {parseAgentReviewControl} from '../services/pg-api/src/agent-review-control.ts'
import {canonicalMcpJson} from '../services/pg-api/src/mcp-catalog.ts'

const controlId='abcdef01-abcd-4abc-8def-123456789abc',reviewId='fedcba01-fedc-4fed-8cba-abcdef012345'
const base={action:'cancel',request_id:controlId,review_id:reviewId,expected_request_sha256:'a'.repeat(64),confirm:true}
const invalid=raw=>assert.throws(()=>parseAgentReviewControl(raw),error=>error.status===400&&error.code==='invalid_agent_review_control')

test('review control normalizes UUIDs and seals the exact canonical confirmed action and review digest',()=>{
  const value=parseAgentReviewControl({...base,request_id:controlId.toUpperCase(),review_id:reviewId.toUpperCase()})
  const expected=createHash('sha256').update(canonicalMcpJson({protocol:'agent_paid_review_control_v1',...base})).digest('hex')
  assert.deepEqual(value,{...base,request_sha256:expected})
  const reordered=Object.fromEntries(Object.entries(base).reverse())
  assert.equal(parseAgentReviewControl(reordered).request_sha256,expected)
  for(const patch of [{action:'erase'},{request_id:'11111111-1111-4111-8111-111111111111'},{review_id:'22222222-2222-4222-8222-222222222222'},{expected_request_sha256:'b'.repeat(64)}])assert.notEqual(parseAgentReviewControl({...base,...patch}).request_sha256,expected)
})

test('review control accepts exactly cancel or erase with explicit true consent and distinct control/review IDs',()=>{
  assert.equal(parseAgentReviewControl({...base,action:'erase'}).action,'erase')
  for(const patch of [{action:'submit'},{action:'preview'},{action:'forget'},{action:''},{action:null},{confirm:false},{confirm:1},{confirm:'true'},{confirm:null},{review_id:controlId},{request_id:reviewId.toUpperCase()}])invalid({...base,...patch})
  for(const key of Object.keys(base)){const value={...base};delete value[key];invalid(value)}
})

test('review control rejects malformed identifiers, digest coercion and hidden authority or internal hash fields',()=>{
  for(const key of ['request_id','review_id'])for(const value of ['',null,123,`${controlId} `,` ${controlId}`,controlId.replaceAll('-',''),`${controlId}\0`,{toString(){throw Error('coercion')}}])invalid({...base,[key]:value})
  for(const value of ['',null,123,'a'.repeat(63),'a'.repeat(65),'A'.repeat(64),'g'.repeat(64),`${'a'.repeat(64)}\n`,{toString(){throw Error('coercion')}}])invalid({...base,expected_request_sha256:value})
  for(const [key,value] of Object.entries({request_sha256:'b'.repeat(64),owner_user_id:controlId,owner_epoch:1,paid:true,body:'private',state:'erased',recorded:true,provider_executed:true}))invalid({...base,[key]:value})
  invalid({...base,[Symbol('hidden')]:true})
})

test('review control rejects foreign prototypes, accessors and non-data fields without invoking getters',()=>{
  for(const value of [undefined,null,true,1,'cancel',[],new Date(),new Map(),Object.assign(Object.create({}),base),new (class Control{constructor(){Object.assign(this,base)}})()])invalid(value)
  for(const key of Object.keys(base)){
    let calls=0;const value={...base};Object.defineProperty(value,key,{get(){calls++;throw Error('getter invoked')},enumerable:true});invalid(value);assert.equal(calls,0)
    const setter={...base};Object.defineProperty(setter,key,{set(){throw Error('setter invoked')},enumerable:true});invalid(setter)
  }
  const hidden={...base};Object.defineProperty(hidden,'authority',{value:true,enumerable:false});invalid(hidden)
  const missingAndSymbol={...base};delete missingAndSymbol.confirm;missingAndSymbol[Symbol('confirm')]=true;invalid(missingAndSymbol)
})

test('review control accepts own data on null prototypes, returns a detached value and never mutates frozen consent',()=>{
  const plain=Object.freeze({...base}),nullPrototype=Object.assign(Object.create(null),base)
  assert.deepEqual(parseAgentReviewControl(nullPrototype),parseAgentReviewControl(plain))
  const mutable={...base},value=parseAgentReviewControl(mutable);mutable.action='erase';mutable.expected_request_sha256='b'.repeat(64)
  assert.equal(value.action,'cancel');assert.equal(value.expected_request_sha256,base.expected_request_sha256);assert.deepEqual(plain,base)
  const hidden=Object.create(null);for(const [key,value] of Object.entries(base))Object.defineProperty(hidden,key,{value})
  assert.deepEqual(parseAgentReviewControl(hidden),parseAgentReviewControl(base))
})
