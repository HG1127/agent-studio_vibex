import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const source=fs.readFileSync(new URL('../src/worker-heartbeat-activation-control.ts',import.meta.url),'utf8')
const ast=ts.createSourceFile('control.ts',source,ts.ScriptTarget.Latest,true)
const names=['leaseCheck','readerQuery','readerIdentity','cleanupLease','revoke'],declarations=names.map(name=>{
 const n=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(n,name);return n.getText(ast)
})
const functions=ts.transpileModule(declarations.join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText
class ControlError extends Error{constructor(code){super(code);this.code=code}}
function harness(mode='expired'){
 const state={now:4900,events:[],releases:[],gone:[],resolveQuery:null}
 const row={pid:713,started:'2026-10-29 12:11:23+00',database:'fixture',actor:'studio_telemetry_reader',login:'studio_telemetry_reader',port:5432}
 const s={phase:'serving',epoch:1n,leases:new Set(),binding:{database:'fixture',server_port:5432,database_oid:101,roles:[{}, {oid:102}]}},peer={open:true,leases:new Set()}
 const l={s,peer,id:'lease',handle:{},epoch:1n,deadline:5000,phase:'preparing',queryPending:false,transaction:false,uncertain:false,released:false,clean:false,timer:1,
  client:{async query(){if(mode==='unsettled')await new Promise(resolve=>{state.resolveQuery=resolve});if(mode==='query-error')throw Error('transport');state.now=mode==='success'||mode==='invalid'?4901:5100;return {rows:[mode==='invalid'?{...row,actor:'other'}:row]}},release(uncertain){state.releases.push(uncertain)},off(){}}}
 s.leases.add(l);peer.leases.add(l)
 const context=vm.createContext({performance:{now:()=>state.now},runtimeCheck(){},controlFail(code){throw new ControlError(code)},fault(s){s.phase='recovery_required'},clearTimeout(){},append(_s,phase,_id,data){state.events.push({phase,data})},async waitBackendGone(_s,backend){state.gone.push({...backend})}})
 vm.runInContext(functions+'\nglobalThis.api={leaseCheck,readerQuery,readerIdentity,cleanupLease,revoke}',context)
 return {state,s,l,api:context.api}
}
async function settle(h,original=false){
 const {l,api}=h
 l.work=(async()=>{if(original){const identity=(await api.readerQuery(l,'identity')).rows[0];l.backend={pid:identity.pid,started:identity.started}}else await api.readerIdentity(l)})()
 let error;try{await l.work}catch(e){error=e;api.revoke(l);try{await api.cleanupLease(l)}catch(cleanup){return {error,cleanup}}}
 return {error}
}
test('original post-I/O expiry can destroy a reader yet retain its lease without a backend identity',async()=>{
 const h=harness(),result=await settle(h,true)
 assert.equal(result.error.code,'lease_expired');assert.equal(result.cleanup.code,'reader_cleanup_unknown');assert.equal(h.l.backend,undefined);assert.deepEqual(h.state.releases,[true]);assert.equal(h.s.leases.size,1);assert.equal(h.state.gone.length,0)
})
test('expired actual identity response remains rejected and permits proven owned-backend cleanup',async()=>{
 const h=harness(),result=await settle(h)
 assert.equal(result.error.code,'lease_expired');assert.equal(result.cleanup,undefined);assert.equal(h.l.clean,true);assert.equal(h.s.leases.size,0);assert.deepEqual(h.state.releases,[true]);assert.deepEqual(h.state.gone,[{pid:713,started:'2026-10-29 12:11:23+00'}]);assert.deepEqual(h.state.events.map(v=>v.phase),['reader_bound','reader_ended'])
})
test('unexpired identity retains the original validated binding and post-query check',async()=>{
 const h=harness('success'),result=await settle(h)
 assert.equal(result.error,undefined);assert.equal(h.l.uncertain,false);assert.equal(h.s.leases.size,1);assert.equal(h.l.queryPending,false);assert.deepEqual(h.state.events.map(v=>v.phase),['reader_bound']);h.api.revoke(h.l);await h.api.cleanupLease(h.l);assert.deepEqual(h.state.releases,[false])
})
for(const mode of ['invalid','query-error'])test(mode+' never manufactures backend identity or released capacity',async()=>{
 const h=harness(mode),result=await settle(h)
 assert.ok(result.error);assert.equal(result.cleanup.code,'reader_cleanup_unknown');assert.equal(h.l.backend,undefined);assert.equal(h.s.leases.size,1);assert.equal(h.state.events.length,0);assert.equal(h.state.gone.length,0)
})
test('unsettled identity I/O retains capacity until actual response and cleanup settle',async()=>{
 const h=harness('unsettled'),pending=settle(h);await Promise.resolve();h.state.now=5100;h.api.revoke(h.l);assert.equal(h.s.leases.size,1);assert.equal(h.state.releases.length,0);assert.equal(h.l.queryPending,true);h.state.resolveQuery();const result=await pending;assert.ok(result.error);assert.equal(h.s.leases.size,0);assert.deepEqual(h.state.releases,[true]);assert.equal(h.state.gone.length,1)
})
