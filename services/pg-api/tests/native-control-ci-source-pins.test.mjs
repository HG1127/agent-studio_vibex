// Cross-module compatibility regression: fixed consumer pins must match the
// reviewed physical release inputs. This never imports or starts the CI child.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),child=fs.readFileSync(path.join(root,'services/pg-api/tests/helpers/native-company-worker-heartbeats-control-ci-child.mjs'),'utf8'),hash=x=>createHash('sha256').update(x).digest('hex')
// Local Windows checkouts can contain CRLF; the hosted sealed Linux consumer
// checks raw bytes. This test-only conversion matches the committed LF input;
// it does not change the production child or its mandatory readSealed checks.
const source=name=>{const raw=fs.readFileSync(path.join(root,'services/pg-api/src',name));return process.platform==='win32'?Buffer.from(raw.toString('utf8').replaceAll('\r\n','\n')):raw}
function pins(text,name='sourcePins',count=9){
  assert(['sourcePins','sharedSourcePins'].includes(name))
  const block=new RegExp('const '+name+'=Object\\.freeze\\(\\{\\r?\\n([^]*?)\\r?\\n\\}\\)').exec(text)?.[1]
 assert.ok(block,'the explicit reviewed source-pin object must remain present')
 const result={}
 for(const line of block.split(/\r?\n/)){const m=/^ '([a-z0-9-]+\.(?:ts|mjs))':'([a-f0-9]{64})',$/.exec(line);assert.ok(m,'closed literal pin grammar');assert.equal(Object.hasOwn(result,m[1]),false);result[m[1]]=m[2]}
  assert.equal(Object.keys(result).length,count,'no removed source gate');return result
}
test('Native sealed child pins match all nine actual reviewed source files',()=>{
 for(const [name,pin]of Object.entries(pins(child)))assert.equal(hash(source(name)),pin,name+' changed: review and update its explicit consumer pin before genuine execution')
  for(const [name,pin]of Object.entries(pins(child,'sharedSourcePins',1)))assert.equal(hash(fs.readFileSync(path.join(root,'shared',name))),pin,name+' shared dependency changed before genuine execution')
})
test('actual sealedStage body rejects a changed client before input parsing or Native authorization; negative model only',()=>{
 const from=child.indexOf('function sealedStage(root){'),to=child.indexOf('function readFrame()',from)
 assert.ok(from>=0&&to>from)
  const context={fs:{lstatSync:()=>({isDirectory:()=>true,isSymbolicLink:()=>false,uid:0,gid:0,mode:0o555}),readdirSync:()=>[]},path,sha:hash,sourcePins:pins(child),sharedSourcePins:pins(child,'sharedSourcePins',1),packages:{},refuse(){throw Error('native_control_ci_refused')},readSealed(file){const name=path.basename(file),bytes=source(name);return name==='worker-heartbeat-activation-control-client.ts'?Buffer.concat([bytes,Buffer.from('source_drift')]):bytes}}
 vm.createContext(context);vm.runInContext(child.slice(from,to)+'\nglobalThis.subject=sealedStage',context)
 assert.throws(()=>context.subject('/sealed'),/native_control_ci_refused/)
 const invocation=child.slice(child.indexOf('export async function runNativeCompanyWorkerHeartbeatsControlCiChild()'))
 assert.ok(invocation.indexOf('sealedStage(root)')<invocation.indexOf('parseNativeControlCiChildFrame(await readFrame())'))
 assert.ok(invocation.indexOf('sealedStage(root)')<invocation.indexOf('reader.read(input.cookie)'))
 assert.ok(child.includes("if(sha(readSealed(root+'/services/pg-api/src/'+name))!==pin)refuse()"))
 assert.ok(invocation.includes("error:{status:503,code:'native_control_ci_refused'}"))
})

test('actual sealedStage checks the new shared bytes before frame parsing, even when all nine old gates match',()=>{
 const from=child.indexOf('function sealedStage(root){'),to=child.indexOf('function readFrame()',from),shared='original-account-contract.ts'
 const observed=[],context={fs:{lstatSync:()=>({isDirectory:()=>true,isSymbolicLink:()=>false,uid:0,gid:0,mode:0o555}),readdirSync:()=>[]},path,sha:hash,sourcePins:pins(child),sharedSourcePins:pins(child,'sharedSourcePins',1),packages:{},refuse(){throw Error('native_control_ci_refused')},readSealed(file){observed.push(file);const name=path.basename(file);return name===shared?Buffer.concat([fs.readFileSync(path.join(root,'shared',name)),Buffer.from('shared_drift')]):source(name)}}
 vm.createContext(context);vm.runInContext(child.slice(from,to)+'\nglobalThis.subject=sealedStage',context)
 assert.throws(()=>context.subject('/sealed'),/native_control_ci_refused/)
 assert.equal(observed.length,10);assert.equal(observed.at(-1),'/sealed/shared/'+shared)
 assert(child.includes("if(sha(readSealed(root+'/shared/'+name))!==pin)refuse()"))
})
