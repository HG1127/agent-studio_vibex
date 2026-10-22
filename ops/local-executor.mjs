/**
 * Explicitly enabled, loopback-only Agent Studio local MCP pilot.
 *
 * This is NOT a gateway to the user's normal browser, home directory, OS
 * commands, or saved passwords. It starts isolated Chromium and can access
 * only explicitly allowed loopback origins and files in an explicit sandbox.
 * The Agent Studio owner must separately connect this endpoint and approve
 * tools through the existing server-side Agent authorization workflow.
 */
import { createServer } from "node:http"
import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import * as fs from "node:fs/promises"
import fsSync from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { chromium } from "playwright"
import ExcelJS from "exceljs"

const MAX_JSON_BODY = 64 * 1024
const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_BROWSER_TEXT = 20_000
const MAX_PDF_PAGES = 12
const MAX_EXCEL_ROWS = 1000
const DEFAULT_BROWSER_TIMEOUT = 12_000
const MAX_ACTIVE_TOOL_CALLS = 2

const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value)
const now = () => new Date().toISOString()
const err = message => { throw new Error(message) }
const sha = bytes => createHash("sha256").update(bytes).digest("hex")
// Tool results and audit records must never echo OS paths, website contents or secrets.
const safeError = error => error instanceof Error && /^[a-z][a-z0-9_]{2,60}$/.test(error.message)
  ? error.message : "tool_failed"
const isInside = (base, candidate) => {
  const rel = path.relative(base, candidate)
  return rel === "" || (!rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel))
}
const fixedOrigin = input => {
  try {
    const url = new URL(input)
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      url.protocol !== "http:" || !["localhost","127.0.0.1"].includes(url.hostname))
      return null
    return url.origin
  } catch { return null }
}
function validateUrl(raw, allowedOrigins) {
  if (typeof raw !== "string" || raw.length > 1500) err("invalid_url")
  let url
  try { url = new URL(raw) } catch { err("invalid_url") }
  if (url.username || url.password || url.protocol !== "http:" ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !allowedOrigins.has(url.origin)) err("origin_not_authorized")
  return url
}
function fileName(raw, ext) {
  if (typeof raw !== "string" || raw.length > 120 ||
      /[\x00-\x1f\\:]/.test(raw) || raw.includes("/") || raw === "." || raw === ".." ||
      raw.startsWith(".") || raw.includes("..") || !raw.toLowerCase().endsWith(ext)) err("invalid_file_name")
  return raw
}
function relativeFile(raw, ext) {
  if (typeof raw !== "string" || raw.length > 180 || raw.length < 1 ||
      /[\x00-\x1f\\:]/.test(raw) || path.isAbsolute(raw)) err("invalid_file_path")
  const segments = raw.replace(/\\/g, "/").split("/")
  if (segments.some(x => !x || x === "." || x === "..") || !raw.toLowerCase().endsWith(ext)) err("invalid_file_path")
  return segments
}
async function allowedInputFile(root, relative, extension) {
  const segments = relativeFile(relative, extension)
  const physical = await fs.realpath(path.join(root, ...segments)).catch(() => err("input_file_unavailable"))
  if (!isInside(root, physical)) err("file_outside_workspace")
  const handle = await fs.open(physical, "r")
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES || !stat.size) err("file_size_not_allowed")
    // Bound allocations even if another process modifies a file after realpath/stat.
    const bytes = Buffer.alloc(stat.size)
    let offset = 0
    while (offset < bytes.length) {
      const chunk = await handle.read(bytes, offset, bytes.length - offset, offset)
      if (!chunk.bytesRead) err("file_changed_during_read")
      offset += chunk.bytesRead
    }
    if ((await handle.stat()).size !== bytes.length) err("file_changed_during_read")
    return {bytes, name: segments.join("/")}
  } finally { await handle.close() }
}
function finiteNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) err("non_numeric_spreadsheet_cell")
  return value
}
function cellRef(value) {
  if (typeof value !== "string" || !/^[A-Z]{1,3}[1-9][0-9]{0,3}$/.test(value)) err("invalid_cell_reference")
  return value
}
const TOOL_SCHEMAS = [
  {
    name: "browser_read_page",
    description: "Read an explicitly allowlisted loopback website using a fresh isolated real Chromium page. No cookies or saved logins are used.",
    annotations: { readOnlyHint: true, destructiveHint: false },
    inputSchema: {type:"object",additionalProperties:false,required:["url"],
      properties:{url:{type:"string",description:"Exact URL on an operator-allowlisted local test origin"}}},
  },
  {
    name: "document_pdf_extract",
    description: "Extract actual text from an allowed PDF and return page-numbered source evidence.",
    annotations: {readOnlyHint:true,destructiveHint:false},
    inputSchema: {type:"object",additionalProperties:false,required:["input_path"],
      properties:{input_path:{type:"string"},pages:{type:"array",maxItems:12,items:{type:"integer",minimum:1}}}},
  },
  {
    name: "spreadsheet_analyze",
    description: "Read two numeric cells from an actual allowed XLSX worksheet and independently calculate their difference.",
    annotations: {readOnlyHint:true,destructiveHint:false},
    inputSchema: {type:"object",additionalProperties:false,
      required:["input_path","sheet","left_cell","right_cell"],
      properties:{input_path:{type:"string"},sheet:{type:"string"},left_cell:{type:"string"},right_cell:{type:"string"}}},
  },
]
const EXPORT_SCHEMA = {
  name: "spreadsheet_export_report",
  description: "Create a new real XLSX report in the explicitly configured sandbox artifacts directory. Never overwrite existing files; agent approval is required before invoking this write tool.",
  annotations: {readOnlyHint:false,destructiveHint:false},
  inputSchema: {type:"object",additionalProperties:false,
    required:["output_name","title","rows"],
    properties:{output_name:{type:"string"},title:{type:"string"},
      rows:{type:"array",maxItems:30,items:{type:"object",required:["label","value"],
        properties:{label:{type:"string"},value:{type:"number"}},additionalProperties:false}}}},
}
const BROWSER_ACTION_SCHEMA = {
  name: "browser_registered_action",
  description: "Execute a named, operator-registered Chromium form interaction. No caller-provided URL or selectors; actions may submit approved local forms and require human approval.",
  annotations: {readOnlyHint:false,destructiveHint:true},
  inputSchema: {type:"object",additionalProperties:false,required:["action_id","arguments"],
    properties:{action_id:{type:"string",description:"An ID configured by the local executor operator"},
      arguments:{type:"object",description:"Only registered fill-value keys are accepted"}}},
}

