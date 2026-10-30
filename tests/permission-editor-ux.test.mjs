import test from 'node:test'
import assert from 'node:assert/strict'
import {prepareWebsiteBatch,normalizeWebsite,reconcileWebsiteDraft,websiteChanges,sameWebsiteSet,selectionRemaining,formatRemaining} from '../src/lib/permissionEditor.ts'
const old='a'.repeat(24),next='b'.repeat(24)
test('batch website entry supports bare domains, paths, separators and stable deduplication',()=>{
 const original=['https://example.com'];const batch=prepareWebsiteBatch('example.com/path\nresearch.example，https://other.example:8443/a; RESEARCH.EXAMPLE',original)
 assert.deepEqual(batch.sites,['https://example.com','https://research.example','https://other.example:8443']);assert.equal(batch.duplicates,2);assert.equal(batch.added,2);assert.deepEqual(original,['https://example.com'])
})
test('invalid batch is atomic and identifies the offending entry without echoing secrets',()=>{
 const original=['https://example.com'];assert.throws(()=>prepareWebsiteBatch('new.example\nhttps://user:private@secret.example',original),e=>/第2项/.test(e.message)&&!e.message.includes('private'));assert.deepEqual(original,['https://example.com'])
})
test('website entry refuses non-web schemes, wildcard, credentials and token-bearing URLs',()=>{
 for(const value of ['file:///C:/private','javascript:alert(1)','data:text/plain,a','https://*.example.com','https://u:p@example.com','https://example.com?q=secret','https://example.com/#token','https://example.com\\private','https://example.com\u202e'])assert.throws(()=>normalizeWebsite(value),value)
 assert.equal(normalizeWebsite('localhost:8090/hello'),'https://localhost:8090');assert.equal(normalizeWebsite('http://127.0.0.1:8090/hello'),'http://127.0.0.1:8090')
})
test('scope limit is enforced after deduplication without mutating existing list',()=>{
 const full=Array.from({length:12},(_,i)=>'https://site'+i+'.example');assert.equal(prepareWebsiteBatch(full.join('\n'),full).sites.length,12);assert.throws(()=>prepareWebsiteBatch('extra.example',full),/超过12/);assert.equal(full.length,12)
})
test('changing only file permissions rebases revision and preserves all website draft/input',()=>{
 const draft={revision:old,base:['https://a.example'],sites:['https://a.example','https://new.example'],input:'pending.example'}
 const result=reconcileWebsiteDraft(draft,{revision:next,sites:['https://a.example']});assert.equal(result.conflict,false);assert.equal(result.draft.revision,next);assert.deepEqual(result.draft.sites,draft.sites);assert.equal(result.draft.input,draft.input)
})
test('competing website changes preserve original draft and require explicit resolution',()=>{
 const draft={revision:old,base:['https://a.example'],sites:['https://draft.example'],input:''};const result=reconcileWebsiteDraft(draft,{revision:next,sites:['https://other.example']});assert.equal(result.conflict,true);assert.deepEqual(result.draft,draft)
})
test('clean draft follows authoritative websites while preserving unfinished input',()=>{
 const draft={revision:old,base:['https://a.example'],sites:['https://a.example'],input:'unfinished.example'};const result=reconcileWebsiteDraft(draft,{revision:next,sites:['https://other.example']});assert.equal(result.conflict,false);assert.deepEqual(result.draft.sites,['https://other.example']);assert.equal(result.draft.input,'unfinished.example')
})
test('same desired website set is treated as settled without order-dependent conflict',()=>{
 assert.equal(sameWebsiteSet(['a','b'],['b','a']),true);const draft={revision:old,base:['https://a.example'],sites:['https://b.example','https://a.example'],input:''};const result=reconcileWebsiteDraft(draft,{revision:next,sites:['https://a.example','https://b.example']});assert.equal(result.conflict,false);assert.deepEqual(websiteChanges(result.draft.base,result.draft.sites),{added:[],removed:[]})
})
test('change summary displays actual additions and revocations including empty set',()=>{
 assert.deepEqual(websiteChanges(['a','b'],['b','c']),{added:['c'],removed:['a']});assert.deepEqual(websiteChanges(['a'],[]),{added:[],removed:['a']})
})
test('selection expiry is live, bounded and does not imply automatic authorization',()=>{
 assert.equal(selectionRemaining(301000,1000),300);assert.equal(selectionRemaining(301000,300999),1);assert.equal(selectionRemaining(301000,301000),0);assert.equal(selectionRemaining(NaN),0);assert.equal(formatRemaining(61),'1分01秒');assert.equal(formatRemaining(0),'已过期')
})
