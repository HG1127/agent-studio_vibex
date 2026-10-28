// Hosted real install/restore test; ordinary hosts refuse before any effect.
import test from 'node:test'
import assert from 'node:assert/strict'
import {requireDescriptivePatchInstallCi} from './helpers/agent-descriptive-patch-operator-install-ci-guard.mjs'

const permit=requireDescriptivePatchInstallCi() // BEFORE driver/Docker/source/secret.
const args=process.argv.slice(2)
const helpers=await import('./helpers/agent-descriptive-patch-operator-install-ci-fixture.mjs')
if(args.length===1&&args[0]==='--probe-boundaries'){
 const evidence=await helpers.readDescriptiveInstallBoundarySources(permit)
 test('source boundaries only; no install claim',()=>{for(const[name,ok]of Object.entries(evidence.facts))assert.equal(ok,true,name);assert.equal(evidence.installation_verified,false)})
}else if(args.length===1&&args[0]==='--run'){
 test('actual full059 archive/independent restore and sealed060 install/recovery',{concurrency:false,timeout:1100000},async t=>{
  let f,e
  const scenario=(name,fn)=>t.test(name,{concurrency:false,timeout:180000},async()=>{try{await fn()}catch(error){const message=/^(?:descriptive_patch_operator_|descriptive_install_ci_check:)[a-z_]+$/.test(error?.message??'')?error.message:'bounded_actual_operation_failed';throw Error('descriptive_install_test:'+message)}})
  try{
   f=await helpers.descriptivePatchInstallCiFixture(permit)
   await scenario('actual full059 dump/globals restore validates original private approval and real CLI preflight',async()=>{e=await f.prepare();f.check(e.actualRestore===true,'actual_restore_completed');f.original.assertGeneratedOperatorAuthorization(f.predecessor,e.acceptedOriginal);const result=await f.cliRun('preflight',e);f.check(result.state==='predecessor_exact','real_CLI_preflight');await f.assertRows(e,false)})
   await scenario('expired, mismatched and unquiesced approval declarations refuse without new capability',async()=>{await f.rejectApproval(e,{expires_at:'2000-01-01T00:00:00.000Z'});await f.rejectApproval(e,{database_oid:'1'});await f.rejectApproval(e,{backup_archive_sha256:'0'.repeat(64)});await f.rejectApproval(e,{workers_stopped:false})})
   for(const name of ['ci060_worker','ci060_nested','ci060_api'])await scenario('actual idle NOINHERIT runtime MEMBER blocks060 before journal: '+name,async()=>{await f.quiescence(e,name);await f.assertRows(e,false)})
   await scenario('one real060 DDL and COMMIT follow durable journal, then actual FULL060 and rows remain intact',async()=>{const installed=await f.tracedApply(e);f.check(installed.ddl===1&&installed.commit===1,'single_actual_install');await f.assertRows(e,true)})
   await scenario('real previously accepted capability rejects the changed database OID after owned archive restore',async()=>{const old=e;e=await f.prepare();await f.rejectStale(old);await f.assertRows(e,false)})
   await scenario('actual committed060 with withheld ACK destroys client; readonly recovery never sends DDL again',async()=>{const result=await f.tracedApply(e,{loseAck:true});f.check(result.destroyed===true,'actual_client_destroy_requested');const recovered=await f.recover(e);f.check(recovered.state==='installed_exact','actual_readonly_recovery_full060');await f.assertRows(e,true)})
   await scenario('production CLI uses the same actual backup files and its original accepted reference for a fresh060 install',async()=>{e=await f.prepare();await f.CLIApply(e)})
  }catch(error){const message=/^(?:descriptive_patch_operator_|descriptive_install_ci_check:|descriptive_install_[a-z_]+_refused:)[a-z_]+$/.test(error?.message??'')?error.message:'bounded_authentic_builder_failed';throw Error('descriptive_install_test:'+message)}
  finally{if(f)await f.close()}
 })
}else throw Error('descriptive_install_ci_refused:arguments')