function validateAllowedPaths(raw, allowedOrigins) {
  if (!Array.isArray(raw) || raw.length !== allowedOrigins.size) err("explicit_path_allowlist_required")
  const pathMap = new Map()
  for (const item of raw) {
    if (!isRecord(item) || typeof item.origin !== "string" || !allowedOrigins.has(item.origin) ||
        pathMap.has(item.origin) || !Array.isArray(item.paths) || item.paths.length < 1 ||
        item.paths.length > 40) err("invalid_path_allowlist")
    const paths = new Set()
    for (const pathname of item.paths) {
      if (typeof pathname !== "string" || !/^\/[a-zA-Z0-9._/-]{0,120}$/.test(pathname) ||
          pathname.includes("..") || pathname.includes("//") || pathname.includes("*") ||
          paths.has(pathname)) err("invalid_allowed_path")
      paths.add(pathname)
    }
    pathMap.set(item.origin, paths)
  }
  return pathMap
}
function validateRegisteredActions(raw, enabled, allowedOrigins, allowedPaths) {
  if (raw === undefined || raw === null) return new Map()
  if (!Array.isArray(raw) || raw.length > 8) err("invalid_registered_actions")
  if (raw.length && !enabled) err("browser_actions_not_enabled")
  const actions = new Map()
  for (const action of raw) {
    if (!isRecord(action) || typeof action.id !== "string" ||
        !/^[a-z][a-z0-9_-]{0,47}$/.test(action.id) || actions.has(action.id))
      err("invalid_action_id")
    const url = validateUrl(action.url, allowedOrigins)
    if (!allowedPaths.get(url.origin)?.has(url.pathname)) err("action_path_not_authorized")
    if (!Array.isArray(action.steps) || action.steps.length < 1 || action.steps.length > 6)
      err("invalid_action_steps")
    const steps = action.steps.map(step => {
      if (!isRecord(step) || typeof step.selector !== "string" ||
          step.selector.length < 1 || step.selector.length > 120 ||
          /[\x00-\x1f]/.test(step.selector) || !["fill","click"].includes(step.kind))
        err("invalid_action_step")
      if (step.kind === "fill") {
        if (typeof step.arg_key !== "string" || !/^[a-z][a-z0-9_]{0,40}$/.test(step.arg_key))
          err("invalid_action_argument_key")
        return {kind:"fill",selector:step.selector,arg_key:step.arg_key}
      }
      if (step.arg_key !== undefined) err("invalid_action_step")
      return {kind:"click",selector:step.selector}
    })
    const paths = action.write_paths ?? []
    if (!Array.isArray(paths) || paths.length > 6 || paths.some(
      value => typeof value !== "string" || !/^\/[a-zA-Z0-9._/-]{0,120}$/.test(value) ||
        value.includes("..") || value.includes("//") || !allowedPaths.get(url.origin)?.has(value)
    )) err("invalid_action_write_paths")
    actions.set(action.id, {url:url.href,steps,writePaths:new Set(paths)})
  }
  return actions
}

