// Fixed-path OS effects and closed credential values only, never a DB binding.
// The broker must separately prove genuine Control/publication and journal use.
// UID400 is deliberate: ordinary root0440+ACL is NOT asserted to isolate boots.
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {type WorkerHeartbeatKind} from './worker-heartbeat-contract.ts'
import {writerPaths,writerLimits,writerCredentialDirectory,writerCredentialPath,writerUid,writerUuid,writerHex,writerKind,writerDecode,parseWriterBootCredential,writerFail,type WriterBootCredential} from './worker-heartbeat-writer-protocol.ts'

const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex')
const identityKeys=['dev','ino','mode','uid','gid','nlink','size','mtimeMs','ctimeMs'] as const
function linux(root:boolean):number{
 const uid=process.getuid?.()
 if(process.platform!=='linux'||process.versions.node.split('.')[0]!=='24'||!Number.isSafeInteger(uid)||uid===undefined||(root?uid!==0||process.getgid?.()!==0:uid<=0))return writerFail('writer_not_enrolled')
 return uid
}
function ancestors(file:string){
 let current=path.dirname(file);const chain:fs.Stats[]=[]
 for(;;){const st=fs.lstatSync(current);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==0||(st.mode&0o7022)!==0||fs.realpathSync(current)!==current)return writerFail('writer_not_enrolled');chain.push(st);const parent=path.dirname(current);if(parent===current)break;current=parent}
 return chain
}
function stable(a:fs.Stats,b:fs.Stats){if(identityKeys.some(key=>a[key]!==b[key]))writerFail('writer_not_enrolled')}
function readUidFile(file:string,uid:number,max:number):Buffer{
 const chain=ancestors(file),before=fs.lstatSync(file)
 if(!before.isFile()||before.isSymbolicLink()||before.uid!==uid||before.gid!==0||before.nlink!==1||(before.mode&0o7777)!==0o400||before.size<1||before.size>max||fs.realpathSync(file)!==file)return writerFail('writer_not_enrolled')
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK)
 try{
  stable(before,fs.fstatSync(fd));const bytes=Buffer.alloc(before.size+1);let offset=0
  while(offset<bytes.length){const n=fs.readSync(fd,bytes,offset,bytes.length-offset,offset);if(!n)break;offset+=n}
  if(offset!==before.size)return writerFail('writer_not_enrolled')
  stable(before,fs.fstatSync(fd));stable(before,fs.lstatSync(file));if(fs.realpathSync(file)!==file)return writerFail('writer_not_enrolled')
  const after=ancestors(file);if(chain.length!==after.length)return writerFail('writer_not_enrolled');for(let i=0;i<chain.length;i++)stable(chain[i]!,after[i]!)
  return bytes.subarray(0,offset)
 }finally{fs.closeSync(fd)}
}
export function readWorkerHeartbeatWriterCredential(kind:WorkerHeartbeatKind):WriterBootCredential{
 writerKind(kind);const uid=linux(false)
 if(process.env.CREDENTIALS_DIRECTORY!==writerCredentialDirectory(kind))return writerFail('writer_not_enrolled')
 let bytes:Buffer|undefined
 try{
  bytes=readUidFile(writerCredentialPath(kind),uid,writerLimits.credentialBytes)
  const value=parseWriterBootCredential(writerDecode(bytes,writerLimits.credentialBytes),kind)
  if(value.uid!==uid)return writerFail('writer_not_enrolled');return value
 }catch{return writerFail('writer_not_enrolled')}finally{bytes?.fill(0)}
}
function rootStore(){
 linux(true);const parent=path.dirname(writerPaths.store);ancestors(writerPaths.store+'/entry')
 const st=fs.lstatSync(parent);if(st.uid!==0||st.gid!==0||(st.mode&0o7777)!==0o700)return writerFail('writer_not_enrolled')
}
export function ensureWriterCredentialStore():void{
 linux(true);const parent=path.dirname(writerPaths.store);ancestors(parent+'/entry');const st=fs.lstatSync(parent)
 if(st.uid!==0||st.gid!==0||(st.mode&0o7777)!==0o700)return writerFail('writer_not_enrolled')
 try{fs.mkdirSync(writerPaths.store,{mode:0o700})}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')return writerFail('writer_not_enrolled')}
 rootStore();const found=fs.lstatSync(writerPaths.store);if(found.uid!==0||found.gid!==0||!found.isDirectory()||found.isSymbolicLink()||(found.mode&0o7777)!==0o700)return writerFail('writer_not_enrolled')
}
function syncDirectory(){const fd=fs.openSync(writerPaths.store,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
/** Actual namespace observation, not proof of global NSS/cgroup reservation.
 * Deployment MUST reserve the signed UID pool exclusively and disallow restart
 * under a consumed UID. No same-UID isolation claim is made by this check. */
export function assertWriterBootUidUnused(uid:number):void{
 linux(true);if(!writerUid(uid)||fs.statfsSync('/proc').type!==0x9fa0)return writerFail('writer_not_enrolled')
 for(const entry of fs.readdirSync('/proc')){
  if(!/^[1-9][0-9]*$/.test(entry))continue
  let text:string;try{text=fs.readFileSync('/proc/'+entry+'/status','utf8')}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;return writerFail('writer_not_enrolled')}
  const line=text.match(/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/m)
  if(!line)return writerFail('writer_not_enrolled');if(line.slice(1).some(v=>Number(v)===uid))return writerFail('writer_not_enrolled')
 }
}
export type WriterCredentialDelivery=Readonly<{boot_id:string;kind:WorkerHeartbeatKind;uid:number;generation:string;source_file:string;mounted_file:string;sha256:string}>
/** Stages only a non-DB boot token at a fixed Root-owned source directory.
 * It neither launches nor mounts a unit. A parsed delivery record is NOT IPC
 * authority; only a real broker's private current-publication/secret state is. */
export function stageWriterBootCredential(bootId:string,raw:WriterBootCredential):WriterCredentialDelivery{
 linux(true);if(!writerUuid(bootId))return writerFail();const value=parseWriterBootCredential(raw,raw.kind)
 ensureWriterCredentialStore();const file=writerPaths.store+'/'+bootId+'.'+value.kind+'.boot.json',bytes=Buffer.from(JSON.stringify(value)+'\n')
 if(bytes.length>writerLimits.credentialBytes)return writerFail()
 const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600)
 try{fs.writeFileSync(fd,bytes);fs.fchownSync(fd,value.uid,0);fs.fchmodSync(fd,0o400);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
 syncDirectory();const actual=readUidFile(file,value.uid,writerLimits.credentialBytes)
 try{if(!actual.equals(bytes))return writerFail('writer_not_enrolled')}finally{actual.fill(0)}
 const delivery=Object.freeze({boot_id:bootId,kind:value.kind,uid:value.uid,generation:value.generation,source_file:file,mounted_file:writerCredentialPath(value.kind),sha256:hash(bytes)})
 const descriptor=writerPaths.store+'/'+bootId+'.'+value.kind+'.delivery.json',descriptorFd=fs.openSync(descriptor,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600)
 try{fs.writeFileSync(descriptorFd,JSON.stringify(delivery)+'\n');fs.fchmodSync(descriptorFd,0o600);fs.fsyncSync(descriptorFd)}finally{fs.closeSync(descriptorFd)}
 syncDirectory();bytes.fill(0);return delivery
}
export function validateWriterDeliveryDescriptor(raw:unknown):WriterCredentialDelivery{
 // Comparison-only helper, never consumed as a successful enrollment proof.
 if(!raw||typeof raw!=='object')return writerFail()
 const d=Object.getOwnPropertyDescriptors(raw),keys=['boot_id','kind','uid','generation','source_file','mounted_file','sha256']
 if(Reflect.ownKeys(raw).length!==keys.length||keys.some(k=>!d[k]?.enumerable||!Object.hasOwn(d[k]!,'value')))return writerFail()
 const v=Object.fromEntries(keys.map(k=>[k,d[k]!.value])),kind=writerKind(v.kind)
 if(!writerUuid(v.boot_id)||!writerUid(v.uid)||!writerUuid(v.generation)||!writerHex(v.sha256)||v.source_file!==writerPaths.store+'/'+v.boot_id+'.'+kind+'.boot.json'||v.mounted_file!==writerCredentialPath(kind))return writerFail()
 return Object.freeze(v) as WriterCredentialDelivery
}
export function stageWriterBootBatchDescriptor(bootId:string,deliveries:readonly WriterCredentialDelivery[]):void{
 linux(true);rootStore();if(!writerUuid(bootId)||!deliveries.length||deliveries.length>2)return writerFail()
 const items=deliveries.map(validateWriterDeliveryDescriptor)
 if(items.some(item=>item.boot_id!==bootId||item.uid!==items[0]!.uid)||new Set(items.map(item=>item.kind)).size!==items.length)return writerFail()
 const file=writerPaths.store+'/'+bootId+'.batch.delivery.json',fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600)
 try{fs.writeFileSync(fd,JSON.stringify({protocol:'worker_heartbeat_writer_delivery_v1',boot_id:bootId,uid:items[0]!.uid,delivery:'read_only_bind_uid_0400',requires_exclusive_uid_reservation:true,items})+'\n');fs.fchmodSync(fd,0o600);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
 syncDirectory()
}
