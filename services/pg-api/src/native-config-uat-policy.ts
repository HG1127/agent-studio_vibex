// Standalone PG18 UAT-only business configuration mutation policy.
// This module does NOT connect to a database or start an HTTP listener.
// The current 8090/PocketBase site remains authoritative until full UAT.
export interface NativePg18UatCapabilities {
  configurationWrites:boolean
  employeeProvisioning:boolean
  /** Disabled unless a SECOND explicit, isolated Run/approval UAT acknowledgement. */
  runApprovalUat:boolean
  /** Explicitly reviewed synthetic TXT/MD ingestion, never document-files. */
  knowledgeIngestUat:boolean
}
const empty:NativePg18UatCapabilities={
  configurationWrites:false,employeeProvisioning:false,
  runApprovalUat:false,knowledgeIngestUat:false,
}
function refuse():never{throw Error("unsafe_native_pg18_uat_config")}
const permissionMarker="APPROVE_ISOLATED_PG18_CONFIG_UAT_ONLY"
const runApprovalMarker="APPROVE_DISPOSABLE_PG18_RUN_APPROVAL_UAT_ONLY"
const kbIngestMarker="APPROVE_DISPOSABLE_PG18_TEXT_INGEST_UAT_ONLY"

// Explicit operator acknowledgement is required only for an isolated
// non-root HTTPS service; --plan and read-only --preflight can never turn
// into a write-capable server by inheriting ambient environment variables.
export function selectNativePg18UatCapabilities(
  env:NodeJS.ProcessEnv,listen:boolean,origin:string,
  uid=process.getuid?.(),
):NativePg18UatCapabilities {
  const config=env.AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED
  const employees=env.AGENT_STUDIO_PG18_EMPLOYEE_UAT_ENABLED
  const marker=env.AGENT_STUDIO_PG18_UAT_APPROVAL
  const run=env.AGENT_STUDIO_PG18_RUN_APPROVAL_UAT_ENABLED
  const runMarker=env.AGENT_STUDIO_PG18_RUN_APPROVAL_UAT_APPROVED
  const ingest=env.AGENT_STUDIO_PG18_KNOWLEDGE_INGEST_UAT_ENABLED
  const ingestMarker=env.AGENT_STUDIO_PG18_KNOWLEDGE_INGEST_UAT_APPROVED
  for(const value of [config,employees,run,ingest])
    if(value!==undefined&&value!=="true")refuse()
  const configUat=config==="true"
  const employeeUat=employees==="true"
  const runUat=run==="true"
  const ingestUat=ingest==="true"
  if(!runUat&&runMarker!==undefined)refuse()
  if(!ingestUat&&ingestMarker!==undefined)refuse()
  if(!configUat&&!employeeUat&&!runUat&&!ingestUat){
    if(marker!==undefined)refuse()
    return {...empty}
  }
  if(!listen||!Number.isSafeInteger(uid)||uid===undefined||uid<=0||
     !origin.startsWith("https://")||
     marker!==permissionMarker||
     ((employeeUat||runUat||ingestUat)&&!configUat)||
     (runUat&&runMarker!==runApprovalMarker)||
     (ingestUat&&ingestMarker!==kbIngestMarker))refuse()
  return {configurationWrites:configUat,
    employeeProvisioning:employeeUat,runApprovalUat:runUat,
    knowledgeIngestUat:ingestUat}
}
const uuid="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
const configEntities=new Set(["agent-specs","workflows","knowledge-bases"])
function configuredPath(pathname:string):"collection"|"item"|null{
  const collection=/^\/api\/v2\/([a-z-]+)$/.exec(pathname)
  if(collection&&configEntities.has(collection[1]!))return "collection"
  const item=new RegExp("^/api/v2/([a-z-]+)/"+uuid+"$").exec(pathname)
  if(item&&configEntities.has(item[1]!))return "item"
  return null
}
export function permitNativePg18BusinessUatRequest(
  pathname:string,method:string,
  policy:NativePg18UatCapabilities,
):boolean {
  if(method==="GET"&&pathname==="/healthz")return true
  // Existing PG18 schedule/occurrence rows are readable by their verified
  // owner, but no scheduler, task creation or occurrence mutation is exposed.
  if(method==="GET"&&(
    pathname==="/api/v2/schedules" ||
    new RegExp("^/api/v2/schedules/"+uuid+"/occurrences$").test(pathname)))
    return true
  if(typeof pathname!=="string"||pathname.length>256||pathname.includes("?"))
    return false
  // Read-only, owner-scoped KB document metadata is available even when
  // configuration and Run writes remain disabled. No body/embedding route.
  if(method==="GET"&&new RegExp(
    "^/api/v2/knowledge-bases/"+uuid+"/documents$").test(pathname))
    return true
  // A POST body keeps private search phrases out of URL/proxy logs.
  // The existing repository performs SELECT only, with strict owner RLS,
  // indexed-document filtering and bounded citation snippets.
  if(method==="POST"&&new RegExp(
    "^/api/v2/knowledge-bases/"+uuid+"/search$").test(pathname))
    return true
  // TEXT ingestion is a genuine write. It needs its OWN isolated UAT gate
  // in addition to config write approval and validated Native session/CSRF.
  // Never permit PDF/DOCX upload, arbitrary object keys, or file routes here.
  if(method==="POST"&&policy.knowledgeIngestUat===true&&
     policy.configurationWrites===true&&new RegExp(
       "^/api/v2/knowledge-bases/"+uuid+"/text-documents$").test(pathname))
    return true
  // Run/approval routes are isolated from ordinary config UAT: never
  // reachable by ambient config/employee permissions or unknown methods.
  if(policy.runApprovalUat===true && policy.configurationWrites===true){
    if(method==="GET" && (pathname==="/api/v2/runs" ||
      new RegExp("^/api/v2/runs/"+uuid+"$").test(pathname)))return true
    if(method==="POST" && (
      new RegExp("^/api/v2/agent-specs/"+uuid+"/runs$").test(pathname) ||
      new RegExp("^/api/v2/runs/"+uuid+"/model-approval$").test(pathname)))
      return true
  }
  const kind=configuredPath(pathname)
  if(!kind)return false
  if(method==="GET")return true
  return policy.configurationWrites &&
    ((method==="POST"&&kind==="collection")||
     (method==="PATCH"&&kind==="item"))
}
