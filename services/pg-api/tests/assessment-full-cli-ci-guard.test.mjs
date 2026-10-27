// Pure env checks and isolated process-local metadata doubles only. No actual
// attestation/credentials, PostgreSQL, Docker, file mutation or sockets.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import {requireAssessmentFullCliCi,inspectAssessmentFullCliAttestation} from './helpers/assessment-full-cli-ci-guard.mjs'

const serial={concurrency:false},denied={message:'refuse_non_ephemeral_assessment_full_cli_ci'}
const directory='/run/agentstudio-review-cli-ci',file=directory+'/attestation.json',pgdata='/var/lib/postgresql/assessment-cli-ci'
const env=()=>({GITHUB_ACTIONS:'true',CI:'true',RUNNER_OS:'Linux',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_REPOSITORY:'HG1127/agent-studio_vibex',
  GITHUB_WORKFLOW:'Agent Studio PG18 review operator lifecycle isolated verification',GITHUB_JOB:'pg18-review-operator-lifecycle',GITHUB_RUN_ID:'123456789',GITHUB_RUN_ATTEMPT:'2',
  AGENT_STUDIO_ASSESSMENT_CLI_CI_EPHEMERAL:'true',AGENT_STUDIO_ASSESSMENT_CLI_CI_WRITE_APPROVED:'YES_DISPOSABLE_CONTAINER_ONLY',
  AGENT_STUDIO_ASSESSMENT_CLI_CI_ADMIN_PASSWORD:'synthetic-agentstudio-review-cli-123456789-2',AGENT_STUDIO_ASSESSMENT_CLI_CI_CONTAINER_ID:'a'.repeat(64),AGENT_STUDIO_ASSESSMENT_CLI_CI_NONCE:'b'.repeat(64)})
function marker(){return {format:'agentstudio_assessment_full_cli_ci_v1',repository:'HG1127/agent-studio_vibex',workflow:env().GITHUB_WORKFLOW,job:env().GITHUB_JOB,
  run_id:'123456789',run_attempt:'2',container_id:'a'.repeat(64),nonce:'b'.repeat(64),host_inspected:true,image:'pgvector/pgvector:0.8.7-pg18',image_id:'sha256:'+'c'.repeat(64),source_sha256:'d'.repeat(64),created_at:new Date(Date.now()-1000).toISOString(),
  network_mode:'none',published_ports:[],publish_all_ports:false,bind_mounts:[],devices:[],volumes_from:[],tmpfs_mounts:['/run','/var/lib/postgresql'],privileged:false,pid_mode:'private',
  labels:{'org.agentstudio.assessment-cli.run':'123456789','org.agentstudio.assessment-cli.attempt':'2','org.agentstudio.assessment-cli.job':env().GITHUB_JOB,'org.agentstudio.assessment-cli.nonce':'b'.repeat(64)},
  postgres_argv:['postgres','-p','5333','-c','listen_addresses=127.0.0.1','-c','cluster_name=ci-review-'+'b'.repeat(48)],netns:'net:[4026533000]',postgres_netns:'net:[4026533000]',
  test_uid:20001,test_gid:20001,pg_system_identifier:'7777777777777777777',pgdata,fresh_cluster:true}}
const stat=(kind,size=0)=>({dev:1,ino:kind==='file'?2:3,size,mode:kind==='file'?0o100444:0o40555,uid:0,gid:0,nlink:kind==='file'?1:2,mtimeMs:1,ctimeMs:1,
  isFile(){return kind==='file'},isDirectory(){return kind==='directory'},isSymbolicLink(){return false}})
