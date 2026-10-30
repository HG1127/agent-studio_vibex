import test from 'node:test'
import assert from 'node:assert/strict'
import {approvalDelegationPreview} from '../src/approval-delegation-preview.ts'
test('manager metadata projection never forwards private argument values, endpoint credentials, path or query',()=>{
  const raw={method:'post',url:'https://private-user:synthetic-secret@tools.example.test:9443/private/customer?key=synthetic-query#private-fragment',
    api_key:'SyntheticApiKey',customer:'UndisclosedCompany',nested:{secret:'SyntheticNestedValue'},'a<script>':'SyntheticScriptValue'}
  const preview=approvalDelegationPreview(raw)
  assert.equal(preview.target_hostname,'tools.example.test');assert.equal(preview.method,'POST');assert.equal(preview.values_hidden,true)
  assert.equal(preview.field_count,6);assert.ok(preview.field_names.includes('[保密参数]'));assert.ok(preview.field_names.includes('a_script_'))
  assert.doesNotMatch(JSON.stringify(preview),/Synthetic|synthetic|Undisclosed|private-user|private\/customer|private-fragment|9443/)
  const many=approvalDelegationPreview(Object.fromEntries(Array.from({length:40},(_,i)=>['field'+i,'PrivateValue'+i])))
  assert.equal(many.field_names.length,24);assert.equal(many.field_count,40);assert.equal(many.fields_truncated,true)
})
test('projection does not invoke getters or inherited values and ignores non-HTTP URLs and model prompt strings',()=>{
  let called=0
  const raw=Object.defineProperty({data:'private'},'url',{enumerable:true,get(){called++;throw Error('getter must not execute')}})
  assert.equal(approvalDelegationPreview(raw).target_hostname,null);assert.equal(called,0)
  for(const url of ['file:///private/company.txt','data:text/plain,private','https://[::1]/private','not a url'])assert.equal(approvalDelegationPreview({url}).target_hostname,null)
  for(const raw of ['Private model task',null,[],new Date(),Object.create({url:'https://inherited.example.test'})])
    assert.deepEqual(approvalDelegationPreview(raw),{values_hidden:true,field_count:0,field_names:[],fields_truncated:false,method:null,target_hostname:null})
  const nullPrototype=Object.assign(Object.create(null),{method:'DELETE',endpoint:'https://tools.example.test/private'})
  assert.equal(approvalDelegationPreview(nullPrototype).method,'DELETE')
})
