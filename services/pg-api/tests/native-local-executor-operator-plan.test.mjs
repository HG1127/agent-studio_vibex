import test from 'node:test'
import assert from 'node:assert/strict'
import {executorOperatorAbi as abi,disabledExecutorReservationSql,executorActivationStatement,executorConnectGrant,executorOperatorTargetGuardSql,inspectExecutorHba} from '../src/native-local-executor-operator-plan.mjs'
import {localExecutorServicePreflightMain} from '../src/native-local-executor-service-preflight-cli.mjs'
import {serviceLoginKinds,serviceLoginDefinition,serviceLoginTargetGuardSql} from '../src/pg18-service-login-policy.mjs'
import {makeNativeScramVerifier,verifyPg18ServiceHbaOrder} from '../src/native-activation-cli.mjs'
import {acceptsNativePg18Credential} from '../src/native-credential-policy.ts'
const rule=(n,type,database,user_name,address,netmask,auth_method)=>({rule_number:n,type,database,user_name,address,netmask,auth_method,error:null,options:[]}),hba=()=>[rule(2,'host',['agent_studio'],[abi.login],'127.0.0.1','255.255.255.255','scram-sha-256'),rule(3,'local',['all'],[abi.login],null,null,'reject'),rule(4,'host',['all'],[abi.login],'0.0.0.0','0.0.0.0','reject'),rule(5,'host',['all'],[abi.login],'::','::','reject')]
test('plan and disabled optional preflight need no environment access, secrets, DB or apply capability',async()=>{
 const env=new Proxy({},{get(){throw Error('plan_must_not_read_env')}}),plan=await localExecutorServicePreflightMain(['--plan'],env);assert.equal(plan.abi.login,abi.login);assert.equal(plan.network_used,false);assert.equal(plan.secrets_read,false);assert.equal(plan.activation_via_this_cli_supported,false);assert.equal(plan.production_cutover_allowed,false);assert.equal((await localExecutorServicePreflightMain(['--service-preflight'],{})).database_opened,false)
 for(const argv of [[],['--apply'],['--activate'],['--service-preflight','arbitrary.json']])await assert.rejects(localExecutorServicePreflightMain(argv,{}),/mode_refused/)
})
test('independent proposal leaves old six-login definitions, target guard and whitelist unchanged',()=>{
 assert.equal(serviceLoginKinds.length,6);assert.throws(()=>serviceLoginDefinition('executor'));assert.equal(executorOperatorTargetGuardSql,serviceLoginTargetGuardSql);assert.match(executorOperatorTargetGuardSql,/5333/);assert.match(disabledExecutorReservationSql,/NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS/);assert.match(disabledExecutorReservationSql,/WITH ADMIN FALSE, INHERIT FALSE, SET TRUE/);assert.equal(/GRANT (?:SELECT|INSERT|UPDATE|ALL)|schema_migrations|LOGIN PASSWORD/i.test(disabledExecutorReservationSql),false);assert.deepEqual(verifyPg18ServiceHbaOrder(hba(),abi.login),{tcp:false,local:false});assert.equal(executorConnectGrant('agentstudio_pg18_ci'),'GRANT CONNECT ON DATABASE agentstudio_pg18_ci TO '+abi.login+';');assert.throws(()=>executorConnectGrant('other; DROP ROLE postgres'))
})
test('activation SQL accepts only canonical original 15000-round SCRAM and one fixed LOGIN',()=>{
 const verifier=makeNativeScramVerifier('a'.repeat(80),Buffer.alloc(16,7));assert.equal(executorActivationStatement(verifier),"ALTER ROLE "+abi.login+" LOGIN PASSWORD '"+verifier+"';")
 for(const value of ["x'; SELECT 1;--",'a'.repeat(80),verifier+'\n',verifier.replace('15000','4096'),verifier.replace('$',' '),verifier.slice(0,-2)+'!!'])assert.throws(()=>executorActivationStatement(value),/verifier_refused/)
})
test('effective HBA accepts only exact loopback SCRAM and first socket/remote deny guards',()=>{assert.equal(inspectExecutorHba(hba()).safe,true);assert.equal(inspectExecutorHba([...hba()].reverse()).safe,true);for(const index of [0,1,2,3]){const rows=hba();rows.splice(index,1);assert.equal(inspectExecutorHba(rows).safe,false)}})
test('earlier broad, regex, group, hostname, alternate protocol or other-database HBA rules fail closed',()=>{
 for(const early of [rule(1,'host',['all'],['all'],'0.0.0.0','0.0.0.0','trust'),rule(1,'local',['all'],['all'],null,null,'trust'),rule(1,'host',['agent_studio'],['+agentstudio_local_executor'],'127.0.0.1','255.255.255.255','scram-sha-256'),rule(1,'host',['/.*'],[abi.login],'localhost',null,'scram-sha-256'),rule(1,'hostssl',['agent_studio'],[abi.login],'127.0.0.1','255.255.255.255','trust'),rule(1,'host',['other'],[abi.login],'192.0.2.0','255.255.255.0','trust')])assert.equal(inspectExecutorHba([early,...hba()]).safe,false)
 for(const mutate of [r=>{r[0].database=['all']},r=>{r[0].auth_method='trust'},r=>{r[1].auth_method='scram-sha-256'},r=>{r[2].user_name=['all']},r=>{r[3].error='invalid'},r=>{r[3].rule_number=2},r=>{r[0].user_name=[1]},r=>{r[0].options=['map=other']}]){const rows=hba();mutate(rows);assert.equal(inspectExecutorHba(rows).safe,false)}
})
test('fifth service secret uses the original exact unit/env and scoped metadata policy',()=>{
 const env={CREDENTIALS_DIRECTORY:'/run/credentials/'+abi.unit,[abi.envKey]:abi.serviceFile},stat={isFile:()=>true,isSymbolicLink:()=>false,uid:1001,gid:1001,mode:0o400,size:80},base={name:'local-executor.secret',file:abi.serviceFile,env,uid:1001,stat,canRead:true};assert.equal(acceptsNativePg18Credential(base),true);assert.equal(acceptsNativePg18Credential({...base,stat:{...stat,uid:0,gid:0,mode:0o440}}),true)
 for(const change of [{file:'/tmp/local-executor.secret'},{env:{...env,[abi.envKey]:'/tmp/local-executor.secret'}},{uid:0},{canRead:false},{stat:{...stat,mode:0o644}},{stat:{...stat,isSymbolicLink:()=>true}}])assert.equal(acceptsNativePg18Credential({...base,...change}),false)
})