function metadata(options={}){
  const value=options.marker??marker(),raw=options.raw??Buffer.from(JSON.stringify(value)),state={events:[],allocated:[],opens:0,closes:0,offset:0,fstats:0,pathReads:0},restore=[]
  const replace=(object,key,replacement)=>{const before=Object.getOwnPropertyDescriptor(object,key);Object.defineProperty(object,key,{configurable:true,writable:true,value:replacement});restore.push(()=>{if(before)Object.defineProperty(object,key,before);else delete object[key]})}
  replace(process,'platform',options.platform??'linux');replace(process,'getuid',()=>options.uid??20001);replace(process,'getgid',()=>options.gid??20001);replace(process,'getgroups',()=>options.groups??[20001])
  replace(os,'networkInterfaces',()=>options.interfaces??{lo:[{address:'127.0.0.1',internal:true},{address:'::1',internal:true}]})
  const fileStat={...stat('file',raw.length),...(options.fileStat??{})}
  replace(fs,'lstatSync',location=>{state.events.push(['lstat',location]);if(location===file){state.pathReads++;if(state.pathReads>1&&options.pathError)throw Error('private path error');return {...fileStat,...(state.pathReads>1?options.afterPathStat??{}:{})}}
    if(location===directory)return {...stat('directory'),...(options.directoryStat??{})};if(location==='/.dockerenv')return {...stat('file'),mode:0o100555,...(options.dockerStat??{})};if(location===pgdata)return {...stat('directory'),...(options.dataStat??{})};throw Error('unapproved metadata path')})
  replace(fs,'realpathSync',location=>options.realpath?.(location)??location)
  replace(fs,'readlinkSync',location=>{assert.equal(location,'/proc/self/ns/net');return options.netns??'net:[4026533000]'})
  replace(fs,'readFileSync',(location,encoding)=>{state.events.push(['readfile',location]);assert.equal(location,'/proc/self/mountinfo');assert.equal(encoding,'utf8');return options.mounts??'40 1 0:40 / /run rw,nosuid,nodev - tmpfs tmpfs rw\n41 1 0:41 / /var/lib/postgresql rw,nosuid,nodev - tmpfs tmpfs rw\n'})
  replace(fs,'statfsSync',location=>{assert.ok(['/run',directory,'/var/lib/postgresql',pgdata].includes(location));return {type:options.fsType??0x01021994}})
  replace(fs,'openSync',(location,flags)=>{assert.equal(location,file);assert.equal(flags,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);state.opens++;if(options.openError)throw Error('private open error');return 42})
  replace(fs,'fstatSync',fd=>{assert.equal(fd,42);state.fstats++;if(state.fstats>1&&options.fstatError)throw Error('private fstat error');return {...fileStat,...(state.fstats>1?options.afterStat??{}:{})}})
  replace(fs,'readSync',(fd,bytes,offset,length,position)=>{assert.equal(fd,42);assert.equal(position,null);state.allocated.push(bytes);const source=options.grow?Buffer.concat([raw,Buffer.from('x')]):raw,n=Math.min(length,source.length-state.offset);source.copy(bytes,offset,state.offset,state.offset+n);state.offset+=n;return n})
  replace(fs,'closeSync',fd=>{assert.equal(fd,42);state.closes++;if(options.closeError)throw Error('private close error')})
  return {...state,state,restore(){for(const undo of restore.reverse())undo()}}
}
function inspect(options={},body=target=>inspectAssessmentFullCliAttestation(target)){
  const fake=metadata(options)
  try{return {value:body(requireAssessmentFullCliCi(env())),state:fake.state}}
  finally{fake.restore()}
}

