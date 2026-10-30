// Kernel observations only. Callers cannot turn a PID into an owned handle.
import fs from 'node:fs'
import {finalCompanionFail as fail,finalCompanionIdentityMatches,checkFinalCompanionHostAllocation} from './pg18-full069-final-companion-contract.mjs'
export function readFinalCompanionKernelProcess(pid){
 if(!Number.isSafeInteger(pid)||pid<1)fail('kernel_pid')
 const root='/proc/'+pid+'/',raw=fs.readFileSync(root+'stat','utf8'),parts=raw.slice(raw.lastIndexOf(')')+2).split(' '),status=fs.readFileSync(root+'status','utf8'),field=k=>{const m=new RegExp('^'+k+':[\\t ]*([^\\r\\n]*)$','m').exec(status);if(!m)fail('kernel_field');return m[1].trim()}
 return {pid,parent_pid:Number(parts[1]),start_ticks:parts[19],state:parts[0],uids:field('Uid').split(/\s+/).map(Number),gids:field('Gid').split(/\s+/).map(Number),groups:field('Groups').split(/\s+/).filter(Boolean).map(Number).sort((a,b)=>a-b),capabilities_zero:['CapInh','CapPrm','CapEff','CapBnd','CapAmb'].every(k=>/^0+$/.test(field(k))),no_new_privs:field('NoNewPrivs')==='1',argv:fs.readFileSync(root+'cmdline').toString('utf8').split('\0').filter(Boolean),mount_namespace:fs.readlinkSync(root+'ns/mnt')}
}
export function sameFinalCompanionKernel(pid,start){try{return readFinalCompanionKernelProcess(pid).start_ticks===start}catch{return false}}
export function matchFinalCompanionKernel(p,c){return finalCompanionIdentityMatches(c.spec)&&p.pid===c.pid&&p.start_ticks===c.start_ticks&&p.parent_pid===c.outer.pid&&p.uids.length===4&&p.gids.length===4&&p.uids.every(v=>v===c.spec.uid)&&p.gids.every(v=>v===c.spec.gid)&&JSON.stringify(p.groups)===JSON.stringify([...c.spec.groups].sort((a,b)=>a-b))&&p.capabilities_zero&&p.no_new_privs&&p.mount_namespace!==c.parentNamespace&&p.mount_namespace===c.outerNamespace&&JSON.stringify(p.argv)===JSON.stringify([process.execPath,'--experimental-strip-types',c.entry,...c.args])&&['R','S'].includes(p.state)}
function hostAccountFile(file){
 for(const dir of ['/','/etc']){const d=fs.lstatSync(dir);if(!d.isDirectory()||d.isSymbolicLink()||d.uid!==0||d.gid!==0||(d.mode&0o022)!==0)fail('host_account_parent')}
 const a=fs.lstatSync(file),keys=['dev','ino','size','mtimeMs','ctimeMs','uid','gid','mode','nlink'];if(!a.isFile()||a.isSymbolicLink()||a.nlink!==1||a.uid!==0||a.gid!==0||(a.mode&0o022)!==0||a.size<1||a.size>2097152||fs.realpathSync(file)!==file)fail('host_account_file')
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const opened=fs.fstatSync(fd);if(keys.some(k=>a[k]!==opened[k]))fail('host_account_changed');const bytes=fs.readFileSync(fd),b=fs.fstatSync(fd),z=fs.lstatSync(file);if(keys.some(k=>a[k]!==b[k]||a[k]!==z[k])||bytes.includes(0)||!Buffer.from(bytes.toString('utf8')).equals(bytes))fail('host_account_changed');return bytes.toString('utf8')}finally{fs.closeSync(fd)}
}
export function assertFinalCompanionExclusiveUids(specs,owned){
 checkFinalCompanionHostAllocation(specs,hostAccountFile('/etc/passwd'),hostAccountFile('/etc/group'))
 const uids=new Set(specs.map(s=>s.uid)),gids=new Set(specs.map(s=>s.gid))
 for(const name of fs.readdirSync('/proc')){if(!/^[1-9][0-9]*$/.test(name))continue;let p;try{
  const status=fs.readFileSync('/proc/'+name+'/status','utf8'),field=k=>{const m=new RegExp('^'+k+':[\\t ]*([0-9\\t ]*)$','m').exec(status);if(!m)fail('kernel_identity');return m[1].trim().split(/\s+/).filter(Boolean).map(Number)}
  if(!field('Uid').some(v=>uids.has(v))&&!field('Gid').some(v=>gids.has(v))&&!field('Groups').some(v=>gids.has(v)))continue;p=readFinalCompanionKernelProcess(Number(name))
 }catch(e){if(!fs.existsSync('/proc/'+name))continue;throw e}if(owned.get(p.pid)!==p.start_ticks)fail('uid_not_exclusive')}
}
export function finalCompanionOwnsListener(pid,port){
 const inodes=new Set();for(const fd of fs.readdirSync('/proc/'+pid+'/fd'))try{const m=/^socket:\[([0-9]+)\]$/.exec(fs.readlinkSync('/proc/'+pid+'/fd/'+fd));if(m)inodes.add(m[1])}catch{}
 const target=Number(port).toString(16).toUpperCase().padStart(4,'0');let exact=0
 for(const file of ['/proc/net/tcp','/proc/net/tcp6'])for(const line of fs.readFileSync(file,'utf8').trim().split('\n').slice(1)){const a=line.trim().split(/\s+/);if(a[3]!=='0A'||!inodes.has(a[9]))continue;const [ip,p]=a[1].split(':');if(p===target){if(file!=='/proc/net/tcp'||ip!=='0100007F')fail('listener_bind');exact++}else fail('unexpected_listener')}
 return exact===1
}
