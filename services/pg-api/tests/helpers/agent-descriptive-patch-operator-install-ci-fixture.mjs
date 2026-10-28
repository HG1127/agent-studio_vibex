// New-job source probes plus authentic owned full059 archive/restore builder.
// No old workflow spoofing,058 proof alias or fake positive audit/driver result.
import {readFileSync} from 'node:fs'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {randomBytes} from 'node:crypto'
import {execFileSync,spawn} from 'node:child_process'
import {assertDescriptivePatchInstallCiPermit} from './agent-descriptive-patch-operator-install-ci-guard.mjs'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..')
const hash=raw=>createHash('sha256').update(raw).digest('hex')
const fail=label=>{throw Error('descriptive_install_ci_boundary_refused:'+label)}
// Closed diagnostic values only. Never forward PG text, parameters, paths,
// arbitrary messages/stacks or credentials through the builder's failure log.
export const descriptiveInstallCiBuilderPhases=Object.freeze([
 'load_stage_helpers','load_container_helpers','describe_stage','verify_stage_runtime','attest_targets','import_sealed_modules','capture_predecessor',
 'open_main_pool','open_restore_pool','capture_fresh_source','connect_fresh_admin','fresh_begin','fresh_baseline','fresh_stage_api_login','fresh_stage_worker_login','fresh_baseline_verify','fresh_runtime_install','fresh_commit',
 'bootstrap_051','bootstrap_052','bootstrap_053','bootstrap_054','bootstrap_055','bootstrap_056','bootstrap_057','bootstrap_058','bootstrap_059',
 'create_sentinel_bridge','create_sentinel_api','create_sentinel_worker','create_sentinel_nested','enable_native_login','open_native_pool','import_native_repository','seed_native_admin','close_native_pool','full059_verify','capture_full059_dump','initialized',
])
const builderErrorCodes=Object.freeze([
 'fresh_runtime_verification_failed','service_role_password_not_scram','schema_or_role_verification_failed','role_grants_missing',
 'invalid_employee_credentials','native_auth_role_unavailable','native_admin_already_initialized',
 'descriptive_install_ci_check:actual_fresh050_source','descriptive_install_ci_check:frozen_bootstrap_SQL','descriptive_install_ci_check:raw059_pin',
 'descriptive_install_ci_check:FULL058','descriptive_install_ci_check:FULL059','descriptive_install_ci_check:FULL060_state',
 'descriptive_install_container_refused:owner_changed','descriptive_install_container_refused:bounded_docker_operation',
 'descriptive_install_container_refused:private_target_reference_required','descriptive_install_container_refused:fixture_runtime_login',
 'ENOENT','EACCES','ERR_MODULE_NOT_FOUND','ERR_UNKNOWN_FILE_EXTENSION','ECONNREFUSED','ECONNRESET','ETIMEDOUT',
])
export function descriptiveInstallCiBuilderDiagnostic(phase,error){
 let code,message
 try{code=Object.getOwnPropertyDescriptor(error,'code')?.value;message=Object.getOwnPropertyDescriptor(error,'message')?.value}catch{}
 return Object.freeze({diagnostic:'descriptive_install_ci_builder_failure_v1',phase:descriptiveInstallCiBuilderPhases.includes(phase)?phase:'unknown_phase',
  sqlstate:typeof code==='string'&&/^[A-Z0-9]{5}$/.test(code)?code:'no_sqlstate',
  error_code:builderErrorCodes.includes(code)?code:builderErrorCodes.includes(message)?message:'operation_failed'})
}
export const descriptiveInstallCiSourceFiles=Object.freeze({
 oldFixture:'services/pg-api/tests/helpers/agent-generated-operator-ci-fixture.mjs',
 oldBuilder:'ops/pg18-generated-operator-ci.mjs',oldCore:'services/pg-api/src/agent-generated-operator-core.ts',
 core:'services/pg-api/src/agent-descriptive-patch-operator-core.ts',cli:'services/pg-api/src/agent-descriptive-patch-operator-cli.mjs',
 source:'services/pg-api/src/agent-descriptive-patch-operator-source.mjs',runtime:'services/pg-api/src/agent-descriptive-patch-operator-runtime.mjs',
 package:'services/pg-api/package.json',lock:'services/pg-api/pnpm-lock.yaml',
 sql050:'db/postgres/migrations/pg_v9_050_agent_memory_context.sql',sql059:'db/postgres/migrations/pg_v9_059_agent_generated_acceptance.sql',sql060:'db/postgres/migrations/pg_v9_060_agent_descriptive_patch.sql',
})
// Pure AST analysis of supplied SOURCE TEXTS, not approval/proof parsing. The
// returned facts cannot enter any product WeakMap and mint no capability.
export function analyzeDescriptiveInstallBoundaries(sources,ts){
 if(ts?.version!=='5.9.3')fail('actual_parser_required')
 const trees={}
 for(const [name,text]of Object.entries(sources)){if(typeof text!=='string')fail('source_text');if(['package','lock'].includes(name)||name.startsWith('sql'))continue
  const tree=ts.createSourceFile(descriptiveInstallCiSourceFiles[name],text.replaceAll('\r\n','\n'),ts.ScriptTarget.Latest,true,name==='core'||name==='oldCore'?ts.ScriptKind.TS:ts.ScriptKind.JS)
  if(tree.parseDiagnostics.length)fail('source_syntax');trees[name]=tree
 }
 function nodes(tree,predicate){const out=[];const visit=node=>{if(predicate(node))out.push(node);ts.forEachChild(node,visit)};visit(tree);return out}
 const fn=(which,name)=>{const found=nodes(trees[which],n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);if(found.length!==1)fail('function_'+name);return found[0]}
 const calls=(node,name)=>nodes(node,n=>ts.isCallExpression(n)&&n.expression.getText()===name)
 const one=(node,name)=>{const found=calls(node,name);if(found.length!==1)fail('call_'+name.replaceAll('.','_'));return found[0]}
 const variable=(which,name)=>nodes(trees[which],n=>ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.name.text===name)[0]?.initializer
 const literal=node=>ts.isStringLiteralLike(node)?node.text:undefined
 const facts={}
 const oldWorkflow=literal(variable('oldFixture','workflow')),oldJob=literal(variable('oldFixture','job'))
 facts.old_helper_workflow_is_immutable_foreign_job=oldWorkflow==='Agent Studio PG18 generated operator isolated verification'&&oldJob==='pg18-generated-operator'
 const legacyGate=fn('oldFixture','requireGeneratedOperatorCi').getText(),builderGate=fn('oldBuilder','requireGeneratedOperatorProvisionCi').getText()
 facts.old_helper_and_builder_gate_foreign_workflow=legacyGate.includes('env.GITHUB_WORKFLOW!==workflow')&&legacyGate.includes('env.GITHUB_JOB!==job')&&builderGate.includes('env.GITHUB_WORKFLOW!==workflow')&&builderGate.includes('env.GITHUB_JOB!==job')
 const evidence=fn('oldFixture','evidence'),restores=calls(evidence,'full')
 facts.old_evidence_verifies_full058_not_full059=restores.some(n=>n.arguments[0]?.getText()==='admin'&&n.arguments[1]?.kind===ts.SyntaxKind.FalseKeyword)&&restores.some(n=>n.arguments[0]?.getText()==='restoreAdmin'&&n.arguments[1]?.kind===ts.SyntaxKind.FalseKeyword)
 const dumps=calls(evidence,'dockerPg').filter(n=>literal(n.arguments[1])==='pg_dump'),restore=one(evidence,'recreate'),legacyVerify=one(evidence,'core.verifyGeneratedOperatorBackupEvidence')
 facts.old_evidence_dump_restore_precede_original_verifier=dumps.length===1&&dumps[0].end<restore.pos&&restore.end<legacyVerify.pos&&restores.some(n=>n.pos>restore.end&&n.end<legacyVerify.pos)
 facts.old_restore_is_real_archive_path=fn('oldFixture','recreate').getText().includes("'pg_restore'")&&fn('oldFixture','dockerPg').getText().includes("'/usr/bin/docker'")
 const setter=one(fn('oldCore','verifyGeneratedOperatorBackupEvidence'),'backed.set'),get=one(fn('oldCore','assertGeneratedOperatorAuthorization'),'backed.get')
 facts.original_private_backup_brand_is_not_plain_record=variable('oldCore','backed')?.getText()==='new WeakMap<object,VerifiedBackup>()'&&setter.pos>0&&get.pos>0&&calls(trees.oldCore,'backed.set').length===1
 facts.original_authorization_rechecks_actual_clock_and_backup=calls(fn('oldCore','assertGeneratedOperatorAuthorization'),'parseGeneratedOperatorApproval').length===1&&calls(fn('oldCore','assertGeneratedOperatorAuthorization'),'verifyGeneratedOperatorBackupEvidence').length===1
 const auth=fn('core','checkAuthorization')
 facts.new_authorization_consumes_original_reference_without_minting_backup=calls(auth,'assertGeneratedOperatorAuthorization').length===1&&calls(auth,'verifyGeneratedOperatorBackupEvidence').length===0&&auth.getText().includes('predecessorApproval[key]')
 facts.new_authorization_requires_sealed_source=calls(auth,'assertDescriptivePatchOperatorSealedSnapshot').length===1
 facts.expired_and_mismatched_approvals_are_checked=fn('core','approvalFields').getText().includes('Date.parse(v.expires_at)<=now')&&auth.getText().includes("fail('backup_binding_changed')")
 const cli=fn('cli','runDescriptivePatchOperatorCli'),runtimeVerify=one(cli,'runtime.verifyDescriptivePatchOperatorRuntime'),load=one(cli,'runtime.loadDescriptivePatchOperatorPg'),verify=one(cli,'original.verifyGeneratedOperatorBackupEvidence'),authorize=one(cli,'core.authorizeDescriptivePatchOperator')
 const credential=calls(cli,'readPrivate').find(n=>n.arguments[0]?.getText()==='cfg.files.ADMIN_PASSWORD_FILE')
 facts.cli_loads_verified_runtime_before_admin_secret=!!credential&&runtimeVerify.end<load.pos&&load.end<credential.pos
 facts.cli_actual_private_evidence_reaches_original_verifier=verify.arguments.map(n=>n.getText()).join('|')==='predecessorApproval|backup|restore|approval.backup_manifest_sha256|approval.restore_evidence_sha256'&&verify.end<authorize.pos&&authorize.end<credential.pos
 const apply=fn('core','applyDescriptivePatchOperator'),ddl=calls(apply,'db.query').filter(n=>n.arguments[0]?.getText()==='snapshot.body'),persist=one(apply,'persist'),commit=one(apply,'commitDescriptivePatchOperatorTransaction')
 facts.apply_has_one_exact_ddl_after_durable_journal=ddl.length===1&&persist.end<ddl[0].pos&&ddl[0].end<commit.pos
 const commitFn=fn('core','commitDescriptivePatchOperatorTransaction'),pending=calls(commitFn,'persist').find(n=>n.arguments[0]?.getText()==='pending'),commitQuery=calls(commitFn,'db.query').find(n=>literal(n.arguments[0])==='COMMIT')
 facts.commit_pending_is_persisted_before_commit=!!pending&&!!commitQuery&&pending.end<commitQuery.pos&&commitFn.getText().includes('throw new DescriptivePatchOperatorCommitUnknown')
 const recovery=fn('core','recoverDescriptivePatchOperator'),inspect=fn('core','inspectDescriptivePatchOperator')
 facts.recovery_is_readonly_inspection_not_second_install=calls(recovery,'inspectDescriptivePatchOperator').length===1&&calls(recovery,'applyDescriptivePatchOperator').length===0&&calls(inspect,'db.query').some(n=>literal(n.arguments[0])==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')&&!calls(inspect,'db.query').some(n=>n.arguments[0]?.getText()==='snapshot.body')
 const quiescence=variable('core','descriptivePatchOperatorQuiescenceSql')?.getText()??''
 facts.quiescence_covers_transitive_idle_custom_runtime_members=quiescence.includes('pg_catalog.pg_has_role(login.oid,runtime.oid,\'MEMBER\')')&&quiescence.includes('NOT login.rolsuper')&&!/a\.state\s*=/.test(quiescence)&&calls(fn('core','quiescent'),'db.query').length===1
 const hashes=Object.fromEntries(Object.entries(sources).map(([name,text])=>[name,hash(text)]))
 facts.raw050_059_060_stay_fixed=hashes.sql050==='d7889f7dc7be4cd6a8d6d00d2895a1c954c29da6d66d1b55ba02534e43275c89'&&hashes.sql059==='74f884019a36ef33b8f8c95396fe6fa8ec128ece904c915e3495312d4a0d8063'&&hashes.sql060==='b8aac275e692a81d2e05c8825f33bba7e5f418199e3dce97a409832f951ccbc9'
 for(const [name,value]of Object.entries(facts))if(value!==true)fail(name)
 return Object.freeze({mode:'source_boundaries_only',facts:Object.freeze(facts),hashes:Object.freeze(hashes),old_workflow:oldWorkflow,old_job:oldJob,
  canonical_G_package_matches:hashes.package==='90488a84c79a53a83efea6440062941f08668765f76b7effd97bf6a33e4b9d58',lock_matches:hashes.lock==='eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a',
  authentic_builder_required:true,backup_restore_performed:false,product_capability_minted:false,installation_verified:false,production_cutover_allowed:false})
}
export async function readDescriptiveInstallBoundarySources(permit){
 assertDescriptivePatchInstallCiPermit(permit)
 const sources=Object.fromEntries(Object.entries(descriptiveInstallCiSourceFiles).map(([key,file])=>[key,readFileSync(path.join(root,file),'utf8')]))
 if(hash(sources.package)!=='90488a84c79a53a83efea6440062941f08668765f76b7effd97bf6a33e4b9d58'||hash(sources.lock)!=='eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a')fail('canonical_G_dependency_metadata_required')
 const require=createRequire(path.join(root,'services/pg-api/package.json')),parser=require.resolve('typescript')
 if(hash(readFileSync(parser))!=='3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675')fail('actual_parser_required')
 return analyzeDescriptiveInstallBoundaries(sources,require(parser))
}
export async function descriptivePatchInstallCiFixture(permit){
 assertDescriptivePatchInstallCiPermit(permit)
 let phase='load_stage_helpers',builderFailure
 try{
 const stageTools=await import('./agent-descriptive-patch-operator-install-ci-stage.mjs')
 phase='load_container_helpers'
 const owned=await import('./agent-descriptive-patch-operator-install-ci-containers.mjs')
 phase='describe_stage'
 const stage=stageTools.descriptiveInstallStageDescriptor(permit)
 phase='verify_stage_runtime'
 const loaded=await stageTools.loadVerifiedDescriptiveInstallStage(permit,stage)
 // Actual verified stage Pool is obtained BEFORE container metadata or any
 // administrator secret is read. Targets are then attested by real SQL.
 phase='attest_targets'
 const targets=await owned.attestDescriptiveInstallTargets(permit,loaded)
 const from=loaded.from,check=(ok,code)=>{if(!ok)throw Error('descriptive_install_ci_check:'+code)},same=(a,b,code)=>check(JSON.stringify(a)===JSON.stringify(b),code)
 phase='import_sealed_modules'
 const [fresh,installer,baseline,activation,originalSource,original,core,opinion,generated,descriptive,cli]=await Promise.all([
  from('services/pg-api/src/pg18-fresh-runtime-source.mjs'),from('services/pg-api/src/pg18-fresh-runtime-install.ts'),from('services/pg-api/src/baota-pg18-fresh-init.mjs'),from('services/pg-api/src/native-activation-cli.mjs'),
  from('services/pg-api/src/agent-generated-operator-source.mjs'),from('services/pg-api/src/agent-generated-operator-core.ts'),from('services/pg-api/src/agent-descriptive-patch-operator-core.ts'),
  from('services/pg-api/src/agent-opinion-audit.ts'),from('services/pg-api/src/agent-generated-audit.ts'),from('services/pg-api/src/agent-descriptive-patch-audit.ts'),from('services/pg-api/src/agent-descriptive-patch-operator-cli.mjs'),
 ])
 phase='capture_predecessor'
 const predecessor=await originalSource.captureGeneratedOperatorSources();originalSource.assertGeneratedOperatorSnapshot(predecessor,'c934562ba2b8fa6c204bf0fa25573d2a63dc45cfdd6be22f30120a914d2d4bcb')
 const pools=new Map(),passwords=new Map();let admin,restoreAdmin,full059Dump,serial=0,globalsRestored=false,ended=false
 const add=async(target,max=2)=>{const pool=await owned.ownedDescriptivePool(target,max);pools.set(pool,target);return pool}
 const end=async pool=>{if(!pool)return;pools.delete(pool);await pool.end()}
 const closeTarget=async target=>{for(const[pool,owner]of [...pools])if(owner===target)await end(pool)}
 function privateDirectory(dir){if(!dir.startsWith(stage.input+'/')||path.normalize(dir)!==dir)fail('private_test_path');let at='/';for(const part of dir.split('/').filter(Boolean)){at=path.join(at,part);const s=fs.lstatSync(at);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0||s.gid!==0||(s.mode&0o7022)!==0)fail('private_test_ancestor')}}
 function write(file,bytes){privateDirectory(path.dirname(file));const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);try{fs.writeFileSync(fd,bytes);fs.fchmodSync(fd,0o600);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}const d=fs.openSync(path.dirname(file),fs.constants.O_RDONLY|fs.constants.O_DIRECTORY);try{fs.fsyncSync(d)}finally{fs.closeSync(d)}return file}
 const directory=label=>{const dir=stage.input+'/'+label+'-'+(++serial);fs.mkdirSync(dir,{mode:0o700});privateDirectory(dir);return dir}
 async function login(db,name,groups,{existing=false}={}){
  check(['agentstudio_stage_login','agentstudio_stage_worker','agentstudio_native_login','ci060_api','ci060_worker','ci060_nested'].includes(name),'fixed_synthetic_login')
  const password=randomBytes(40).toString('hex');passwords.set(name,password)
  await db.query((existing?'ALTER':'CREATE')+' ROLE '+name+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+activation.makeNativeScramVerifier(password)+"'")
  for(const group of groups){check(['agentstudio_api','agentstudio_worker','ci060_bridge'].includes(group),'fixed_group');await db.query('GRANT '+group+' TO '+name+' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')}
 }
 async function full(pool,installed){
  const c=await pool.connect()
  try{await c.query('BEGIN READ ONLY');await c.query(core.descriptivePatchOperatorContextSql);await c.query('SET LOCAL ROLE agentstudio_api');check(await opinion.verifyAgentOpinionCredentials(c)===true,'FULL058');check(await generated.verifyAgentGeneratedCredentials(c)===true,'FULL059');check(await descriptive.verifyAgentDescriptivePatchCredentials(c)===installed,'FULL060_state')}
  finally{await c.query('ROLLBACK').catch(()=>{});c.release()}
 }
 async function image(pool,physical=false){
  const list=(await pool.query("SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind='r' AND c.relname<>'schema_migrations' AND NOT starts_with(c.relname,'agent_descriptive_patch_') ORDER BY n.nspname,c.relname")).rows
  check(list.some(r=>r.nspname==='agentstudio_auth'&&r.relname==='accounts'),'auth_rows_in_image')
  const q=s=>'"'+s.replaceAll('"','""')+'"',parts=list.map(r=>"SELECT '"+r.nspname+'.'+r.relname+"' AS name,coalesce(jsonb_agg("+(physical?'jsonb_build_array(x.xmin::text,x.ctid::text,to_jsonb(x))':'to_jsonb(x)')+" ORDER BY to_jsonb(x)::text),'[]'::jsonb) AS rows FROM "+q(r.nspname)+'.'+q(r.relname)+' x')
  return hash(JSON.stringify((await pool.query('SELECT jsonb_agg(to_jsonb(s) ORDER BY name) AS image FROM ('+parts.join(' UNION ALL ')+') s')).rows[0].image))
 }
 async function metadata(pool){
  return (await pool.query("SELECT d.datname AS name,pg_get_userbyid(d.datdba) AS owner,d.datconnlimit AS limit,d.datallowconn AS allow,d.datistemplate AS template,t.spcname AS tablespace,pg_encoding_to_char(d.encoding) AS encoding,d.datlocprovider AS provider,d.datcollate AS collate,d.datctype AS ctype,d.datlocale AS locale,d.daticurules AS rules,d.datcollversion AS version,shobj_description(d.oid,'pg_database') AS comment,coalesce((SELECT jsonb_agg(jsonb_build_array(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE g.rolname END,r.rolname,a.privilege_type,a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE g.rolname END,r.rolname,a.privilege_type,a.is_grantable) FROM aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a LEFT JOIN pg_roles g ON g.oid=a.grantee JOIN pg_roles r ON r.oid=a.grantor),'[]'::jsonb) AS acl,(SELECT coalesce(jsonb_agg(jsonb_build_array(CASE WHEN s.setrole=0 THEN 'ALL' ELSE r.rolname END,ARRAY(SELECT v FROM unnest(s.setconfig) AS cfg(v) ORDER BY v)) ORDER BY CASE WHEN s.setrole=0 THEN 'ALL' ELSE r.rolname END),'[]'::jsonb) FROM pg_db_role_setting s LEFT JOIN pg_roles r ON r.oid=s.setrole WHERE s.setdatabase=d.oid) AS settings FROM pg_database d JOIN pg_tablespace t ON t.oid=d.dattablespace WHERE d.datname=current_database()")).rows[0]
 }
 async function globals(pool){return {roles:(await pool.query("SELECT rolname,rolcanlogin,rolsuper,rolinherit,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication,rolconnlimit,rolconfig,rolvaliduntil::text FROM pg_roles WHERE rolname !~ '^pg_' ORDER BY rolname")).rows,members:(await pool.query("SELECT p.rolname AS parent,c.rolname AS child,g.rolname AS grantor,m.admin_option,m.inherit_option,m.set_option FROM pg_auth_members m JOIN pg_roles p ON p.oid=m.roleid JOIN pg_roles c ON c.oid=m.member JOIN pg_roles g ON g.oid=m.grantor WHERE p.rolname !~ '^pg_' OR c.rolname !~ '^pg_' ORDER BY p.rolname,c.rolname,g.rolname")).rows}}
 async function capture(){
  const c=await admin.connect()
  try{await c.query('BEGIN READ ONLY');await c.query(core.descriptivePatchOperatorContextSql);const state=(await c.query(core.descriptivePatchOperatorTargetSql)).rows[0],catalog=(await c.query(core.descriptivePatchOperatorCatalogSql)).rows[0]?.catalog;check(state&&catalog,'actual_target_catalog');return {state,catalog}}
  finally{await c.query('ROLLBACK').catch(()=>{});c.release()}
 }
 async function quiescent(){const until=Date.now()+10000;while(Date.now()<until){const r=(await admin.query(core.descriptivePatchOperatorQuiescenceSql,[[...core.descriptivePatchOperatorRuntimeRoles]])).rows;if(r.length===1&&r[0].count===0)return}throw Error('descriptive_install_ci_check:actual_runtime_sessions_not_quiesced')}
 async function evidence(){
  loaded.assertRuntime();await full(admin,false);await quiescent()
  const {state,catalog}=await capture(),catalogSha=hash(JSON.stringify(catalog)),beforeRows=await image(admin),beforePhysical=await image(admin,true),beforeMetadata=await metadata(admin),beforeGlobals=await globals(admin)
  const dir=directory('actual-full059'),capturedAt=new Date().toISOString(),dump=await owned.ownedDescriptiveArchive(targets.main,'dump'),roles=await owned.ownedDescriptiveArchive(targets.main,'globals')
  const dumpFile=write(dir+'/database.dump',dump),rolesFile=write(dir+'/roles.sql',roles)
  write(dir+'/backup.tar','')
  try{execFileSync('/usr/bin/tar',['-cf',dir+'/backup.tar','-C',dir,'database.dump','roles.sql'],{env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},timeout:45000,maxBuffer:1024*1024,stdio:['ignore','ignore','pipe']})}catch{fail('actual_archive_failed')}
  fs.chmodSync(dir+'/backup.tar',0o600)
  const archiveFd=fs.openSync(dir+'/backup.tar',fs.constants.O_RDWR|fs.constants.O_NOFOLLOW);try{fs.fsyncSync(archiveFd)}finally{fs.closeSync(archiveFd)}
  if(!globalsRestored){const text=roles.toString('utf8');check((text.match(/^CREATE ROLE postgres;$/gm)??[]).length===1,'actual_globals_postgres_duplicate');await owned.ownedDescriptiveArchive(targets.restore,'restore_globals',Buffer.from(text.replace(/^CREATE ROLE postgres;\r?\n/m,'')));globalsRestored=true}
  await closeTarget(targets.restore);restoreAdmin=undefined
  await owned.restoreOwnedDescriptiveDatabase(targets.restore,dump);restoreAdmin=await add(targets.restore)
  await full(restoreAdmin,false)
  same(await metadata(restoreAdmin),beforeMetadata,'actual_restored_database_metadata');same(await globals(restoreAdmin),beforeGlobals,'actual_restored_globals');check(await image(restoreAdmin)===beforeRows,'actual_restored_business_auth_rows')
  same(await metadata(admin),beforeMetadata,'source_metadata_unchanged');same(await globals(admin),beforeGlobals,'source_globals_unchanged');check(await image(admin)===beforeRows,'source_rows_unchanged')
  check(hash(readFileSync(dumpFile))===hash(dump)&&hash(readFileSync(rolesFile))===hash(roles),'actual_archive_parts_stable')
  const archive=readFileSync(dir+'/backup.tar'),archiveSha=hash(archive),backup={format:'pg18_generated_059_backup_v1',archive_sha256:archiveSha,system_identifier:state.system_identifier,database_oid:state.database_oid,predecessor_schema_sha256:catalogSha,fresh_runtime_source_sha256:loaded.snapshot.manifest.default_fresh_source_sha256,captured_at:capturedAt}
  const bytes=value=>Buffer.from(JSON.stringify(value)+'\n'),backupBytes=bytes(backup),backupSha=hash(backupBytes)
  // restored:true is reached ONLY AFTER the actual independent restore and all
  // original FULL059/rows/globals/database metadata comparisons above passed.
  const restored={format:'pg18_generated_059_restore_v1',backup_manifest_sha256:backupSha,archive_sha256:archiveSha,system_identifier:state.system_identifier,database_oid:state.database_oid,predecessor_schema_sha256:catalogSha,verified_at:new Date().toISOString(),restored:true},restoreBytes=bytes(restored),restoreSha=hash(restoreBytes)
  const originalRaw={format:'agent_generated_operator_approval_v1',source_sha256:predecessor.source_sha256,system_identifier:state.system_identifier,database_oid:state.database_oid,predecessor_schema_sha256:catalogSha,fresh_runtime_source_sha256:loaded.snapshot.manifest.default_fresh_source_sha256,backup_manifest_sha256:backupSha,backup_archive_sha256:archiveSha,restore_evidence_sha256:restoreSha,expires_at:new Date(Date.now()+3600000).toISOString(),feature_disabled:true,maintenance_approved:true}
  const originalBytes=bytes(originalRaw),acceptedOriginal=original.parseGeneratedOperatorApproval(originalRaw,predecessor)
  original.verifyGeneratedOperatorBackupEvidence(acceptedOriginal,backup,restored,backupSha,restoreSha)
  original.assertGeneratedOperatorAuthorization(predecessor,acceptedOriginal)
  await quiescent()
  const raw={format:'agent_descriptive_patch_operator_approval_v1',source_sha256:loaded.snapshot.source_sha256,predecessor_source_sha256:predecessor.source_sha256,...Object.fromEntries(['system_identifier','database_oid','predecessor_schema_sha256','fresh_runtime_source_sha256','backup_manifest_sha256','backup_archive_sha256','restore_evidence_sha256','expires_at','feature_disabled','maintenance_approved'].map(key=>[key,originalRaw[key]])),workers_stopped:true,writes_disabled:true,installation_approved:true}
  const approval=core.parseDescriptivePatchOperatorApproval(raw,loaded.snapshot,loaded.snapshot.source_sha256)
  // Same staged original module instance/reference; no plain proof alias.
  const capability=core.authorizeDescriptivePatchOperator(loaded.snapshot,approval,predecessor,acceptedOriginal,'install'),approvalBytes=bytes(raw)
  const files={approval:write(dir+'/approval.json',approvalBytes),original:write(dir+'/original059.json',originalBytes),backup:write(dir+'/backup.json',backupBytes),restore:write(dir+'/restore.json',restoreBytes),archive:dir+'/backup.tar'}
  write(dir+'/ACTUAL_RESTORE_OBSERVATION.json',bytes({independent_system_identifier:targets.restore.systemIdentifier,source_system_identifier:state.system_identifier,full059_verified:true,rows_equal:true,globals_equal:true,database_metadata_equal:true}))
  return {dir,files,raw,approval,acceptedOriginal,capability,approvalSha:hash(approvalBytes),originalSha:hash(originalBytes),beforeRows,beforePhysical,beforeMetadata,beforeGlobals,actualRestore:true}
 }
 function journal(e){
  const file=write(e.dir+'/core-journal.jsonl',''),binding=hash(JSON.stringify({format:'agent_descriptive_patch_operator_journal_binding_v1',source_sha256:loaded.snapshot.source_sha256,approval_sha256:e.approvalSha,predecessor_approval_sha256:e.originalSha})),records=[]
  let previous=binding,contents='';const initial=fs.lstatSync(file)
  const verify=()=>{const st=fs.lstatSync(file);check(st.ino===initial.ino&&st.dev===initial.dev&&st.uid===0&&st.gid===0&&st.nlink===1&&(st.mode&0o7777)===0o600&&readFileSync(file,'utf8')===contents,'durable_journal_unchanged')}
  return {file,records,async persist(record){loaded.assertRuntime();verify();core.parseDescriptivePatchOperatorJournalRecords([...records,record],e.approval);const next=cli.formatDescriptivePatchOperatorJournalLine(record,records.length,previous),fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_APPEND|fs.constants.O_NOFOLLOW);try{fs.writeFileSync(fd,next.line);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}const d=fs.openSync(e.dir,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY);try{fs.fsyncSync(d)}finally{fs.closeSync(d)}contents+=next.line;previous=next.sha256;records.push(record);verify()},verify,phase(){verify();return cli.parseDescriptivePatchOperatorJournalFile(Buffer.from(contents),binding).records.at(-1)?.phase}}
 }
 async function prepare(){
  if(full059Dump){await closeTarget(targets.main);admin=undefined;await owned.restoreOwnedDescriptiveDatabase(targets.main,full059Dump);admin=await add(targets.main)}
  const e=await evidence();e.writer=journal(e);return e
 }
 async function cliRun(mode,e){
  loaded.assertRuntime();const secretFile=stage.input+'/admin.secret',secret=readFileSync(secretFile),secretSha=hash(secret);secret.fill(0)
  const p='AGENT_STUDIO_DESCRIPTIVE_PATCH_060_',env={PATH:path.dirname(process.execPath)+':/usr/bin:/bin',HOME:'/root',LANG:'C.UTF-8',[p+'ENABLED']:'true',[p+'READ_APPROVED']:'APPROVE_DESCRIPTIVE_PATCH_060_READ_ONLY',[p+'APPROVAL_FILE']:e.files.approval,[p+'APPROVAL_SHA256']:e.approvalSha,[p+'PREDECESSOR_APPROVAL_FILE']:e.files.original,[p+'PREDECESSOR_APPROVAL_SHA256']:e.originalSha,[p+'BACKUP_MANIFEST_FILE']:e.files.backup,[p+'BACKUP_ARCHIVE_FILE']:e.files.archive,[p+'RESTORE_EVIDENCE_FILE']:e.files.restore,[p+'ADMIN_PASSWORD_FILE']:secretFile,[p+'ADMIN_PASSWORD_SHA256']:secretSha,[p+'RUNTIME_MANIFEST_FILE']:stage.input+'/runtime-manifest.json',[p+'RUNTIME_MANIFEST_SHA256']:stage.runtimeManifestSha,[p+'RUNTIME_LOCK_SHA256']:'eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a'}
  if(mode==='apply'){env[p+'WRITE_APPROVED']='APPROVE_DESCRIPTIVE_PATCH_060_INSTALL_ONLY';env[p+'JOURNAL_FILE']=e.dir+'/cli-journal.jsonl'}
  return await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--experimental-strip-types',loaded.tree+'/services/pg-api/src/agent-descriptive-patch-operator-cli.mjs','--'+mode,'--confirm-database','agent_studio','--expected-source-sha256',loaded.snapshot.source_sha256],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});let size=0;const chunks=[],timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('descriptive_install_ci_check:CLI_timeout'))},120000);child.stdout.on('data',b=>{size+=b.length;if(size>1024*1024)child.kill('SIGKILL');else chunks.push(b)});child.stderr.on('data',()=>{});child.once('error',()=>{clearTimeout(timer);reject(Error('descriptive_install_ci_check:CLI_start'))});child.once('close',code=>{clearTimeout(timer);if(code!==0)return reject(Error('descriptive_install_ci_check:CLI_refused'));try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch{reject(Error('descriptive_install_ci_check:CLI_result'))}})})
 }
 async function tracedApply(e,{loseAck=false}={}){
  await quiescent()
  const trace=[],observer=await add(targets.main,1);let ddl=0,commit=0,destroyed=false,commitObserved=false,backend
  const wrapper={async connect(){const raw=await admin.connect();raw.on('error',()=>{});backend=(await raw.query('SELECT pg_backend_pid() AS pid,backend_start::text AS start FROM pg_stat_activity WHERE pid=pg_backend_pid()')).rows[0];return {release(destroy){destroyed=!!destroy;raw.release(destroy)},async query(sql,values=[]){
   loaded.assertRuntime();trace.push({kind:sql===loaded.snapshot.body?'DDL':sql==='COMMIT'?'COMMIT':sql.startsWith('BEGIN')?'BEGIN':sql==='ROLLBACK'?'ROLLBACK':'query',sha256:hash(sql)})
   if(sql===loaded.snapshot.body){ddl++;check(e.writer.phase()==='before_ddl','journal_precedes_actual_DDL')}
   if(sql==='COMMIT'){commit++;check(e.writer.phase()==='commit_pending','pending_fsynced_before_actual_COMMIT')}
   const result=await raw.query(sql,values)
   if(sql==='COMMIT'&&loseAck){check(result.command==='COMMIT','real_COMMIT_result');await full(observer,true);commitObserved=true;raw.connection.stream.destroy();throw Error('descriptive_install_ci_actual_commit_ack_withheld')}
   return result
  }}}}
  let result,error
  try{result=await core.applyDescriptivePatchOperator(wrapper,loaded.snapshot,e.capability,e.writer.persist)}catch(caught){error=caught}
  try{if(loseAck&&backend){const until=Date.now()+9000;let gone=false;while(Date.now()<until){if((await observer.query('SELECT NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND backend_start=$2::timestamptz) AS gone',[backend.pid,backend.start])).rows[0].gone===true){gone=true;break}}check(gone,'actual_unknown_backend_disappeared')}}finally{await end(observer)}
  check(ddl===1&&commit===1,'exactly_one_actual_DDL_and_COMMIT')
  if(loseAck){check(commitObserved&&error instanceof core.DescriptivePatchOperatorCommitUnknown&&destroyed,'independently_observed_commit_then_actual_client_destroyed');check(e.writer.phase()==='commit_unknown','durable_unknown_journal');check(!trace.some(r=>r.kind==='ROLLBACK'),'no_rollback_as_commit_proof')}
  else{if(error)throw error;check(result.state==='installed_exact'&&result.invocation_commit_acknowledged===true,'actual_core_install_success')}
  return {result,error,trace,ddl,commit,destroyed}
 }
 async function sentinel(name){
  check(['ci060_api','ci060_worker','ci060_nested'].includes(name),'sentinel_name')
  const pool=await owned.ownedDescriptiveRuntimePool(targets.main,name,passwords.get(name));pools.set(pool,targets.main);const r=(await pool.query('SELECT session_user::text AS login,current_user::text AS actor,pg_backend_pid() AS pid')).rows[0];check(r.login===name&&r.actor===name,'actual_runtime_LOGIN');return {pool,async close(){await end(pool)}}
 }
 async function assertRows(e,installed){await full(admin,installed);check(await image(admin)===e.beforeRows&&await image(admin,true)===e.beforePhysical,'business_auth_physical_rows_unchanged');same(await metadata(admin),e.beforeMetadata,'database_metadata_unchanged');same(await globals(admin),e.beforeGlobals,'globals_unchanged')}
 try{
  phase='open_main_pool';admin=await add(targets.main)
  phase='open_restore_pool';restoreAdmin=await add(targets.restore)
  phase='capture_fresh_source'
  const originalFresh=fresh.captureFreshRuntimeSources();check(originalFresh.source_sha256===loaded.snapshot.manifest.default_fresh_source_sha256,'actual_fresh050_source')
  phase='connect_fresh_admin'
  const db=await admin.connect()
  try{
   phase='fresh_begin';await db.query('BEGIN')
   phase='fresh_baseline';await db.query(originalFresh.baseline.sql)
   phase='fresh_stage_api_login';await login(db,'agentstudio_stage_login',['agentstudio_api'])
   phase='fresh_stage_worker_login';await login(db,'agentstudio_stage_worker',['agentstudio_api','agentstudio_worker'])
   phase='fresh_baseline_verify';await baseline.verifyFreshForTest(db)
   phase='fresh_runtime_install';await installer.installFreshRuntime(db,originalFresh)
   phase='fresh_commit';await db.query('COMMIT')
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error}finally{db.release()}
  const bootstrapPhases=['bootstrap_051','bootstrap_052','bootstrap_053','bootstrap_054','bootstrap_055','bootstrap_056','bootstrap_057','bootstrap_058']
  let bootstrapIndex=0
  for(const[suffix,pin]of Object.entries(stageTools.descriptiveInstallBootstrapSteps)){phase=bootstrapPhases[bootstrapIndex++];const bytes=readFileSync(stage.input+'/bootstrap/'+suffix+'.sql');check(hash(bytes)===pin,'frozen_bootstrap_SQL');await admin.query(bytes.toString('utf8'))}
  // Genuine raw059 setup is separate from the060 operator under test. No old
  //058 evidence() is reused or relabeled as a059 backup/provenance object.
  phase='bootstrap_059';check(hash(predecessor.sql)==='74f884019a36ef33b8f8c95396fe6fa8ec128ece904c915e3495312d4a0d8063','raw059_pin');await admin.query(predecessor.sql)
  phase='create_sentinel_bridge'
  await admin.query('CREATE ROLE ci060_bridge NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION; GRANT agentstudio_worker TO ci060_bridge WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')
  phase='create_sentinel_api';await login(admin,'ci060_api',['agentstudio_api'])
  phase='create_sentinel_worker';await login(admin,'ci060_worker',['agentstudio_worker'])
  phase='create_sentinel_nested';await login(admin,'ci060_nested',['ci060_bridge'])
  phase='enable_native_login';await login(admin,'agentstudio_native_login',[],{existing:true})
  phase='open_native_pool'
  const native=await owned.ownedDescriptiveRuntimePool(targets.main,'agentstudio_native_login',passwords.get('agentstudio_native_login'))
  try{phase='import_native_repository';const {NativeAuthRepository}=await import(pathToFileURL(path.join(root,'services/pg-api/src/native-auth-repository.mjs')).href);phase='seed_native_admin';await new NativeAuthRepository(native).provisionInitialAdmin({email:'descriptive-install-ci@example.test',password:'Synthetic060Employee#'+randomBytes(12).toString('hex'),display_name:'Synthetic060 Employee'});phase='close_native_pool'}finally{await native.end()}
  phase='full059_verify';await full(admin,false)
  phase='capture_full059_dump';full059Dump=await owned.ownedDescriptiveArchive(targets.main,'dump')
  phase='initialized'
  return {loaded,core,original,predecessor,check,same,prepare,cliRun,tracedApply,sentinel,assertRows,
   async recover(e){const trace=[],pool={async connect(){const raw=await admin.connect();return {release:destroy=>raw.release(destroy),async query(sql,values=[]){trace.push(sql);return raw.query(sql,values)}}}};const result=await core.recoverDescriptivePatchOperator(pool,loaded.snapshot,e.capability,e.writer.records);check(trace.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')&&!trace.includes(loaded.snapshot.body)&&!trace.includes('COMMIT')&&result.automatic_retry_authorized===false&&result.invocation_commit_acknowledged===false,'actual_readonly_recovery_no_DDL_or_retry');return result},
   async quiescence(e,name){const held=await sentinel(name);try{let refused=false;try{await core.applyDescriptivePatchOperator(admin,loaded.snapshot,e.capability,e.writer.persist)}catch(error){refused=error?.message==='descriptive_patch_operator_runtime_connections_present'}check(refused&&e.writer.records.length===0,'actual_transitive_session_blocks_before_journal')}finally{await held.close()}},
   async rejectApproval(e,change){const raw={...e.raw,...change};let refused=false;try{const approval=core.parseDescriptivePatchOperatorApproval(raw,loaded.snapshot,loaded.snapshot.source_sha256);core.authorizeDescriptivePatchOperator(loaded.snapshot,approval,predecessor,e.acceptedOriginal,'install')}catch{refused=true}check(refused,'derived_stale_mismatch_expired_approval_refused')},
   async rejectStale(e){let refused=false;try{await core.inspectDescriptivePatchOperator(admin,loaded.snapshot,e.capability)}catch(error){refused=error?.message==='descriptive_patch_operator_target_changed'}check(refused,'real_old_accepted_capability_rejects_new_database_oid')},
   async CLIApply(e){const result=await cliRun('apply',e);check(result.state==='installed_exact','production_CLI_apply');const raw=readFileSync(e.dir+'/cli-journal.jsonl'),binding=hash(JSON.stringify({format:'agent_descriptive_patch_operator_journal_binding_v1',source_sha256:loaded.snapshot.source_sha256,approval_sha256:e.approvalSha,predecessor_approval_sha256:e.originalSha})),journal=cli.parseDescriptivePatchOperatorJournalFile(raw,binding);check(hash(raw)===result.journal_sha256,'actual_CLI_journal_raw_hash');same(journal.records.map(r=>r.phase),['before_ddl','commit_pending','commit_acknowledged'],'actual_CLI_durable_phases');await assertRows(e,true);return result},
   async close(){if(ended)return;ended=true;let failure=false;for(const pool of [...pools.keys()])try{await end(pool)}catch{failure=true}passwords.clear();if(failure)throw Error('descriptive_install_ci_check:cleanup')},
  }
 }catch(error){builderFailure=error;for(const pool of [...pools.keys()])await end(pool).catch(()=>{});passwords.clear();throw Error('descriptive_install_ci_check:actual_builder_failed')}
 }catch(error){
  try{process.stderr.write(JSON.stringify(descriptiveInstallCiBuilderDiagnostic(phase,builderFailure??error))+'\n')}catch{}
  throw error
 }
}
