import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {workspaceAllows,workspaceActionAvailability,workspaceStat,workspaceTextVerified,workspaceTrash,workspaceTextPayload,workspaceError} from '../src/lib/computerWorkspace.ts'
const hash=value=>createHash('sha256').update(value).digest('hex')
const stat=(text,extra={})=>({root:'work',path:'doc.txt',size:Buffer.byteLength(text),sha256:hash(text),directory:false,...extra})
test('exact root capability is required; a sibling root never inherits write access',()=>{
 const tools=[{name:'files.update',description:'edit',inputSchema:{properties:{root:{enum:['edit_scope']}}}}]
 assert.equal(workspaceAllows(tools,'files.update','work'),false)
 assert.equal(workspaceAllows(tools,'files.trash','edit_scope'),false)
 assert.equal(workspaceAllows(tools,'files.update','edit_scope'),true)
})

test('workspace distinguishes an ungranted action from a connector that needs updating',()=>{
 const tool=(name,roots)=>({name,description:name,inputSchema:{properties:{root:{enum:roots}}}})
 const current=[tool('files.list',['read']),tool('files.read',['read']),tool('files.stat',['read']),tool('files.open',['read']),tool('files.update',['edit'])]
 const actions=workspaceActionAvailability(current,'read')
 assert.equal(actions.find(x=>x.tool==='files.open').reason,'available')
 assert.equal(actions.find(x=>x.tool==='files.update').reason,'permission')
 assert.equal(actions.find(x=>x.tool==='files.trash').reason,'permission')
 assert.equal(actions.find(x=>x.tool==='files.update').available,false)
 const legacy=workspaceActionAvailability([tool('files.list',['read']),tool('files.read',['read'])],'read')
 assert.equal(legacy.find(x=>x.tool==='files.open').reason,'connector')
 assert.equal(legacy.find(x=>x.tool==='files.update').reason,'connector')
})
test('stat must belong to exact requested root/path and contain a verifiable version',()=>{
 assert.equal(workspaceStat(JSON.stringify(stat('中文')), 'work','doc.txt').size,6)
 for(const change of [{root:'other'},{path:'../private'},{sha256:null},{sha256:'a'},{size:-1},{directory:'false'}])assert.throws(()=>workspaceStat(JSON.stringify(stat('x',change)),'work','doc.txt'))
})
test('editor refuses truncated, replaced, invalid or oversized receipts',async()=>{
 assert.equal(await workspaceTextVerified(stat('中文\n'), '中文\n'),true)
 assert.equal(await workspaceTextVerified(stat('original'), 'orig'),false)
 assert.equal(await workspaceTextVerified(stat('same-size'), 'fake-size'),false)
 assert.equal(await workspaceTextVerified(stat('x'.repeat(15001)), 'x'.repeat(15001)),false)
 assert.equal(await workspaceTextVerified(stat('',{directory:true}), ''),false)
})
test('payload limits include UTF8 and escaped JSON envelope',()=>{
 assert.equal(workspaceTextPayload('hello'),'hello')
 assert.throws(()=>workspaceTextPayload('中'.repeat(5001)))
 assert.throws(()=>workspaceTextPayload('\u0000'.repeat(4000)))
})
test('trash metadata cannot nominate an arbitrary path, id or malformed result',()=>{
 const row={trash_id:'a'.repeat(24),path:'notes/doc.txt',size:4,created_at:Date.now()}
 assert.equal(workspaceTrash(JSON.stringify({entries:[row],truncated:false})).entries[0].path,row.path)
 for(const changed of [{path:'../outside'},{path:'C:/outside'},{trash_id:'../escape'},{size:-1}])assert.throws(()=>workspaceTrash(JSON.stringify({entries:[{...row,...changed}]})))
 assert.throws(()=>workspaceTrash('not json'))
 assert.throws(()=>workspaceTrash('{}'))
})
test('conflict errors explain that the original was not overwritten',()=>{
 assert.match(workspaceError(Error('expected_sha256_mismatch')),/版本已变化/)
 assert.match(workspaceError(Error('EEXIST')),/未覆盖/)
})
