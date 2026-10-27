// Test-only5333 profile. Never import from product src/ or reuse the5432 guard.
// Environment is only the first gate; no Pool/credential/listener is allowed
// until inspectAssessmentFullCliAttestation returns successfully.
import fs from 'node:fs'
import os from 'node:os'

const repository='HG1127/agent-studio_vibex'
const workflow='Agent Studio PG18 review operator lifecycle isolated verification'
const job='pg18-review-operator-lifecycle'
const markerDirectory='/run/agentstudio-review-cli-ci'
const markerPath=markerDirectory+'/attestation.json'
const pgdata='/var/lib/postgresql/assessment-cli-ci'
const image='pgvector/pgvector:0.8.7-pg18'
const maxMarkerBytes=16384
const seals=new WeakSet()
const ciKeys=new Set(['AGENT_STUDIO_ASSESSMENT_CLI_CI_EPHEMERAL','AGENT_STUDIO_ASSESSMENT_CLI_CI_WRITE_APPROVED','AGENT_STUDIO_ASSESSMENT_CLI_CI_ADMIN_PASSWORD','AGENT_STUDIO_ASSESSMENT_CLI_CI_CONTAINER_ID','AGENT_STUDIO_ASSESSMENT_CLI_CI_NONCE'])
const refuse=()=>{throw Error('refuse_non_ephemeral_assessment_full_cli_ci')}
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
const positive=value=>typeof value==='string'&&/^[1-9][0-9]{0,31}$/.test(value)
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key))

export function requireAssessmentFullCliCi(env=process.env){
  if(!env||typeof env!=='object')return refuse()
  const runId=env.GITHUB_RUN_ID,runAttempt=env.GITHUB_RUN_ATTEMPT
  if(env.GITHUB_ACTIONS!=='true'||env.CI!=='true'||env.RUNNER_OS!=='Linux'||env.RUNNER_ENVIRONMENT!=='github-hosted'||
    env.GITHUB_REPOSITORY!==repository||env.GITHUB_WORKFLOW!==workflow||env.GITHUB_JOB!==job||!positive(runId)||!positive(runAttempt)||
    env.AGENT_STUDIO_ASSESSMENT_CLI_CI_EPHEMERAL!=='true'||env.AGENT_STUDIO_ASSESSMENT_CLI_CI_WRITE_APPROVED!=='YES_DISPOSABLE_CONTAINER_ONLY'||
    env.AGENT_STUDIO_ASSESSMENT_CLI_CI_ADMIN_PASSWORD!=='synthetic-agentstudio-review-cli-'+runId+'-'+runAttempt||
    !hex(env.AGENT_STUDIO_ASSESSMENT_CLI_CI_CONTAINER_ID)||!hex(env.AGENT_STUDIO_ASSESSMENT_CLI_CI_NONCE)||
    Object.keys(env).some(key=>env[key]!==undefined&&(key==='DATABASE_URL'||/^PG[A-Z_]/.test(key)||key.startsWith('AGENT_STUDIO_ASSESSMENT_CLI_CI_')&&!ciKeys.has(key)||
      ['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'].includes(key))))return refuse()
  // NODE_TEST_CONTEXT belongs to node --test itself and is intentionally valid
  // here. Only the separately spawned actual service child must strip it.
  const target=Object.freeze({runId,runAttempt,containerId:env.AGENT_STUDIO_ASSESSMENT_CLI_CI_CONTAINER_ID,nonce:env.AGENT_STUDIO_ASSESSMENT_CLI_CI_NONCE})
  seals.add(target)
  return target
}

