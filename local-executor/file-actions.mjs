import fs from 'node:fs/promises'
import {constants} from 'node:fs'
import path from 'node:path'
import {createHash,randomBytes} from 'node:crypto'
import {spawn} from 'node:child_process'

export const DIGEST_LIMIT = 8 * 1024 * 1024
export const EDIT_LIMIT = 65536
export const VAULT = '.agent-studio-trash'
const locks = new Map()
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const idPattern = /^[a-f0-9]{32}$/
const hashPattern = /^[a-f0-9]{64}$/
const reason = error => /^[a-zA-Z0-9_]{1,80}$/.test(error.code||error.message||'') ? error.code||error.message : 'effect_interrupted'
const object = properties => ({type:'object',properties,additionalProperties:false,required:Object.keys(properties)})
const text = {type:'string',maxLength:1000}
const abort = signal => signal?.throwIfAborted()
const identity = (a,b) => a.dev===b.dev && a.ino===b.ino
export async function fileScopeLock(root, signal, effect) {
  // Serialize this process's file effects across overlapping/aliased grants too.
  // This is deliberately conservative; it does not lock out external OS writers.
  root='local-file-effects'
  const previous=locks.get(root)||Promise.resolve()
  let release
  const current=new Promise(resolve=>{release=resolve})
  const tail=previous.catch(()=>{}).then(()=>current)
  locks.set(root,tail)
  await previous.catch(()=>{})
  try{abort(signal);return await effect()}finally{release();if(locks.get(root)===tail)locks.delete(root)}
}
export function canonicalRelative(value) {
  if(typeof value!=='string'||!value||value.length>1000||value.includes('\\')||path.isAbsolute(value)||
      /[:\x00-\x1f\x7f]/.test(value)||value.split('/').some(p=>!p||p==='.'||p==='..')) throw Error('invalid_recovery_path')
  return value
}
async function regular(file, limit=DIGEST_LIMIT, writable=false) {
  const before=await fs.lstat(file)
  if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size>limit)throw Error('file_size_or_type_denied')
  const handle=await fs.open(file,(writable?constants.O_RDWR:constants.O_RDONLY)|(constants.O_NOFOLLOW||0))
  try{
    const st=await handle.stat(),current=await fs.lstat(file)
    if(!st.isFile()||st.nlink!==1||st.size>limit||current.isSymbolicLink()||!identity(st,current)||!identity(st,before))throw Error('file_size_or_type_denied')
    // Read at most limit+1, even if an external writer grows the file mid-read.
    const buffer=Buffer.alloc(Math.min(st.size+1,limit+1))
    const {bytesRead}=await handle.read(buffer,0,buffer.length,0),after=await handle.stat()
    if(bytesRead!==st.size||after.size!==st.size||after.mtimeMs!==st.mtimeMs||after.nlink!==1)throw Error('file_source_changed')
    const bytes=buffer.subarray(0,bytesRead)
    return {handle,st,bytes,sha256:digest(bytes)}
  }catch(e){await handle.close();throw e}
}
async function writeExact(handle,bytes) {
  let offset=0
  while(offset<bytes.length){
    const {bytesWritten}=await handle.write(bytes,offset,bytes.length-offset,offset)
    if(!bytesWritten)throw Error('file_effect_uncertain')
    offset+=bytesWritten
  }
  await handle.truncate(bytes.length);await handle.sync()
}
export async function readBoundedRegularFile(file,limit) {
  const read=await regular(file,limit)
  try{return read.bytes}finally{await read.handle.close()}
}
function plain(bytes) {
  if(bytes.includes(0))throw Error('file_not_plain_text')
  try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{throw Error('file_not_plain_text')}
}
async function directory(target, create=false) {
  if(create)await fs.mkdir(target,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e})
  const st=await fs.lstat(target)
  if(st.isSymbolicLink()||!st.isDirectory()||await fs.realpath(target)!==target)throw Error('invalid_recovery_vault')
}

