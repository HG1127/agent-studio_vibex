import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js'
import { mcpResult, desktopResult } from './result.mjs'
import { registerOffice } from './office.mjs'
import {BROWSER_EVENT_PREFIX,BROWSER_FAILURE_MESSAGES,browserFailureCode,browserObservation,browserReceipt,safeBrowserUrl} from './browser-feedback.mjs'
import {grantCapabilities} from './file-capabilities.mjs'
import {registerFileActions,fileScopeLock,readBoundedRegularFile} from './file-actions.mjs'

const ownDir = path.dirname(fileURLToPath(import.meta.url))
const objectSchema = properties => ({ type: 'object', properties, additionalProperties: false })
const string = { type: 'string' }
const browserTools = new Set(['browser_navigate', 'browser_snapshot', 'browser_click', 'browser_type',
  'browser_fill_form', 'browser_select_option', 'browser_press_key', 'browser_wait_for', 'browser_tabs', 'browser_close'])
const desktopTools = new Set(['Snapshot', 'Screenshot', 'Click', 'Type', 'Scroll', 'ControlStatus'])
const protectedPart = p => /^(?:\.env.*|\.git|\.aws|\.ssh|\.codex|\.agent-studio(?:-trash)?|\.azure|\.gnupg|\.config|\.local|\.local-device-credentials\.json|pb_data|node_modules|appdata|windows|program files(?: \(x86\))?|programdata|credentials.*|.*\.(?:db(?:-wal|-shm)?|sqlite\d*(?:-wal|-shm)?|pem|key|pfx|p12))$/i.test(p)
async function rootChain(root) {
  let cursor=path.parse(root).root
  for(const part of root.slice(cursor.length).split(path.sep).filter(Boolean)){
    cursor=path.join(cursor,part)
    const st=await fs.lstat(cursor)
    if(st.isSymbolicLink()||!st.isDirectory())throw Error('linked_path_denied')
  }
}
function validateFileArguments(schema,args){
  if(Object.keys(args).some(k=>!Object.hasOwn(schema.properties,k))||schema.required.some(k=>!Object.hasOwn(args,k)))throw Error('invalid_file_arguments')
  for(const [k,v] of Object.entries(args)){
    const rule=schema.properties[k]
    if(rule.type==='string'&&(typeof v!=='string'||v.length>(rule.maxLength||1000)||rule.enum&&!rule.enum.includes(v)||rule.pattern&&!new RegExp(rule.pattern).test(v)))throw Error('invalid_file_arguments')
  }
}