function permissions(stat){return stat.mode&0o7777}
function stable(a,b){return ['dev','ino','size','mode','uid','gid','nlink','mtimeMs','ctimeMs'].every(key=>a[key]===b[key])}
function markerStat(stat){return stat.isFile()&&!stat.isSymbolicLink()&&stat.uid===0&&stat.gid===0&&stat.nlink===1&&permissions(stat)===0o444&&Number.isSafeInteger(stat.size)&&stat.size>0&&stat.size<=maxMarkerBytes}
function readMarker(){
  const directory=fs.lstatSync(markerDirectory)
  if(!directory.isDirectory()||directory.isSymbolicLink()||directory.uid!==0||directory.gid!==0||permissions(directory)!==0o555||fs.realpathSync(markerDirectory)!==markerDirectory)return refuse()
  const before=fs.lstatSync(markerPath)
  if(!markerStat(before)||fs.realpathSync(markerPath)!==markerPath)return refuse()
  let fd,bytes
  try{
    fd=fs.openSync(markerPath,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW)
    const opened=fs.fstatSync(fd)
    if(!markerStat(opened)||!stable(before,opened))return refuse()
    // Bound the allocation/read even if root changes the file concurrently.
    bytes=Buffer.alloc(before.size+1);let size=0
    while(size<bytes.length){const n=fs.readSync(fd,bytes,size,bytes.length-size,null);if(n===0)break;size+=n}
    const after=fs.fstatSync(fd),current=fs.lstatSync(markerPath),folder=fs.lstatSync(markerDirectory)
    if(size!==before.size||!markerStat(after)||!markerStat(current)||!stable(before,after)||!stable(before,current)||!stable(directory,folder)||fs.realpathSync(markerPath)!==markerPath)return refuse()
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,size)))
  }finally{bytes?.fill(0);if(fd!==undefined)fs.closeSync(fd)}
}
function tmpfsCover(mounts,location){
  const entries=mounts.trim().split('\n').filter(Boolean).map(line=>{
    const split=line.split(' - ');if(split.length!==2)return refuse()
    const left=split[0].split(' '),right=split[1].split(' ')
    if(left.length<6||right.length<3)return refuse()
    const point=left[4].replace(/\\(040|011|012|134)/g,(_all,value)=>String.fromCharCode(parseInt(value,8)))
    return {point,type:right[0]}
  }).filter(item=>location===item.point||location.startsWith(item.point.endsWith('/')?item.point:item.point+'/')).sort((a,b)=>b.point.length-a.point.length)
  return entries[0]?.type==='tmpfs'
}
function validateMarker(value,target,uid,gid,netns){
  if(!exact(value,['format','repository','workflow','job','run_id','run_attempt','container_id','nonce','host_inspected','image','image_id','source_sha256','created_at','network_mode','published_ports','publish_all_ports','bind_mounts','devices','volumes_from','tmpfs_mounts','privileged','pid_mode','labels','postgres_argv','netns','postgres_netns','test_uid','test_gid','pg_system_identifier','pgdata','fresh_cluster']))return refuse()
  if(value.format!=='agentstudio_assessment_full_cli_ci_v1'||value.repository!==repository||value.workflow!==workflow||value.job!==job||
    value.run_id!==target.runId||value.run_attempt!==target.runAttempt||value.container_id!==target.containerId||value.nonce!==target.nonce||value.host_inspected!==true||
    value.image!==image||typeof value.image_id!=='string'||!/^sha256:[a-f0-9]{64}$/.test(value.image_id)||!hex(value.source_sha256)||!recent(value.created_at)||value.network_mode!=='none'||value.privileged!==false||value.pid_mode!=='private'||value.publish_all_ports!==false||
    ![value.published_ports,value.bind_mounts,value.devices,value.volumes_from].every(items=>Array.isArray(items)&&items.length===0)||
    !Array.isArray(value.tmpfs_mounts)||JSON.stringify(value.tmpfs_mounts)!==JSON.stringify(['/run','/var/lib/postgresql'])||
    value.netns!==netns||value.postgres_netns!==netns||value.test_uid!==uid||value.test_gid!==gid||value.pgdata!==pgdata||value.fresh_cluster!==true)return refuse()
  const labels=value.labels
  if(!exact(labels,['org.agentstudio.assessment-cli.run','org.agentstudio.assessment-cli.attempt','org.agentstudio.assessment-cli.job','org.agentstudio.assessment-cli.nonce'])||
    labels['org.agentstudio.assessment-cli.run']!==target.runId||labels['org.agentstudio.assessment-cli.attempt']!==target.runAttempt||labels['org.agentstudio.assessment-cli.job']!==job||labels['org.agentstudio.assessment-cli.nonce']!==target.nonce)return refuse()
  if(typeof value.pg_system_identifier!=='string'||!/^[1-9][0-9]{0,19}$/.test(value.pg_system_identifier)||BigInt(value.pg_system_identifier)>18446744073709551615n)return refuse()
  if(JSON.stringify(value.postgres_argv)!==JSON.stringify(['postgres','-p','5333','-c','listen_addresses=127.0.0.1','-c','cluster_name=ci-review-'+target.nonce.slice(0,48)]))return refuse()
}
function recent(value){const time=typeof value==='string'?Date.parse(value):NaN;return Number.isFinite(time)&&time>=Date.now()-300000&&time<=Date.now()+5000}

