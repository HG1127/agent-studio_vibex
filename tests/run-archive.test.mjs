import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {archiveQuery,archiveParams,archiveRequest,parseArchive,fetchRunArchive} from '../src/lib/runArchive.ts'
const query={q:'',status:'all',days:'all',page:1}
const row={id:'a'.repeat(15),spec_id:'b'.repeat(15),spec_name:'研究助手',instruction:'营收100%报告',status:'succeeded',current_step:2,max_steps:3,model:'fixture',source:'',created:new Date().toISOString()}
const envelope={archive_version:1,items:[row],page:1,perPage:20,totalItems:1,totalPages:1}
test('archive filters are bounded and detail/back navigation retains query and page',()=>{
 const p=new URLSearchParams('q=研究&page=3&status=failed&days=30&run=abcdefghijklmno')
 assert.deepEqual(archiveQuery(p),{q:'研究',page:3,status:'failed',days:'30'})
 assert.equal(archiveParams(p,{page:2}).get('q'),'研究')
 assert.equal(archiveParams(p,{status:'attention'}).get('page'),null)
 assert.equal(archiveParams(p,{status:'attention'}).has('run'),false)
 assert.deepEqual(archiveQuery(new URLSearchParams('page=-2&status=admin&days=999')),{...query})
 assert.equal(archiveQuery(new URLSearchParams({q:'a'.repeat(200)})).q.length,120)
 assert.ok(archiveRequest({...query,q:"100% 'OR'1=1"}).includes('archive=1'))
})
test('complete archive requires valid server paging and unique records',()=>{
 assert.equal(parseArchive(envelope,query).legacy,false)
 assert.equal(parseArchive(envelope,query).totalItems,1)
 for(const bad of [null,{}, {...envelope,items:[row,row]}, {...envelope,page:0},{...envelope,perPage:100},{...envelope,totalItems:-1},{...envelope,totalPages:3},{...envelope,items:[{...row,id:'../foreign'}]},{...envelope,items:[{...row,status:null}]},{...envelope,items:[{...row,current_step:NaN}]}])assert.throws(()=>parseArchive(bad,query))
})
test('legacy recent-only response cannot masquerade as complete history or server paging',()=>{
 const parsed=parseArchive({items:[row]}, {...query,page:5})
 assert.equal(parsed.legacy,true);assert.equal(parsed.totalItems,null);assert.equal(parsed.page,1);assert.equal(parsed.totalPages,1)
 assert.equal(parseArchive({items:[row]}, {...query,q:'100%'}).items.length,1)
 assert.equal(parseArchive({items:[row]}, {...query,status:'failed'}).items.length,0)
 assert.equal(parseArchive({items:[{...row,created:'2000-01-01 00:00:00.000Z'}]}, {...query,days:'7'}).items.length,0)
})
test('archive is GET-only, errors never become empty history, cancellation rejects late responses',async()=>{
 const fetcher=async(url,options)=>{assert.equal(options.method,'GET');assert.equal(options.body,undefined);assert.ok(url.startsWith('https://fixture.test/api/agent-runs/recent?'));return new Response(JSON.stringify(envelope))}
 assert.equal((await fetchRunArchive({base:'https://fixture.test',query,headers:{},fetcher})).items.length,1)
 for(const status of [401,403,500])await assert.rejects(()=>fetchRunArchive({base:'https://fixture.test',query,headers:{},fetcher:async()=>new Response('{}',{status})}))
 const controller=new AbortController()
 await assert.rejects(()=>fetchRunArchive({base:'https://fixture.test',query,headers:{},signal:controller.signal,fetcher:async()=>{controller.abort();return new Response(JSON.stringify(envelope))}}))
})
test('record workspace is list-first; shared empty states have no fixed height or oversized heroes',()=>{
 const page=fs.readFileSync('src/pages/RunDetail/RunDetailPage.tsx','utf8')
 assert.doesNotMatch(page,/还没有选中某次运行|每一次运行|<footer|max-w-xl|py-20|p-10/)
 assert.match(page,/RecentRunsList archive=/)
 const shell=fs.readFileSync('src/components/site/SiteShell.tsx','utf8')
 assert.match(shell,/"\/run-detail","\/version-release"\]\.includes/)

 const empty=fs.readFileSync('src/components/site/WorkspaceEmptyState.tsx','utf8')
 assert.doesNotMatch(empty,/min-h-|h-screen|text-2xl|shadow-lg|py-16|py-20/)
 for(const name of ['src/pages/KnowledgeBases/KnowledgeBasesPage.tsx','src/pages/AgentCollaboration/AgentCollaborationPage.tsx','src/components/version-release/SpecSelector.tsx','src/components/version-release/VersionHistoryList.tsx'])assert.match(fs.readFileSync(name,'utf8'),/WorkspaceEmptyState/)
})
