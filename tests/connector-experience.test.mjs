import test from 'node:test'
import assert from 'node:assert/strict'
import {compareConnectorVersions,safeConnectorVersion,describeConnectorExperience} from '../src/lib/connectorExperience.ts'
import {parseConnectorRelease,readConnectorRelease} from '../src/lib/connectorRelease.ts'
import {visibleLocalDevices} from '../src/lib/localDeviceInventory.ts'

const now=1000000,owner='fixture-owner',id='a'.repeat(24),revision='f'.repeat(24)
const device={id,name:'同名电脑',paired:true,revoked:false,seen_ms:now-100,catalog:'[]'}
const permission={device_id:id,protocol:'permissions-v2',version:'0.1.0-preview.12',available:true,state:'online',revision,applied_revision:revision,seen_ms:now-100,sites:[],grants:[]}
const release={version:'0.1.0-preview.14',url:'/downloads/agent-studio-connector-win-x64.zip',sha256:'a'.repeat(64),bytes:123456,codeSigned:false}
const health={owner,deviceId:id,permissions:permission,error:false}
const describe=patch=>describeConnectorExperience({device,owner,health,verified:true,now,release,...patch})
const metadata={format:'agent-studio-connector-release-v1',version:release.version,platform:'win32',arch:'x64',file:'agent-studio-connector-win-x64.zip',bytes:release.bytes,sha256:release.sha256,codeSigned:false}

test('numeric prerelease components do not use lexical ordering',()=>{
 assert.equal(compareConnectorVersions('0.1.0-preview.9','0.1.0-preview.14'),-1)
 assert.equal(compareConnectorVersions('0.1.0-preview.14','0.1.0-preview.12'),1)
 assert.equal(compareConnectorVersions('0.1.0','0.1.0-preview.14'),1)
 assert.equal(compareConnectorVersions('0.2.0-preview.1','0.1.0'),1)
 assert.equal(compareConnectorVersions('0.1.0-preview.14','0.1.0-preview.14'),0)
})
test('malformed, unbounded and ambiguous versions remain unknown',()=>{
 for(const bad of [null,{},'<script>', '0.1.0-preview.014','00.1.0','0.1.0-','1.2.3+unverified','99999999999999999.1.0','x'.repeat(70)]){
  assert.equal(safeConnectorVersion(bad),null);assert.equal(compareConnectorVersions(bad,release.version),null)
 }
 assert.equal(compareConnectorVersions('1.0.0-alpha','1.0.0-alpha.1'),-1)
 assert.equal(compareConnectorVersions('1.0.0-alpha.1','1.0.0-alpha.beta'),-1)
})
test('downloaded release never masquerades as the running executor version',()=>{
 const status=describe({})
 assert.equal(status.version,'0.1.0-preview.12');assert.equal(status.update,true)
 assert.equal(status.fresh,true);assert.equal(status.applied,true)
 assert.match(status.next,/下载新版、刷新网页都不会替换/)
})
test('only a fresh same-owner device report can confirm the updated runtime',()=>{
 const confirmed=describe({health:{...health,permissions:{...permission,version:release.version}}})
 assert.equal(confirmed.relation,0);assert.equal(confirmed.fresh,true)
 for(const changed of [{owner:'other-owner'},{deviceId:'b'.repeat(24)}]){
  const status=describe({health:{...health,...changed}})
  assert.equal(status.version,null);assert.equal(status.fresh,false);assert.equal(status.update,false)
 }
})
test('offline, revoked, future or aged heartbeats cannot be displayed as current runtime',()=>{
 for(const seen of [0,now-45000,now+1]){
  const status=describe({device:{...device,seen_ms:seen}});assert.equal(status.online,false);assert.equal(status.fresh,false)
 }
 const status=describe({health:{...health,permissions:{...permission,seen_ms:now-60000}}})
 assert.equal(status.state,'stale');assert.match(status.versionLabel,/未核实/)
 assert.equal(describe({device:{...device,revoked:true}}).state,'revoked')
})
test('inventory or permission errors keep the last version but revoke green readiness immediately',()=>{
 for(const patch of [{verified:false},{health:{...health,error:true}}]){
  const status=describe(patch);assert.equal(status.state,'unverified');assert.equal(status.applied,false);assert.equal(status.fresh,false)
  assert.equal(status.version,permission.version);assert.match(status.next,/不要重复配对/)
 }
 assert.equal(describe({health:{...health,permissions:null,error:true}}).state,'unverified')
})
test('unapplied permission revisions and unknown releases never imply up-to-date',()=>{
 assert.equal(describe({health:{...health,permissions:{...permission,applied_revision:'b'.repeat(24)}}}).state,'syncing')
 const status=describe({release:null});assert.equal(status.relation,null);assert.equal(status.update,false)
 const ahead=describe({health:{...health,permissions:{...permission,version:'0.1.0-preview.15'}}});assert.equal(ahead.relation,1);assert.equal(ahead.update,false)
})
test('same-name device search accepts an exact tail marker without selecting or mutating inventory',()=>{
 const rows=[device,{...device,id:'b'.repeat(18)+'ABC123'},{...device,id:'c'.repeat(24),revoked:true}]
 const before=JSON.stringify(rows)
 assert.deepEqual(visibleLocalDevices(rows,'#abc123',false,now).map(d=>d.id),[rows[1].id])
 assert.equal(visibleLocalDevices(rows,'同名电脑',false,now).length,2)
 assert.equal(JSON.stringify(rows),before)
})
test('release discovery uses only the known same-origin metadata and verifies the archive with HEAD',async()=>{
 const calls=[]
 const fetcher=async(url,options)=>{calls.push({url,method:options.method||'GET',redirect:options.redirect,cache:options.cache});return url.endsWith('.json')?Response.json(metadata):new Response(null,{status:200,headers:{'content-length':String(release.bytes),'content-type':'application/zip'}})}
 assert.deepEqual(await readConnectorRelease(undefined,fetcher),release)
 assert.deepEqual(calls.map(c=>[c.url,c.method]),[['/downloads/connector-release.json','GET'],[release.url,'HEAD']])
 assert.ok(calls.every(c=>c.redirect==='error'&&c.cache==='no-store'))
})
test('missing, HTML or size-mismatched archives are not presented as a verified available update',async()=>{
 for(const response of [new Response(null,{status:404}),new Response('',{headers:{'content-type':'text/html','content-length':String(release.bytes)}}),new Response(null,{headers:{'content-length':'999'}})]){
  await assert.rejects(readConnectorRelease(undefined,async url=>url.endsWith('.json')?Response.json(metadata):response),/archive_unverified/)
 }
})
test('untrusted download destinations and failed metadata never become external requests',async()=>{
 assert.equal(parseConnectorRelease({...metadata,file:'https://untrusted.example/connector.zip'}),null)
 const calls=[];await assert.rejects(readConnectorRelease(undefined,async url=>{calls.push(url);return Response.json({...metadata,file:'../other.zip'})}),/release_invalid/)
 assert.deepEqual(calls,['/downloads/connector-release.json'])
 await assert.rejects(readConnectorRelease(undefined,async()=>new Response(null,{status:503})),/release_unavailable/)
})