export async function createRuntime(config,{openPermissions,invokeFileApplication}={}) {
  if (!Array.isArray(config.roots) || !config.roots.length || config.roots.length>20) throw Error('workspace_roots_required')
  const roots = new Map()
  const readOnlyRoots=new Set(),rootLabels=new Map(),fileAllowlist=new Map(),capabilities=new Map()
  for (const r of config.roots) {
    if (!/^[a-z][a-z0-9_-]{0,30}$/.test(r.name) || roots.has(r.name) || !path.isAbsolute(r.path)) throw Error('invalid_root')
    if(r.readOnly!==undefined&&typeof r.readOnly!=='boolean')throw Error('invalid_root')
    await rootChain(path.resolve(r.path))
    // Existing native configs may point at a specific scratch directory below
    // AppData/Temp. Keep that compatibility; never permit a sensitive credential
    // directory, the vault, or an entire system directory as the root itself.
    if(config.files?.enabled!==false&&(path.resolve(r.path)===path.parse(path.resolve(r.path)).root||protectedPart(path.basename(r.path))||path.resolve(r.path).slice(path.parse(r.path).root.length).split(path.sep).some(p=>protectedPart(p)&&!/^(?:appdata|windows|program files(?: \(x86\))?|programdata)$/i.test(p))))throw Error('private_file_denied')
    const real = await fs.realpath(r.path)
    if (!(await fs.stat(real)).isDirectory()) throw Error('invalid_root')
    roots.set(r.name, real)
    if(r.allowedFiles!==undefined){
      if(!Array.isArray(r.allowedFiles)||!r.allowedFiles.length||r.allowedFiles.length>20||r.allowedFiles.some(n=>typeof n!=='string'||!n||/[\\/:\x00-\x1f]/.test(n)||n==='.'||n==='..'||protectedPart(n)))throw Error('invalid_file_scope')
      fileAllowlist.set(r.name,new Set(r.allowedFiles));readOnlyRoots.add(r.name)
    }
    if(r.readOnly===true)readOnlyRoots.add(r.name)
    capabilities.set(r.name,grantCapabilities(r.capabilities,readOnlyRoots.has(r.name),!!r.allowedFiles))
    rootLabels.set(r.name,(typeof r.label==='string'?r.label:r.name==='work'?'工作文件夹':r.name).replace(/[\x00-\x1f\x7f]/g,'').slice(0,90)+(readOnlyRoots.has(r.name)?'（只读）':'（读取与新建）'))
  }
  async function resolveFile(args, allowMissing = false, listing = false) {
    const root = roots.get(args.root)
    if(allowMissing&&readOnlyRoots.has(args.root))throw Error('workspace_read_only')
    if (!root || typeof args.path !== 'string' || args.path.length > 1000 || /[:\x00-\x1f\x7f]/.test(args.path) || path.isAbsolute(args.path)) throw Error('path_denied')
    const parts = args.path.replaceAll('\\', '/').split('/').filter(Boolean)
    const files=fileAllowlist.get(args.root),normalized=parts.filter(p=>p!=='.').join('/')
    if(files&&(listing?!!normalized:!files.has(normalized)))throw Error('file_not_authorized')
    const rootStat=await fs.lstat(root)
    await rootChain(root)
    if(rootStat.isSymbolicLink()||!rootStat.isDirectory()||await fs.realpath(root)!==root)throw Error('linked_path_denied')
    if (parts.some(p => p !== '.' && (p === '..' || p.endsWith('.') || p.endsWith(' ') || protectedPart(p) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p)))) throw Error('path_denied')
    let target = root
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === '.') continue
      target = path.join(target, parts[i])
      try {
        const stat = await fs.lstat(target)
        if (stat.isSymbolicLink() || stat.isFile() && stat.nlink > 1) throw Error('linked_path_denied')
        const real = await fs.realpath(target)
        if ((config.deniedPaths || []).some(p => path.resolve(p).toLowerCase() === real.toLowerCase())) throw Error('private_file_denied')
        const rel = path.relative(root, real)
        if (rel.startsWith('..') || path.isAbsolute(rel)) throw Error('path_denied')
      } catch (e) { if (!(allowMissing && i === parts.length - 1 && e.code === 'ENOENT')) throw e }
    }
    if((config.deniedPaths||[]).some(p=>{const rel=path.relative(path.resolve(p),target);return !rel||rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel)}))throw Error('private_file_denied')
    return target
  }
  const catalog = [], handlers = new Map(), clients = []
  function add(name, description, inputSchema, handler) {
    catalog.push({ name, description, inputSchema }); handlers.set(name, handler)
  }
  const rootSchema=names=>({type:'string',enum:names,oneOf:names.map(name=>({const:name,title:rootLabels.get(name)}))})
  const writableRoots=[...roots.keys()].filter(name=>!readOnlyRoots.has(name))
  const fileSchema = { ...objectSchema({ root: rootSchema([...roots.keys()]), path: string }), required: ['root', 'path'] }
  if(config.files?.enabled!==false){
  add('files.list', '列出授权目录中的文件，path 可填 .', fileSchema, async args => {
    const target=await resolveFile(args,false,true),restricted=fileAllowlist.get(args.root)
    // A file-only grant does not enumerate the parent folder, even internally.
    const list=restricted?await Promise.all([...restricted].map(async name=>{try{const s=await fs.lstat(path.join(target,name));return {name,isDirectory:()=>s.isDirectory(),isSymbolicLink:()=>s.isSymbolicLink()||s.nlink!==1||!s.isFile()}}catch{return null}})):await fs.readdir(target,{withFileTypes:true})
    const candidates = list.filter(x => x && !protectedPart(x.name) && !x.isSymbolicLink())
    const visible=(await Promise.all(candidates.slice(0,201).map(async x=>{try{await resolveFile({root:args.root,path:path.join(args.path,x.name)});return x}catch{return null}}))).filter(Boolean)
    const entries=[];let truncated=candidates.length>201||visible.length>200,budget=JSON.stringify({root:args.root,path:args.path}).length+50
    for(const x of visible.slice(0,200)){
      const item={name:x.name,directory:x.isDirectory()},length=JSON.stringify(item).length+1
      if(budget+length>11500){truncated=true;break}
      entries.push(item);budget+=length
    }
    return JSON.stringify({ root: args.root, path: args.path, truncated,entries })
  })
  add('files.read', '读取授权目录中的 UTF-8 文本文件（最多 64 KiB）', fileSchema, async args => {
      const bytes=await readBoundedRegularFile(await resolveFile(args),65536)
      if(bytes.includes(0))throw Error('file_not_plain_text')
      try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{throw Error('file_not_plain_text')}
  })
  if(writableRoots.length)add('files.write', '新建 UTF-8 文本文件；拒绝覆盖已有文件，父目录必须已存在',
    { ...fileSchema, properties: { ...fileSchema.properties, root:rootSchema(writableRoots), text: {...string,maxLength:16000} }, required: ['root', 'path', 'text'] }, async (args,signal) => {
      if (typeof args.text !== 'string' || Buffer.byteLength(args.text) > 16000) throw Error('text_too_large')
      return fileScopeLock(roots.get(args.root),signal,async()=>{
      const dest=await resolveFile(args,true)
      if(dest===roots.get(args.root))throw Error('root_mutation_denied')
      await resolveFile({root:args.root,path:path.dirname(args.path)})
      signal?.throwIfAborted()
      await fs.writeFile(dest, args.text, { flag: 'wx', mode: 0o600 })
      return '已新建文件：' + args.root + '/' + args.path
      })
    })
  registerFileActions({add,resolveFile,roots,readOnlyRoots,capabilities,rootSchema,invoke:invokeFileApplication})
  }
  const apps = config.apps || {}
  if (config.files?.enabled!==false && config.office?.enabled === true) registerOffice(add, resolveFile, [...roots.keys()],writableRoots)
  if (Object.keys(apps).length) {
    for (const app of Object.values(apps)) {
      if (!path.isAbsolute(app.command) || !Array.isArray(app.args) || app.args.some(a => typeof a !== 'string')) throw Error('invalid_application')
    }
    add('apps.launch', '启动本机预先配置的软件；参数固定，不能执行模型提供的命令',
      { ...objectSchema({ app: { type: 'string', enum: Object.keys(apps) } }), required: ['app'] }, async args => {
        if (!Object.hasOwn(apps, args.app)) throw Error('application_denied')
        const app = apps[args.app]
        await new Promise((resolve, reject) => {
          const child = spawn(app.command, app.args, { shell: false, windowsHide: true, stdio: 'ignore', env: getDefaultEnvironment() })
          child.once('error', reject); child.once('spawn', () => { child.unref(); resolve() })
        })
        return '已启动：' + args.app + '（未验证软件内部操作）'
      })
  }
  async function connectMcp(name, command, args, cwd, allow, extraEnv = {}, imagesEnabled = false) {
    let observedAt = 0, browserStarted=false, browserEverStarted=false, browserDiagnostic=null, browserStderr='', failedFrameSettled=false
    const failedFrameWaiters=new Set()
    const settledFailure=()=>{failedFrameSettled=true;for(const notify of failedFrameWaiters)notify();failedFrameWaiters.clear()}
    let client
    const startClient=async()=>{
      const owned=new Client({name:'agent-studio-local',version:'1.0.0'},{capabilities:{}})
      const transport=new StdioClientTransport({command,args,cwd,stderr:'pipe',env:{...getDefaultEnvironment(),...extraEnv},maxBufferSize:2*1024*1024})
      client=owned;browserStderr=''
      transport.stderr?.on('data',chunk=>{
        if(name!=='browser'||client!==owned)return
        browserStderr=(browserStderr+String(chunk)).slice(-8192)
        const lines=browserStderr.split(/\r?\n/);browserStderr=lines.pop()||''
        for(const line of lines){if(!line.startsWith(BROWSER_EVENT_PREFIX))continue
          try{
            const value=JSON.parse(line.slice(BROWSER_EVENT_PREFIX.length))
            if(value.kind==='closed'){browserStarted=false;settledFailure()}
            else if(value.kind==='frame'&&value.errorDocument===true)settledFailure()
            else if(value.kind==='failed'&&Object.hasOwn(BROWSER_FAILURE_MESSAGES,value.code)||value.kind==='response'&&Number.isInteger(value.status)&&value.status>=100&&value.status<600)browserDiagnostic=value
          }catch{}
        }
      }) // Retain only safe typed codes from this exact child, never raw stderr.
      clients.push(owned)
      await owned.connect(transport)
    }
    await startClient()
    const listed = await client.listTools()
    for (const tool of listed.tools) {
      if (!allow.has(tool.name)) continue
      const schema = structuredClone(tool.inputSchema)
      // Do not advertise upstream file-output options that this executor denies.
      if (name === 'browser') {
        delete schema.properties?.filename
        if (schema.required) schema.required = schema.required.filter(key => key !== 'filename')
        schema['x-studio-allowed-origins']=[...config.browser.allowedOrigins]
        schema['x-studio-browser-channel']=config.browser.executablePath?'custom':config.browser.channel||'chrome'
        schema['x-studio-browser-feedback']='navigation-v1'
      }
      const description = name === 'browser'
        ? '截图和快照直接返回；禁止传 filename 或指定输出文件。' + (tool.description?.slice(0, 500) || tool.name)
        : tool.description?.slice(0, 600) || tool.name
      add(name + '.' + tool.name, description, schema, async (input, signal) => {
        let callInput = input
        const desktopAction = name === 'desktop' && ['Click', 'Type', 'Scroll'].includes(tool.name)
        if (name === 'desktop') {
          if (['Snapshot', 'Screenshot'].includes(tool.name)) {
            observedAt = 0
            callInput = { ...input, region: config.desktop.region, ...(tool.name === 'Snapshot' ? { use_vision: true } : {}) }
          } else if (desktopAction) {
            if (Date.now() - observedAt > 30000) throw Error('desktop_observation_expired')
            const loc = input.loc, region = config.desktop.region
            if (input.label != null || !Array.isArray(loc) || loc.length !== 2 || !loc.every(Number.isInteger) ||
                loc[0] < region[0] || loc[0] >= region[2] || loc[1] < region[1] || loc[1] >= region[3]) throw Error('desktop_coordinate_denied')
            // Consume the observation before the effect; never reuse it after
            // failure/cancellation. A fresh post-action screenshot is required.
            observedAt = 0
          }
        }
        if (name === 'browser') {
          if (input.filename !== undefined) throw Error('browser_output_path_denied')
          if(!browserStarted&&tool.name!=='browser_navigate'&&tool.name!=='browser_close')throw Error('browser_no_open_page')
          if(!browserStarted&&tool.name==='browser_close')return '独立浏览器尚未启动，没有关闭其他浏览器。'
          if (tool.name === 'browser_navigate') {
            const url = new URL(input.url)
            if (url.username || url.password || !config.browser.allowedOrigins.includes(url.origin)) throw Error('browser_origin_denied')
          }
        }
        if(name==='browser'&&tool.name==='browser_navigate'){
          if(!browserStarted&&browserEverStarted){
            // MCP caches its own selected-tab backend. A browser explicitly
            // closed by the user must get a fresh backend, not a stale tab handle.
            const previous=client;await previous.close();const index=clients.indexOf(previous);if(index>=0)clients.splice(index,1)
            signal?.throwIfAborted();await startClient();await client.listTools()
          }
          browserDiagnostic=null;browserStarted=true;browserEverStarted=true;failedFrameSettled=false
        }
        let result,output
        try{
          result=await client.callTool({ name: tool.name, arguments: callInput }, undefined, { signal, timeout: 60000 })
          output=name==='desktop'?desktopResult(result):mcpResult(result,imagesEnabled)
        }catch(error){
          if(name!=='browser'||signal?.aborted)throw error
          const code=browserDiagnostic?.kind==='failed'?browserDiagnostic.code:browserDiagnostic?.kind==='response'&&browserDiagnostic.status>=400?'browser_http_error':browserFailureCode(error)
          if(code==='browser_page_closed')browserStarted=false
          if(tool.name==='browser_navigate'&&browserStarted&&!failedFrameSettled){
            // Chromium may commit its internal error document after goto rejects.
            // Do not let that late commit interrupt the user's next approved visit.
            await new Promise(resolve=>{const done=()=>{clearTimeout(timer);failedFrameWaiters.delete(done);resolve()};const timer=setTimeout(done,2000);failedFrameWaiters.add(done)})
            if(!failedFrameSettled){try{await client.callTool({name:'browser_close',arguments:{}},undefined,{timeout:5000});browserStarted=false}catch{}}
          }
          throw Error(code,{cause:error})
        }
        if(name==='browser'&&tool.name==='browser_close'){browserStarted=false;browserDiagnostic=null}
        if (name === 'desktop') {
          if (desktopAction) {
            const observed = await client.callTool({ name: 'Screenshot', arguments: { region: config.desktop.region } }, undefined, { signal, timeout: 15000 })
            const captured = desktopResult(observed)
            if (typeof captured === 'string') throw Error('desktop_screenshot_missing', { cause: captured })
            output = { text: String(output).slice(0, 1800) + '\n' + captured.text.slice(0, 10000), images: captured.images }
          }
          if (typeof output !== 'string' && output.images.length) observedAt = Date.now()
          else if (['Snapshot', 'Screenshot'].includes(tool.name)) throw Error('desktop_screenshot_missing', { cause: output })
        }
        // Recent Playwright MCP versions save implicit snapshots to a local
        // file. An explicit read-only snapshot returns the actual page tree.
        if (name === 'browser' && tool.name!=='browser_close') {
          let pageText=typeof output==='string'?output:output.text
          if(tool.name!=='browser_snapshot'){
            const observed=await client.callTool({name:'browser_snapshot',arguments:{}},undefined,{signal,timeout:15000})
            pageText=mcpResult(observed,false)
          }
          const pageUrl=pageText.match(/^- Page URL: (.+)$/m)?.[1]?.trim()
          const httpStatus=browserDiagnostic?.kind==='response'&&browserDiagnostic.url===safeBrowserUrl(pageUrl)?browserDiagnostic.status:undefined
          if(browserDiagnostic?.kind==='response'&&browserDiagnostic.status>=400&&(!pageUrl||/^(?:about:blank|chrome-error:)/.test(pageUrl)))throw Error('browser_http_error')
          const receipt=browserObservation(pageText,{origins:config.browser.allowedOrigins,requestedUrl:tool.name==='browser_navigate'?input.url:'',httpStatus})
          browserStarted=true
          const text=browserReceipt(receipt,pageText)
          output=typeof output==='string'?text:{...output,text}
        }
        return output
      })
    }
  }
  try {
    if (config.desktop?.enabled === true) {
      const d = config.desktop, r = d.region
      if (process.platform !== 'win32' || !path.isAbsolute(d.python || '') || !Array.isArray(r) || r.length !== 4 ||
          !r.every(Number.isInteger) || r[2] <= r[0] || r[3] <= r[1] || r[2] - r[0] > 1920 || r[3] - r[1] > 1080) throw Error('invalid_desktop_config')
      await connectMcp('desktop', d.python, ['-m', 'windows_mcp', 'serve', '--transport', 'stdio', '--tools', [...desktopTools].join(',')],
        [...roots.values()][0], desktopTools, { ANONYMIZED_TELEMETRY: 'false', PYTHONIOENCODING: 'utf-8' }, true)
      for (const tool of catalog.filter(t => t.name.startsWith('desktop.'))) {
        tool.description = 'Windows 桌面：截图会传给本次模型。点击/输入/滚动需先在30秒内截图；仅接受 loc，禁止 label。固定屏幕范围 ' + JSON.stringify(d.region) + '；操作后自动截图。' + tool.description.slice(0, 400)
      }
    }
    if (config.browser?.enabled) {
      if (!Array.isArray(config.browser.allowedOrigins) || !config.browser.allowedOrigins.length) throw Error('browser_origins_required')
      for (const origin of config.browser.allowedOrigins) {
        const url = new URL(origin)
        if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) throw Error('invalid_browser_origin')
      }
      const allow = new Set(browserTools)
      if (config.browser.images === true) allow.add('browser_take_screenshot')
      await connectMcp('browser', process.execPath, [path.join(ownDir, 'browser-server.mjs')], config.browserWorkDirectory||[...roots.values()][0], allow,
        { STUDIO_BROWSER_CONFIG: JSON.stringify(config.browser) }, config.browser.images === true)
    }
    // Local configuration is trusted administrator input, never model input.
    // Use explicit executable paths and per-server tool allowlists.
    for (const [name, server] of Object.entries(config.mcpServers || {})) {
      if (!/^[a-z][a-z0-9_-]{0,24}$/.test(name) || ['files', 'apps', 'browser', 'desktop', 'office'].includes(name) ||
          !path.isAbsolute(server.command) || !Array.isArray(server.tools) || !server.tools.length) throw Error('invalid_mcp_config')
      await connectMcp(name, server.command, server.args || [], [...roots.values()][0], new Set(server.tools), {}, server.images === true)
    }
  } catch (e) { await Promise.allSettled(clients.map(c => c.close())); throw e }
  const advertisedPermissionRevision=config.permissionRevision||config.permissionManagementRevision
  if(catalog.length>50){await Promise.allSettled(clients.map(c=>c.close()));throw Error('tool_count_limit')}
  if(advertisedPermissionRevision){
    if(!/^[a-f0-9]{24}$/.test(advertisedPermissionRevision))throw Error('invalid_permission_revision')
    for(const tool of catalog)tool.inputSchema['x-studio-permission-revision']=advertisedPermissionRevision
  }
  // Authorization management is a separate owner-authenticated control channel,
  // never a model-callable tool. Keep the runtime catalog task-only.
  return {    tools: catalog,
    async execute(input, signal) {
      signal?.throwIfAborted()
      const handler = handlers.get(input.tool)
      if(config.permissionRevision&&input.permission_revision!==config.permissionRevision)throw Error('permission_scope_changed')
      if (!handler || !input.arguments || typeof input.arguments !== 'object' || Array.isArray(input.arguments)) throw Error('tool_denied')
      if(input.tool==='files.write'&&readOnlyRoots.has(input.arguments.root))throw Error('workspace_read_only')
      if(input.tool.startsWith('files.'))validateFileArguments(catalog.find(t=>t.name===input.tool).inputSchema,input.arguments)
      const output = await handler(input.arguments, signal)
      return typeof output === 'string' ? output.slice(0, 12000) : output
    },
    close: () => Promise.allSettled(clients.map(c => c.close())),
  }
}