export function validateLocalExecutorConfig(config) {
  if (!config || config.enabled !== true) err("local_executor_disabled")
  if (typeof config.token !== "string" || Buffer.byteLength(config.token) < 32) err("local_executor_token_required")
  if (!path.isAbsolute(config.workspace || "")) err("absolute_workspace_required")
  // Windows 8.3 TEMP paths must be normalized identically to async file realpath.
  const physicalRoot = fsSync.realpathSync.native(config.workspace)
  if (!fsSync.statSync(physicalRoot).isDirectory()) err("workspace_directory_required")
  const allowedOrigins = new Set((config.allowedOrigins || []).map(fixedOrigin))
  if (!allowedOrigins.size || allowedOrigins.has(null)) err("explicit_loopback_origin_allowlist_required")
  const allowedPaths = validateAllowedPaths(config.allowedPaths, allowedOrigins)
  if (config.port !== undefined && (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535)) err("invalid_port")
  if (config.chromeExecutable && (!path.isAbsolute(config.chromeExecutable) || !fsSync.existsSync(config.chromeExecutable)))
    err("configured_chrome_executable_unavailable")
  const enableBrowserActions = config.enableBrowserActions === true
  const registeredActions = validateRegisteredActions(config.registeredActions, enableBrowserActions, allowedOrigins, allowedPaths)
  return {
    root: physicalRoot,
    allowedOrigins,
    allowedPaths,
    port: config.port ?? 0,
    token: config.token,
    chromeExecutable: config.chromeExecutable || "",
    enableWrites: config.enableWrites === true,
    registeredActions,
  }
}