export function inspectAssessmentFullCliAttestation(target){
  try{
    if(!seals.has(target)||process.platform!=='linux'||process.getuid?.()!==20001||process.getgid?.()!==20001||typeof process.getgroups!=='function'||process.getgroups().includes(0))return refuse()
    const uid=process.getuid(),gid=process.getgid(),netns=fs.readlinkSync('/proc/self/ns/net')
    if(!/^net:\[[1-9][0-9]*\]$/.test(netns))return refuse()
    const docker=fs.lstatSync('/.dockerenv')
    if(!docker.isFile()||docker.isSymbolicLink()||docker.uid!==0||docker.gid!==0||docker.size>4096||(permissions(docker)&0o022)!==0||fs.realpathSync('/.dockerenv')!=='/.dockerenv')return refuse()
    const interfaces=os.networkInterfaces(),names=Object.keys(interfaces)
    if(names.length!==1||names[0]!=='lo'||!interfaces.lo?.some(item=>item.address==='127.0.0.1')||interfaces.lo.some(item=>item.internal!==true||!['127.0.0.1','::1'].includes(item.address)))return refuse()
    const value=readMarker();validateMarker(value,target,uid,gid,netns)
    const mounts=fs.readFileSync('/proc/self/mountinfo','utf8')
    if(typeof mounts!=='string'||mounts.length>1048576||![markerDirectory,'/run/credentials',pgdata].every(location=>tmpfsCover(mounts,location)))return refuse()
    // The kernel's resolved filesystem type also covers stacked mounts that
    // have identical mountpoints; mountinfo ordering alone is not authority.
    if(!['/run',markerDirectory,'/var/lib/postgresql',pgdata].every(location=>fs.statfsSync(location).type===0x01021994))return refuse()
    const data=fs.lstatSync(pgdata)
    if(!data.isDirectory()||data.isSymbolicLink()||fs.realpathSync(pgdata)!==pgdata)return refuse()
    // Only the fully attested result exposes a connection configuration. The
    // caller MUST still verify server system_identifier/port/address/fresh
    // schemas+roles via readonly SQL before installation or test writes.
    return Object.freeze({host:'127.0.0.1',port:5333,database:'agent_studio',user:'postgres',password:'synthetic-agentstudio-review-cli-'+target.runId+'-'+target.runAttempt,
      max:4,connectionTimeoutMillis:5000,statement_timeout:15000,runId:target.runId,runAttempt:target.runAttempt,containerId:target.containerId,nonce:target.nonce,
      systemIdentifier:value.pg_system_identifier,netns,uid,gid,pgdata,imageId:value.image_id,sourceSha256:value.source_sha256,containerCreatedAt:value.created_at,clusterName:'ci-review-'+target.nonce.slice(0,48)})
  }catch{return refuse()}
}