test('pure exact GitHub gate returns no connection configuration and accepts the real node test context',serial,()=>{
  const target=requireAssessmentFullCliCi({...env(),NODE_TEST_CONTEXT:'child-v8'})
  assert.deepEqual(target,{runId:'123456789',runAttempt:'2',containerId:'a'.repeat(64),nonce:'b'.repeat(64)});assert.ok(Object.isFrozen(target))
  assert.equal(target.host,undefined);assert.equal(target.password,undefined)
})
test('missing/foreign/nonhosted/unapproved environments and malformed run identity refuse',serial,()=>{
  assert.throws(()=>requireAssessmentFullCliCi({}),denied)
  for(const patch of [{GITHUB_ACTIONS:'false'},{CI:'false'},{RUNNER_OS:'Windows'},{RUNNER_ENVIRONMENT:'self-hosted'},{GITHUB_REPOSITORY:'other/repo'},{GITHUB_WORKFLOW:'other'},{GITHUB_JOB:'other'},
    {GITHUB_RUN_ID:'0'},{GITHUB_RUN_ID:'01'},{GITHUB_RUN_ID:123},{GITHUB_RUN_ID:'1'.repeat(33)},{GITHUB_RUN_ATTEMPT:'0'},{GITHUB_RUN_ATTEMPT:'02'},
    {AGENT_STUDIO_ASSESSMENT_CLI_CI_EPHEMERAL:'false'},{AGENT_STUDIO_ASSESSMENT_CLI_CI_WRITE_APPROVED:'YES_DISPOSABLE_GITHUB_ONLY'},
    {AGENT_STUDIO_ASSESSMENT_CLI_CI_ADMIN_PASSWORD:'wrong-private-password'},{AGENT_STUDIO_ASSESSMENT_CLI_CI_CONTAINER_ID:'A'.repeat(64)},{AGENT_STUDIO_ASSESSMENT_CLI_CI_NONCE:'b'.repeat(63)}])assert.throws(()=>requireAssessmentFullCliCi({...env(),...patch}),denied)
})
test('ambient database, preload, TLS, proxy and unknown profile target/bypass fields refuse without touching metadata',serial,()=>{
  const fake=metadata()
  try{for(const patch of [{DATABASE_URL:'postgres://private'},{PGHOST:'127.0.0.1'},{PGPASSWORD:'private'},{NODE_OPTIONS:'--require private'},{NODE_PATH:'/private'},{NODE_EXTRA_CA_CERTS:'/private'},{NODE_TLS_REJECT_UNAUTHORIZED:'0'},{HTTPS_PROXY:'https://private'},{HTTP_PROXY:'http://private'},{ALL_PROXY:'http://private'},{https_proxy:'http://private'},
    {AGENT_STUDIO_ASSESSMENT_CLI_CI_PORT:'5432'},{AGENT_STUDIO_ASSESSMENT_CLI_CI_SKIP_GUARD:'true'}])assert.throws(()=>requireAssessmentFullCliCi({...env(),...patch}),denied);assert.equal(fake.state.events.length,0);assert.equal(fake.state.opens,0)}finally{fake.restore()}
})
test('ordinary real process inspection refuses an unbranded target before any filesystem operation',serial,()=>{
  const fake=metadata()
  try{for(const value of [undefined,null,{}, {...requireAssessmentFullCliCi(env())}])assert.throws(()=>inspectAssessmentFullCliAttestation(value),denied);assert.equal(fake.state.events.length,0)}finally{fake.restore()}
})
test('only attested actual UID/GID20001 Docker loopback namespace yields the exact postgres5333 target',serial,()=>{
  const {value,state}=inspect();assert.equal(value.host,'127.0.0.1');assert.equal(value.port,5333);assert.equal(value.database,'agent_studio');assert.equal(value.user,'postgres');assert.equal(value.uid,20001);assert.equal(value.gid,20001)
  assert.equal(value.password,'synthetic-agentstudio-review-cli-123456789-2');assert.equal(value.systemIdentifier,'7777777777777777777');assert.equal(value.pgdata,pgdata);assert.equal(value.clusterName,'ci-review-'+'b'.repeat(48));assert.ok(Object.isFrozen(value));assert.equal(state.opens,1);assert.equal(state.closes,1);assert.ok(state.allocated.every(bytes=>bytes.every(v=>v===0)))
})
test('root, wrong UID/GID, privileged groups, wrong kernel netns and external interfaces refuse',serial,()=>{
  for(const options of [{platform:'win32'},{uid:0},{uid:1001},{gid:0},{gid:1001},{groups:[20001,0]},{netns:'bad'},{netns:'net:[4026533999]'},{interfaces:{lo:[{address:'127.0.0.1',internal:true}],eth0:[{address:'172.17.0.2',internal:false}]}},{interfaces:{lo:[{address:'127.0.0.1',internal:false}]}},{dockerStat:{uid:20001}},{dockerStat:{isSymbolicLink(){return true}}}])assert.throws(()=>inspect(options),denied)
})
test('marker owner/mode/symlink/size/hardlink/canonical path and Docker evidence fail closed',serial,()=>{
  for(const options of [{directoryStat:{uid:20001}},{directoryStat:{mode:0o40755}},{directoryStat:{isSymbolicLink(){return true}}},{fileStat:{uid:20001}},{fileStat:{gid:20001}},{fileStat:{mode:0o100644}},{fileStat:{mode:0o100440}},{fileStat:{nlink:2}},{fileStat:{size:0}},{fileStat:{size:16385}},{fileStat:{isSymbolicLink(){return true}}},{realpath:location=>location===file?'/elsewhere/attestation.json':location},{dockerStat:{mode:0o100666}},{dataStat:{isSymbolicLink(){return true}}}])assert.throws(()=>inspect(options),denied)
})
test('stable bounded marker read rejects races/growth/invalid JSON and closes descriptors with generic errors',serial,()=>{
  for(const options of [{afterStat:{ino:999}},{afterStat:{mtimeMs:2}},{afterPathStat:{ctimeMs:2}},{fstatError:true},{pathError:true},{grow:true},{raw:Buffer.from('{bad private_json')},{raw:Buffer.from([0xff,0xfe])},{closeError:true}]){
    const fake=metadata(options)
    try{assert.throws(()=>inspectAssessmentFullCliAttestation(requireAssessmentFullCliCi(env())),denied);assert.equal(fake.state.closes,1);assert.ok(fake.state.allocated.every(bytes=>bytes.every(v=>v===0)))}finally{fake.restore()}
  }
})
test('exact host-inspected marker rejects wrong identity/image/network/mount/privilege/argv/fresh PG evidence',serial,()=>{
  const mutations=[v=>{v.extra='private'},v=>{delete v.fresh_cluster},v=>{v.host_inspected=false},v=>{v.repository='other/repo'},v=>{v.workflow='other'},v=>{v.job='other'},v=>{v.run_id='99'},v=>{v.run_attempt='9'},v=>{v.container_id='e'.repeat(64)},v=>{v.nonce='e'.repeat(64)},v=>{v.image='postgres:18'},v=>{v.image_id='bad'},v=>{v.source_sha256='bad'},v=>{v.created_at=new Date(Date.now()-300001).toISOString()},v=>{v.created_at=new Date(Date.now()+60000).toISOString()},
    v=>{v.network_mode='host'},v=>{v.published_ports=['5333']},v=>{v.publish_all_ports=true},v=>{v.bind_mounts=['/host:/run']},v=>{v.devices=['/dev/private']},v=>{v.volumes_from=['other']},v=>{v.privileged=true},v=>{v.pid_mode='host'},v=>{v.tmpfs_mounts=['/run']},v=>{v.test_uid=0},v=>{v.test_gid=0},v=>{v.postgres_netns='net:[4026533999]'},v=>{v.fresh_cluster=false},v=>{v.pgdata='/host/pgdata'},v=>{v.pg_system_identifier=777},v=>{v.pg_system_identifier='0'},v=>{v.pg_system_identifier='18446744073709551616'},v=>{v.postgres_argv[2]='5432'},v=>{v.labels['org.agentstudio.assessment-cli.nonce']='e'.repeat(64)},v=>{v.labels.extra='private'}]
  for(const mutate of mutations){const value=marker();mutate(value);assert.throws(()=>inspect({marker:value}),denied)}
})
test('actual mountinfo must cover marker, credentials and PGDATA with tmpfs, including nested-mount overrides',serial,()=>{
  const bad=[ '', '40 1 0:40 / /run rw - ext4 disk rw\n41 1 0:41 / /var/lib/postgresql rw - tmpfs tmpfs rw\n',
    '40 1 0:40 / /run rw - tmpfs tmpfs rw\n41 1 0:41 / /var/lib/postgresql rw - ext4 disk rw\n',
    '40 1 0:40 / /run rw - tmpfs tmpfs rw\n41 1 0:41 / /var/lib/postgresql rw - tmpfs tmpfs rw\n42 1 0:42 / /run/credentials rw - ext4 disk rw\n']
  for(const mounts of bad)assert.throws(()=>inspect({mounts}),denied)
  assert.throws(()=>inspect({fsType:0xEF53}),denied,'resolved filesystem type overrides any apparently safe mountinfo')
})