export async function createLocalExecutor(config) {
  const settings = validateLocalExecutorConfig(config)
  const audit = []
  let active = 0
  let browser = null
  let browserLaunch = null
  const toolDefinitions = [...TOOL_SCHEMAS,
    ...(settings.enableWrites ? [EXPORT_SCHEMA] : []),
    ...(settings.registeredActions.size ? [BROWSER_ACTION_SCHEMA] : []),
  ]

  const recordAudit = (name, success, code) => {
    // No raw document text, auth headers, URLs or credentials in audit logs.
    audit.push({timestamp:now(),tool:name,success,code})
    if (audit.length > 1000) audit.shift()
  }
  const authorize = header => {
    const value = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : ""
    const candidate = Buffer.from(value, "utf8")
    const expected = Buffer.from(settings.token, "utf8")
    return candidate.length === expected.length && timingSafeEqual(candidate, expected)
  }

  async function freshBrowserContext({origin,writeOrigin="",postPaths=new Set()}={}) {
    // Concurrent tool calls share the process but never cookies or page state.
    if (!browserLaunch) {
      browserLaunch = chromium.launch({
        headless:true, ...(settings.chromeExecutable ? {executablePath:settings.chromeExecutable}:{}),
      }).catch(error => { browserLaunch = null; throw error })
    }
    browser = await browserLaunch
    const context = await browser.newContext({
      acceptDownloads:false, permissions:[], serviceWorkers:"block",
      viewport:{width:1200,height:800},
    })
    let blocked = 0
    try {
      await context.route("**/*", async route => {
        const request = route.request()
        let permitted = false
        try {
          const destination = new URL(request.url())
          const onAllowlist = destination.protocol === "http:" &&
            settings.allowedOrigins.has(destination.origin) &&
            ["localhost","127.0.0.1"].includes(destination.hostname) &&
            settings.allowedPaths.get(destination.origin)?.has(destination.pathname)
          // Even GETs can have side effects. Exact paths are required; registered
          // POSTs need the additional per-action write allowlist.
          permitted = Boolean(onAllowlist) && destination.origin === origin &&
            (["GET","HEAD"].includes(request.method()) ||
              request.method() === "POST" &&
              destination.origin === writeOrigin && postPaths.has(destination.pathname))
        } catch {}
        if (!permitted) { blocked++; await route.abort("blockedbyclient").catch(()=>{}) }
        else await route.continue().catch(()=>{})
      })
      if (typeof context.routeWebSocket !== "function") err("browser_websocket_guard_unavailable")
      await context.routeWebSocket("**/*", websocket => { blocked++; websocket.close() })
      await context.addInitScript(() => { window.open = () => null })
      return {context, getBlocked:()=>blocked}
    } catch(error) {
      await context.close().catch(()=>{})
      throw error
    }
  }
  async function browserRead({url: raw}) {
    const target = validateUrl(raw, settings.allowedOrigins)
    if (!settings.allowedPaths.get(target.origin)?.has(target.pathname)) err("path_not_authorized")
    const {context,getBlocked} = await freshBrowserContext({origin:target.origin})
    try {
      const page = await context.newPage()
      const response = await page.goto(target.href, {waitUntil:"domcontentloaded",timeout:DEFAULT_BROWSER_TIMEOUT})
      if (!response) err("browser_navigation_failed")
      const finalUrl = validateUrl(page.url(), settings.allowedOrigins)
      if (finalUrl.origin !== target.origin) err("browser_cross_origin_navigation")
      const title = (await page.title()).slice(0, 150)
      const text = (await page.locator("body").innerText({timeout:5000})).slice(0,MAX_BROWSER_TEXT)
      return {source_url:target.href,final_url:finalUrl.href,title,text,status:response.status(),
        blocked_requests:getBlocked(),retrieved_at:now(),isolated_context:true}
    } finally { await context.close().catch(()=>{}) }
  }
  async function browserRegisteredAction({action_id,arguments:inputs}) {
    const action = typeof action_id === "string" ? settings.registeredActions.get(action_id) : null
    if (!action) err("action_not_registered")
    if (!isRecord(inputs)) err("invalid_action_arguments")
    const keys = new Set(action.steps.filter(step=>step.kind==="fill").map(step=>step.arg_key))
    if (Object.keys(inputs).length!==keys.size ||
        Object.keys(inputs).some(key=>!keys.has(key)) ||
        [...keys].some(key=>typeof inputs[key]!=="string" || inputs[key].length>500))
      err("invalid_action_arguments")
    const target=validateUrl(action.url,settings.allowedOrigins)
    if (!settings.allowedPaths.get(target.origin)?.has(target.pathname)) err("action_path_not_authorized")
    const {context,getBlocked}=await freshBrowserContext({
      origin:target.origin,writeOrigin:target.origin,postPaths:action.writePaths,
    })
    try{
      const page=await context.newPage()
      await page.goto(target.href,{waitUntil:"domcontentloaded",timeout:DEFAULT_BROWSER_TIMEOUT})
      let completed=0
      for(const step of action.steps){
        if(step.kind==="fill")await page.locator(step.selector).fill(inputs[step.arg_key],{timeout:4000})
        else await page.locator(step.selector).click({timeout:4000})
        completed++
      }
      const finalUrl=validateUrl(page.url(),settings.allowedOrigins)
      if(finalUrl.origin!==target.origin)err("action_cross_origin_navigation")
      return {action_id,source_url:target.href,final_url:finalUrl.href,
        title:(await page.title()).slice(0,150),
        text:(await page.locator("body").innerText({timeout:5000})).slice(0,MAX_BROWSER_TEXT),
        steps_completed:completed,blocked_requests:getBlocked(),retrieved_at:now(),
        isolated_context:true,write_possible:true}
    }finally{await context.close().catch(()=>{})}
  }
  async function pdfExtract({input_path, pages}) {
    const file = await allowedInputFile(settings.root, input_path, ".pdf")
    if (pages !== undefined && (!Array.isArray(pages) || pages.length > MAX_PDF_PAGES ||
        pages.some(n => !Number.isInteger(n) || n < 1))) err("invalid_pdf_pages")
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
    const loading = pdfjs.getDocument({data:new Uint8Array(file.bytes),useSystemFonts:true,
      disableFontFace:true,stopAtErrors:true})
    let doc
    try {
      doc = await loading.promise
      if (doc.numPages > 100) err("pdf_page_limit_exceeded")
      const selected = pages?.length ? [...new Set(pages)] : Array.from({length:Math.min(doc.numPages,MAX_PDF_PAGES)},(_,i)=>i+1)
      if(selected.some(n => n>doc.numPages)) err("pdf_page_out_of_range")
      const extracted = []
      for(const n of selected){
        const page = await doc.getPage(n)
        const contents = await page.getTextContent()
        extracted.push({page:n,text:contents.items.map(item => "str" in item ? item.str : "").join(" ").slice(0,6000)})
        page.cleanup()
      }
      return {source_file:file.name,source_sha256:sha(file.bytes),total_pages:doc.numPages,
        pages:extracted,retrieved_at:now(),extraction:"real_pdfjs_text"}
    } finally {
      await loading.destroy().catch(()=>{})
    }
  }
  async function spreadsheetAnalyze({input_path,sheet,left_cell,right_cell}) {
    const file = await allowedInputFile(settings.root,input_path,".xlsx")
    if (typeof sheet !== "string" || !sheet.trim() || sheet.length > 80) err("invalid_worksheet")
    const left = cellRef(left_cell), right=cellRef(right_cell)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(file.bytes)
    if (wb.worksheets.length > 30) err("too_many_worksheets")
    const ws = wb.getWorksheet(sheet)
    if(!ws || ws.rowCount > MAX_EXCEL_ROWS) err("worksheet_not_allowed")
    const leftValue = finiteNumber(ws.getCell(left).value)
    const rightValue = finiteNumber(ws.getCell(right).value)
    const difference = leftValue - rightValue
    if (!Number.isFinite(difference)) err("invalid_arithmetic_result")
    return {source_file:file.name,source_sha256:sha(file.bytes),worksheet:sheet,
      cells:[{ref:left,value:leftValue},{ref:right,value:rightValue}],
      operation:"subtract",result:difference,
      provenance:"real_xlsx_numeric_cells",retrieved_at:now()}
  }
  async function exportReport({output_name,title,rows}) {
    if(!settings.enableWrites)err("write_tool_disabled")
    const name=fileName(output_name,".xlsx")
    if(typeof title!=="string" || !title.trim() || title.length>140)err("invalid_report_title")
    if(!Array.isArray(rows)||rows.length<1||rows.length>30||
      rows.some(x=>!isRecord(x)||typeof x.label!=="string"||x.label.length>100||!x.label.trim()||
        typeof x.value!=="number"||!Number.isFinite(x.value)))err("invalid_report_rows")
    const outdir=path.join(settings.root,"artifacts")
    await fs.mkdir(outdir,{recursive:true})
    if(!isInside(settings.root,await fs.realpath(outdir)))err("output_directory_not_allowed")
    const destination=path.join(outdir,name)
    const workbook=new ExcelJS.Workbook()
    const sheet=workbook.addWorksheet("Verified Report")
    sheet.addRow([title,"Value"])
    for(const row of rows)sheet.addRow([row.label,row.value])
    const temp=path.join(outdir,".tmp-"+randomBytes(8).toString("hex")+".xlsx")
    try{
      await workbook.xlsx.writeFile(temp)
      await fs.link(temp,destination).catch(error=>{
        if(error?.code==="EEXIST")err("report_already_exists")
        throw error
      })
      const bytes=await fs.readFile(destination)
      return {output_path:"artifacts/"+name,sha256:sha(bytes),bytes:bytes.length,
        rows_written:rows.length,format:"real_xlsx",created_at:now()}
    } finally {await fs.unlink(temp).catch(()=>{})}
  }
  const handlers={browser_read_page:browserRead,document_pdf_extract:pdfExtract,
    spreadsheet_analyze:spreadsheetAnalyze,spreadsheet_export_report:exportReport,
    browser_registered_action:browserRegisteredAction}

  async function invoke(name,args){
    if(!toolDefinitions.some(tool=>tool.name===name))err("tool_not_available")
    if(!isRecord(args))err("invalid_tool_arguments")
    if(active>=MAX_ACTIVE_TOOL_CALLS)err("executor_busy")
    active++
    try{
      const result=await handlers[name](args)
      recordAudit(name,true,"ok")
      return {content:[{type:"text",text:JSON.stringify(result)}],isError:false}
    }catch(error){
      const message=safeError(error)
      recordAudit(name,false,message)
      return {content:[{type:"text",text:JSON.stringify({error:message})}],isError:true}
    } finally{active--}
  }
  const server=createServer(async(req,res)=>{
    res.setHeader("Content-Type","application/json; charset=utf-8")
    res.setHeader("Cache-Control","no-store")
    res.setHeader("X-Content-Type-Options","nosniff")
    if(req.url==="/health" && req.method==="GET"){
      res.writeHead(200);res.end(JSON.stringify({ok:true,loopback_only:true,mode:"explicit_opt_in"}));return
    }
    if(req.url!=="/mcp"||req.method!=="POST"){res.writeHead(404);res.end(JSON.stringify({error:"not_found"}));return}
    if(!authorize(req.headers.authorization)){
      res.writeHead(401);res.end(JSON.stringify({error:"unauthorized"}));return
    }
    let raw=""
    try{
      for await (const chunk of req){
        raw+=chunk.toString("utf8")
        if(Buffer.byteLength(raw)>MAX_JSON_BODY){res.writeHead(413);res.end(JSON.stringify({error:"request_too_large"}));return}
      }
      const payload=JSON.parse(raw)
      if(!isRecord(payload)||payload.jsonrpc!=="2.0"||!["string","number"].includes(typeof payload.id)||
        typeof payload.method!=="string")err("invalid_json_rpc")
      let result
      if(payload.method==="initialize"){
        result={protocolVersion:"2024-11-05",serverInfo:{name:"agent-studio-local-executor",version:"0.1.0"},
          capabilities:{tools:{listChanged:false}}}
      }else if(payload.method==="tools/list"){
        result={tools:toolDefinitions}
      }else if(payload.method==="tools/call"){
        const params=payload.params
        if(!isRecord(params)||typeof params.name!=="string")err("invalid_tool_call")
        result=await invoke(params.name,params.arguments)
      }else err("unsupported_rpc_method")
      res.writeHead(200)
      res.end(JSON.stringify({jsonrpc:"2.0",id:payload.id,result}))
    }catch(error){
      res.writeHead(400)
      res.end(JSON.stringify({jsonrpc:"2.0",id:null,error:{code:-32600,message:safeError(error)}}))
    }
  })
  server.requestTimeout=25_000
  server.headersTimeout=10_000
  server.keepAliveTimeout=2_000
  await new Promise((resolve,reject)=>{
    server.once("error",reject)
    server.listen(settings.port,"127.0.0.1",resolve)
  })
  const address=server.address()
  const origin="http://127.0.0.1:"+address.port
  return {
    origin, audit,
    async close(){
      await new Promise(resolve=>server.close(resolve))
      if(browserLaunch)await browserLaunch.then(instance=>instance.close()).catch(()=>{})
    },
  }
}