// Fixed Windows application, literal argument vector, no shell or model-selected
// executable. An injected adapter is only available to the native host/tests.
export const OPEN_EXTENSIONS = new Set(['.txt','.md','.csv','.tsv','.json','.log','.pdf','.png','.jpg','.jpeg','.gif','.bmp','.webp','.docx','.xlsx','.pptx','.odt','.ods','.odp'])
export async function invokeFileApplication(file, reveal, signal, {platform=process.platform,launch=spawn,windows=process.env.SystemRoot||'C:\\Windows'}={}) {
  abort(signal)
  if(platform!=='win32'||typeof reveal!=='boolean'||!path.win32.isAbsolute(file)||!/^[a-z]:\\/i.test(file)||/[\x00-\x1f\x7f",]/.test(file)||!reveal&&!OPEN_EXTENSIONS.has(path.win32.extname(file).toLowerCase())||!path.win32.isAbsolute(windows)||!/^[a-z]:\\windows$/i.test(windows))throw Error('file_open_platform_or_path_denied')
  const command=path.win32.join(windows,'explorer.exe'),args=[reveal?'/select,'+file:file]
  await new Promise((resolve,reject)=>{
    abort(signal)
    // Cancellation is checked before launch. After launch, never terminate a
    // user's document application as a side effect of a later job cancellation.
    const child=launch(command,args,{shell:false,windowsHide:true,stdio:'ignore'})
    child.once('error',reject);child.once('spawn',()=>{child.unref();resolve()})
  })
}

export function registerFileActions({add,resolveFile,roots,readOnlyRoots,capabilities,rootSchema,invoke=invokeFileApplication}) {
  const names=[...roots.keys()],writable=names.filter(n=>!readOnlyRoots.has(n))
  const eligible=cap=>names.filter(n=>capabilities.get(n)[cap]&&(cap==='open'||!readOnlyRoots.has(n)))
  const schema=(names,fields={path:text})=>object({root:rootSchema(names),...fields})
  const normalized=p=>p.replaceAll('\\','/').split('/').filter(p=>p&&p!=='.').join('/')
  async function target(args,missing=false) {
    const file=await resolveFile(args,missing)
    if(file===roots.get(args.root))throw Error('root_mutation_denied')
    return file
  }
  async function parent(args) {
    const rel=normalized(args.path),p=path.posix.dirname(rel)
    // Revalidate every component immediately before the effect.
    const dir=await resolveFile({root:args.root,path:p})
    if(!(await fs.lstat(dir)).isDirectory())throw Error('path_denied')
    return target(args,true)
  }
  async function recheck(args,source,expected) {
    const file=await target(args),check=await regular(file)
    try{if(!identity(source.st,check.st)||check.sha256!==expected)throw Error('file_hash_conflict')}finally{await check.handle.close()}
    await parent(args)
  }
  async function vault(root,create=false) {
    await resolveFile({root,path:'.'},false,true)
    const v=path.join(roots.get(root),VAULT)
    try{await directory(v,create)}catch(e){if(!create&&e.code==='ENOENT')return null;throw e}
    return v
  }
  async function record(root,p,source,kind) {
    const v=await vault(root,true),id=randomBytes(16).toString('hex'),dir=path.join(v,id)
    await fs.mkdir(dir,{mode:0o700})
    const meta={version:1,trash_id:id,path:canonicalRelative(normalized(p)),size:source.bytes.length,sha256:source.sha256,created_at:new Date().toISOString(),kind}
    await fs.writeFile(path.join(dir,'data'),source.bytes,{flag:'wx',mode:0o600,flush:true})
    await fs.writeFile(path.join(dir,'metadata.json'),JSON.stringify(meta),{flag:'wx',mode:0o600,flush:true})
    await fs.writeFile(path.join(dir,'receipt.json'),JSON.stringify({state:'prepared'}),{flag:'wx',mode:0o600,flush:true})
    const saved=await load(root,id)
    try{if(JSON.stringify(saved.meta)!==JSON.stringify(meta)||saved.data.sha256!==source.sha256)throw Error('invalid_recovery_metadata')}finally{await saved.data.handle.close()}
    return {root,dir,meta}
  }
  async function receipt(entry,state) {
    await vault(entry.root)
    await directory(entry.dir)
    const file=path.join(entry.dir,'receipt.json'),current=await regular(file,4096,true)
    try{
      const bytes=Buffer.from(JSON.stringify({state}))
      await writeExact(current.handle,bytes)
    }finally{await current.handle.close()}
  }
  async function load(root,id) {
    if(!idPattern.test(id))throw Error('invalid_trash_id')
    const v=await vault(root),dir=v&&path.join(v,id)
    if(!dir)throw Error('trash_not_found')
    await directory(dir)
    const files=await fs.readdir(dir)
    if(files.length!==3||files.some(n=>!['data','metadata.json','receipt.json'].includes(n)))throw Error('invalid_recovery_vault')
    const m=await regular(path.join(dir,'metadata.json'),8192)
    let meta,state,r
    try{r=await regular(path.join(dir,'receipt.json'),4096);meta=JSON.parse(plain(m.bytes));state=JSON.parse(plain(r.bytes))}finally{await m.handle.close();await r?.handle.close()}
    if(!meta||Object.keys(meta).sort().join(',')!=='created_at,kind,path,sha256,size,trash_id,version'||meta.version!==1||meta.trash_id!==id||!['trash','update','move'].includes(meta.kind)||!Number.isSafeInteger(meta.size)||meta.size<0||meta.size>DIGEST_LIMIT||!hashPattern.test(meta.sha256)||typeof meta.created_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(meta.created_at)||!Number.isFinite(Date.parse(meta.created_at))||!state||Object.keys(state).join(',')!=='state'||!['prepared','completed','restored','uncertain'].includes(state.state))throw Error('invalid_recovery_metadata')
    canonicalRelative(meta.path)
    // Even attacker-supplied metadata cannot choose a path outside this grant,
    // a protected filename, the vault, or another root.
    await target({root,path:meta.path},true)
    const data=await regular(path.join(dir,'data'))
    if(data.bytes.length!==meta.size||data.sha256!==meta.sha256){await data.handle.close();throw Error('invalid_recovery_data')}
    return {root,dir,meta,state:state.state,data}
  }
  async function exclusive(args,bytes,signal) {
    const dest=await parent(args)
    abort(signal)
    const out=await fs.open(dest,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW||0),0o600)
    try{await out.writeFile(bytes);await out.sync()}finally{await out.close()}
    const check=await regular(await target(args))
    try{if(check.sha256!==digest(bytes))throw Error('file_effect_uncertain')}finally{await check.handle.close()}
  }
  function mutation(name,allowed,fields,description,run) {
    if(!allowed.length)return
    add(name,description,schema(allowed,fields),async(args,signal)=>{
      if(!allowed.includes(args.root))throw Error('file_capability_denied')
      return fileScopeLock(roots.get(args.root),signal,()=>run(args,signal))
    })
  }
  add('files.stat','文件元数据；仅对不超过 8 MiB 的普通文件计算 SHA256',schema(names),async(args,signal)=>{
    abort(signal);const file=await resolveFile(args),st=await fs.lstat(file)
    let sha256=null,size=st.size
    if(st.isFile()&&st.size<=DIGEST_LIMIT){const read=await regular(file);try{sha256=read.sha256;size=read.bytes.length}finally{await read.handle.close()}}
    return JSON.stringify({root:args.root,path:args.path,size,sha256,directory:st.isDirectory()})
  })
  mutation('files.mkdir',writable,{path:text},'在授权目录新建一个文件夹；拒绝已有路径',async(args,signal)=>{
    const dest=await parent(args);abort(signal);await fs.mkdir(dest,{mode:0o700})
    await target(args);return JSON.stringify({root:args.root,path:normalized(args.path),directory:true,created:true})
  })
  mutation('files.copy',writable,{path:text,destination:text},'同一授权目录内复制单个普通文件（最多 8 MiB）；拒绝覆盖',async(args,signal)=>{
    const source=await regular(await target(args))
    try{await exclusive({root:args.root,path:args.destination},source.bytes,signal);return JSON.stringify({root:args.root,path:normalized(args.path),destination:normalized(args.destination),size:source.bytes.length,sha256:source.sha256,copied:true})}finally{await source.handle.close()}
  })
  for(const [name,cap] of [['update','edit'],['move','move'],['trash','delete']]){
    mutation('files.'+name,eligible(cap),{path:text,expected_sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},...(name==='update'?{text:{type:'string',maxLength:EDIT_LIMIT}}:name==='move'?{destination:text}:{})},'单个普通文件'+({update:'编辑（64 KiB UTF-8，保留恢复副本）',move:'移动（同目录授权、拒绝覆盖）',trash:'可恢复删除（仅移入本应用恢复库）'})[name]+'；必须匹配原 SHA256',async(args,signal)=>{
      if(!hashPattern.test(args.expected_sha256))throw Error('invalid_expected_sha256')
      const bytes=name==='update'?Buffer.from(args.text,'utf8'):null
      if(bytes&&(bytes.length>EDIT_LIMIT||plain(bytes)!==args.text))throw Error('text_too_large_or_invalid')
      const file=await target(args),source=await regular(file,name==='update'?EDIT_LIMIT:DIGEST_LIMIT,name==='update')
      let saved,effect=false
      try{
        if(source.sha256!==args.expected_sha256)throw Error('file_hash_conflict')
        if(name==='update')plain(source.bytes)
        if(name==='move'){
          const dest=await parent({root:args.root,path:args.destination})
          await fs.lstat(dest).then(()=>{throw Error('destination_exists')},e=>{if(e.code!=='ENOENT')throw e})
        }
        abort(signal);saved=await record(args.root,args.path,source,name)
        await recheck(args,source,args.expected_sha256);abort(signal)
        if(name==='update'){
          effect=true
          await writeExact(source.handle,bytes)
          const result=await regular(await target(args),EDIT_LIMIT)
          try{if(!identity(source.st,result.st)||result.sha256!==digest(bytes))throw Error('file_effect_uncertain')}finally{await result.handle.close()}
        }else{
          if(name==='move'){effect=true;await exclusive({root:args.root,path:args.destination},source.bytes,signal);await recheck(args,source,args.expected_sha256)}
          abort(signal);effect=true;await fs.unlink(file)
          await fs.lstat(file).then(()=>{throw Error('file_effect_uncertain')},e=>{if(e.code!=='ENOENT')throw e})
        }
        await receipt(saved,'completed')
        return JSON.stringify({root:args.root,path:normalized(args.path),size:bytes?bytes.length:source.bytes.length,sha256:bytes?digest(bytes):source.sha256,...(name==='trash'?{trash_id:saved.meta.trash_id,trashed:true}:{recovery_id:saved.meta.trash_id,...(name==='move'?{destination:normalized(args.destination),moved:true}:{updated:true})})})
      }catch(e){
        if(saved&&effect){await receipt(saved,'uncertain').catch(()=>{});throw Error('file_effect_uncertain; recovery_id='+saved.meta.trash_id+'; do_not_retry; '+reason(e))}
        throw e
      }finally{await source.handle.close()}
    })
  }
  mutation('files.trash_list',eligible('delete'),{},'列出当前授权根目录的可恢复删除（最多40项）；未完成操作不会显示为成功',async(args,signal)=>{
    const v=await vault(args.root),entries=[];let truncated=false,budget=0
    if(v){
      const scan=await fs.opendir(v);let count=0
      for await(const item of scan){
        abort(signal);if(++count>200){truncated=true;break}
        if(!idPattern.test(item.name)||item.isSymbolicLink()||!item.isDirectory())throw Error('invalid_recovery_vault')
        const entry=await load(args.root,item.name)
        try{if(entry.meta.kind==='trash'&&entry.state==='completed'){
          const {trash_id,path,size,created_at,sha256}=entry.meta,value={trash_id,path,size,created_at,sha256}
          budget+=JSON.stringify(value).length
          if(entries.length>=40||budget>10500)truncated=true;else entries.push(value)
        }}finally{await entry.data.handle.close()}
      }
    }
    return JSON.stringify({entries,truncated})
  })
  mutation('files.restore',eligible('delete').filter(n=>writable.includes(n)),{trash_id:{type:'string',pattern:'^[a-f0-9]{32}$'}},'恢复当前根目录已删除文件到原路径；拒绝覆盖，要求删除与新建权限',async(args,signal)=>{
    const entry=await load(args.root,args.trash_id);let effect=false
    try{
      if(entry.meta.kind!=='trash'||entry.state!=='completed')throw Error('trash_not_restorable')
      const dest={root:args.root,path:entry.meta.path};await parent(dest);abort(signal)
      // Keep the vault copy and receipt even after restoration.
      effect=true;await exclusive(dest,entry.data.bytes,signal);await receipt(entry,'restored')
      return JSON.stringify({root:args.root,trash_id:args.trash_id,path:entry.meta.path,size:entry.meta.size,sha256:entry.meta.sha256,restored:true})
    }catch(e){
      if(effect&&e.code!=='EEXIST'){await receipt(entry,'uncertain').catch(()=>{});throw Error('file_effect_uncertain; trash_id='+args.trash_id+'; do_not_retry; '+reason(e))}
      throw e
    }finally{await entry.data.handle.close()}
  })
  for(const reveal of [false,true])mutation('files.'+(reveal?'reveal':'open'),eligible('open'),{path:text},reveal?'在连接电脑定位已授权文件':'在连接电脑打开允许的文档/图片；工作台不渲染该文件',async(args,signal)=>{
    const file=await target(args),st=await fs.lstat(file)
    if(!st.isFile()||st.nlink!==1)throw Error('file_size_or_type_denied')
    if(!reveal&&!OPEN_EXTENSIONS.has(path.extname(file).toLowerCase()))throw Error('file_open_type_denied')
    await target(args);abort(signal);await invoke(file,reveal,signal)
    return reveal?'已请求在连接电脑定位文件；未验证窗口状态。':'已请求在连接电脑打开文件；工作台内未渲染，未验证应用内部状态。'
  })
}