/** Explicit CLI opt-in. Safe by default, even if called from a dependency. */
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try {
    const enabled=process.env.AGENT_STUDIO_LOCAL_EXECUTOR_ENABLED==="1"
    const bridge=await createLocalExecutor({
      enabled,
      token:process.env.AGENT_STUDIO_LOCAL_EXECUTOR_TOKEN,
      workspace:process.env.AGENT_STUDIO_LOCAL_EXECUTOR_WORKSPACE,
      allowedOrigins:process.env.AGENT_STUDIO_LOCAL_EXECUTOR_ORIGINS?.split(",")||[],
      allowedPaths:process.env.AGENT_STUDIO_LOCAL_EXECUTOR_PATHS_JSON
        ? JSON.parse(process.env.AGENT_STUDIO_LOCAL_EXECUTOR_PATHS_JSON) : [],
      port:Number(process.env.AGENT_STUDIO_LOCAL_EXECUTOR_PORT||0),
      chromeExecutable:process.env.AGENT_STUDIO_LOCAL_EXECUTOR_CHROME_BIN||"",
      enableWrites:process.env.AGENT_STUDIO_LOCAL_EXECUTOR_ENABLE_WRITES==="1",
      enableBrowserActions:process.env.AGENT_STUDIO_LOCAL_EXECUTOR_ENABLE_BROWSER_ACTIONS==="1",
      registeredActions:process.env.AGENT_STUDIO_LOCAL_EXECUTOR_ACTIONS_JSON
        ? JSON.parse(process.env.AGENT_STUDIO_LOCAL_EXECUTOR_ACTIONS_JSON) : [],
    })
    // No token, filesystem paths or credentials are logged.
    process.stdout.write(JSON.stringify({status:"ready",origin:bridge.origin,mcp_path:"/mcp",
      tools: "Read-only Chromium/PDF/XLSX; browser registered actions and XLSX export separately opt-in"})+"\n")
    const shutdown=async()=>{await bridge.close();process.exit(0)}
    process.once("SIGTERM",()=>{void shutdown()})
    process.once("SIGINT",()=>{void shutdown()})
  }catch(error){process.stderr.write("Local executor unavailable: "+safeError(error)+"\n");process.exitCode=1}
}
