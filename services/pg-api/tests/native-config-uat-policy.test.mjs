import test from "node:test"
import assert from "node:assert/strict"
import {selectNativePg18UatCapabilities,permitNativePg18BusinessUatRequest}
  from "../src/native-config-uat-policy.ts"

const https="https://192.168.1.133:7443"
const approval="APPROVE_ISOLATED_PG18_CONFIG_UAT_ONLY"
const enabled={
  AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:"true",
  AGENT_STUDIO_PG18_UAT_APPROVAL:approval
}
const uuid="a77f0464-34ea-4a7f-98a1-2a543722d687"
const names=["agent-specs","workflows","knowledge-bases"]
const readOnly={configurationWrites:false,employeeProvisioning:false,
  runApprovalUat:false,knowledgeIngestUat:false}
const configUat={configurationWrites:true,employeeProvisioning:false,
  runApprovalUat:false,knowledgeIngestUat:false}
const both={configurationWrites:true,employeeProvisioning:true,
  runApprovalUat:false,knowledgeIngestUat:false}

test("PG18 native configuration is READ ONLY by default with no ambient permissions",()=>{
  assert.deepEqual(selectNativePg18UatCapabilities({},true,https,1100),readOnly)
  assert.deepEqual(selectNativePg18UatCapabilities({},false,"http://127.0.0.1:7403",0),readOnly)
  for(const name of names){
    assert.equal(permitNativePg18BusinessUatRequest("/api/v2/"+name,"GET",readOnly),true)
    assert.equal(permitNativePg18BusinessUatRequest("/api/v2/"+name+"/"+uuid,"GET",readOnly),true)
    assert.equal(permitNativePg18BusinessUatRequest("/api/v2/"+name,"POST",readOnly),false)
    assert.equal(permitNativePg18BusinessUatRequest("/api/v2/"+name+"/"+uuid,"PATCH",readOnly),false)
  }
  assert.equal(permitNativePg18BusinessUatRequest("/healthz","GET",readOnly),true)
})

test("explicitly approved local non-root HTTPS permits ONLY config CRUD mutation scope",()=>{
  const selected=selectNativePg18UatCapabilities(enabled,true,https,1100)
  assert.deepEqual(selected,configUat)
  for(const name of names){
    assert.equal(permitNativePg18BusinessUatRequest("/api/v2/"+name,"POST",selected),true)
    assert.equal(permitNativePg18BusinessUatRequest("/api/v2/"+name+"/"+uuid,"PATCH",selected),true)
    assert.equal(permitNativePg18BusinessUatRequest("/api/v2/"+name+"/"+uuid,"GET",selected),true)
    assert.equal(permitNativePg18BusinessUatRequest("/api/v2/"+name+"/"+uuid,"POST",selected),false)
    assert.equal(permitNativePg18BusinessUatRequest("/api/v2/"+name,"PATCH",selected),false)
    assert.equal(permitNativePg18BusinessUatRequest("/api/v2/"+name+"/"+uuid,"DELETE",selected),false)
  }
  assert.equal(selected.employeeProvisioning,false)
})
test("independent employee UAT requires explicit approval and config UAT",()=>{
  assert.deepEqual(selectNativePg18UatCapabilities({
    ...enabled,AGENT_STUDIO_PG18_EMPLOYEE_UAT_ENABLED:"true"
  },true,https,1200),both)
  assert.throws(()=>selectNativePg18UatCapabilities({
    AGENT_STUDIO_PG18_EMPLOYEE_UAT_ENABLED:"true",
    AGENT_STUDIO_PG18_UAT_APPROVAL:approval
  },true,https,1200),/unsafe_native_pg18_uat_config/)
})
test("cannot inherit test-write approval in read-only preflight, HTTP or root service",()=>{
  for(const [environment,listen,origin,uid] of [
    [enabled,false,https,0],
    [enabled,true,"http://127.0.0.1:7403",1234],
    [enabled,true,https,0],
    [{...enabled,AGENT_STUDIO_PG18_UAT_APPROVAL:"true"},true,https,1234],
    [{AGENT_STUDIO_PG18_UAT_APPROVAL:approval},true,https,1234],
    [{AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:"false"},true,https,1234],
    [{AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:"yes"},true,https,1234],
    [{AGENT_STUDIO_PG18_EMPLOYEE_UAT_ENABLED:"false"},true,https,1234],
  ]){
    assert.throws(()=>selectNativePg18UatCapabilities(
      environment,listen,origin,uid),/unsafe_native_pg18_uat_config/)
  }
})

test("Run/approval UAT requires a distinct opt-in and cannot inherit config UAT",()=>{
  const runEnv={...enabled,
    AGENT_STUDIO_PG18_RUN_APPROVAL_UAT_ENABLED:"true",
    AGENT_STUDIO_PG18_RUN_APPROVAL_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_RUN_APPROVAL_UAT_ONLY"}
  for(const mode of [
    {...enabled,AGENT_STUDIO_PG18_RUN_APPROVAL_UAT_ENABLED:"true"},
    {...enabled,AGENT_STUDIO_PG18_RUN_APPROVAL_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_RUN_APPROVAL_UAT_ONLY"},
    {...runEnv,AGENT_STUDIO_PG18_RUN_APPROVAL_UAT_APPROVED:"true"},
    {...runEnv,AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:undefined},
  ])assert.throws(()=>selectNativePg18UatCapabilities(mode,true,https,1200),
    /unsafe_native_pg18_uat_config/)
  assert.throws(()=>selectNativePg18UatCapabilities(runEnv,false,https,1100),
    /unsafe_native_pg18_uat_config/)
  assert.throws(()=>selectNativePg18UatCapabilities(runEnv,true,"http://localhost",1100),
    /unsafe_native_pg18_uat_config/)
  assert.throws(()=>selectNativePg18UatCapabilities(runEnv,true,https,0),
    /unsafe_native_pg18_uat_config/)
  const allowed=selectNativePg18UatCapabilities(runEnv,true,https,1200)
  assert.deepEqual(allowed,{...configUat,runApprovalUat:true})
  const root="/api/v2/runs"
  const uuidPath=root+"/"+uuid
  const submit="/api/v2/agent-specs/"+uuid+"/runs"
  for(const [pathname,method] of [[root,"GET"],[uuidPath,"GET"],
    [submit,"POST"],[uuidPath+"/model-approval","POST"]]){
    assert.equal(permitNativePg18BusinessUatRequest(pathname,method,allowed),true)
    assert.equal(permitNativePg18BusinessUatRequest(pathname,method,configUat),false)
  }
  for(const [pathname,method] of [[root,"POST"],[uuidPath,"PATCH"],
    [submit,"GET"],[uuidPath+"/model-approval","GET"],
    [uuidPath+"/model-approval","PATCH"],[root+"/not-an-id","GET"],
    ["/api/v2/runs/"+uuid+"/model-approval/extra","POST"]])
    assert.equal(permitNativePg18BusinessUatRequest(pathname,method,allowed),false)
})

test("knowledge documents inventory is read-only and owned; import/search remain disabled",()=>{
  const endpoint="/api/v2/knowledge-bases/"+uuid+"/documents"
  for(const mode of [readOnly,configUat,both]){
    assert.equal(permitNativePg18BusinessUatRequest(endpoint,"GET",mode),true)
    for(const method of ["POST","PATCH","DELETE","PUT","HEAD"])
      assert.equal(permitNativePg18BusinessUatRequest(endpoint,method,mode),false)
    assert.equal(permitNativePg18BusinessUatRequest(
      endpoint.replace(uuid,"invalid"),"GET",mode),false)
    assert.equal(permitNativePg18BusinessUatRequest(endpoint+"/x","GET",mode),false)
    assert.equal(permitNativePg18BusinessUatRequest(endpoint+"?limit=1","GET",mode),false)
  }
})

test("PG18 schedule inventory is GET-only even without write/UAT approval",()=>{
  const path="/api/v2/schedules"
  const history=path+"/"+uuid+"/occurrences"
  for(const policy of [readOnly,configUat,both]){
    assert.equal(permitNativePg18BusinessUatRequest(path,"GET",policy),true)
    assert.equal(permitNativePg18BusinessUatRequest(history,"GET",policy),true)
    for(const method of ["POST","PATCH","PUT","DELETE","HEAD"]){
      assert.equal(permitNativePg18BusinessUatRequest(path,method,policy),false)
      assert.equal(permitNativePg18BusinessUatRequest(history,method,policy),false)
    }
    for(const invalid of [
      path+"/not-a-uuid/occurrences",
      history+"/run",
      path+"?limit=1",
      path+"/"+uuid,
      history+"?limit=30"
    ])assert.equal(permitNativePg18BusinessUatRequest(invalid,"GET",policy),false)
  }
})

test("private indexed KB keyword lookup allows only POST, no unrelated writes",()=>{
  const endpoint="/api/v2/knowledge-bases/"+uuid+"/search"
  for(const mode of [readOnly,configUat,both]){
    assert.equal(permitNativePg18BusinessUatRequest(endpoint,"POST",mode),true)
    for(const method of ["GET","HEAD","PATCH","DELETE","PUT"]){
      assert.equal(permitNativePg18BusinessUatRequest(endpoint,method,mode),false)
    }
    for(const wrongPath of [
      endpoint+"/extra", endpoint+"?limit=5",
      "/api/v2/knowledge-bases/not-uuid/search",
      "/api/v2/knowledge-bases/"+uuid+"/semantic-search",
    ])assert.equal(permitNativePg18BusinessUatRequest(wrongPath,"POST",mode),false)
    assert.equal(permitNativePg18BusinessUatRequest(
      "/api/v2/knowledge-bases/"+uuid+"/text-documents","POST",mode),false)
  }
})

test("text/markdown document ingestion requires a THIRD explicit isolated UAT approval",()=>{
  const ingestionPath="/api/v2/knowledge-bases/"+uuid+"/text-documents"
  const isolated={...enabled,
    AGENT_STUDIO_PG18_KNOWLEDGE_INGEST_UAT_ENABLED:"true",
    AGENT_STUDIO_PG18_KNOWLEDGE_INGEST_UAT_APPROVED:
      "APPROVE_DISPOSABLE_PG18_TEXT_INGEST_UAT_ONLY"}
  for(const invalid of [
    {...enabled,AGENT_STUDIO_PG18_KNOWLEDGE_INGEST_UAT_ENABLED:"true"},
    {...enabled,AGENT_STUDIO_PG18_KNOWLEDGE_INGEST_UAT_APPROVED:
      "APPROVE_DISPOSABLE_PG18_TEXT_INGEST_UAT_ONLY"},
    {...isolated,AGENT_STUDIO_PG18_KNOWLEDGE_INGEST_UAT_APPROVED:"yes"},
    {...isolated,AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:undefined},
  ])assert.throws(()=>selectNativePg18UatCapabilities(invalid,true,https,1000),
    /unsafe_native_pg18_uat_config/)
  assert.throws(()=>selectNativePg18UatCapabilities(isolated,false,https,1000),
    /unsafe_native_pg18_uat_config/)
  assert.throws(()=>selectNativePg18UatCapabilities(isolated,true,"http://localhost",1000),
    /unsafe_native_pg18_uat_config/)
  assert.throws(()=>selectNativePg18UatCapabilities(isolated,true,https,0),
    /unsafe_native_pg18_uat_config/)
  const chosen=selectNativePg18UatCapabilities(isolated,true,https,1000)
  assert.deepEqual(chosen,{...configUat,knowledgeIngestUat:true})
  for(const mode of [readOnly,configUat,both]){
    assert.equal(permitNativePg18BusinessUatRequest(ingestionPath,"POST",mode),false)
  }
  assert.equal(permitNativePg18BusinessUatRequest(ingestionPath,"POST",chosen),true)
  for(const endpoint of [
    "/api/v2/knowledge-bases/"+uuid+"/document-files",
    ingestionPath+"/unknown",ingestionPath+"?admin=true",
    "/api/v2/knowledge-bases/not-a-uuid/text-documents",
  ])assert.equal(permitNativePg18BusinessUatRequest(endpoint,"POST",chosen),false)
  for(const method of ["GET","PATCH","PUT","DELETE","HEAD"])
    assert.equal(permitNativePg18BusinessUatRequest(ingestionPath,method,chosen),false)
  assert.equal(permitNativePg18BusinessUatRequest("/api/v2/runs","GET",chosen),false)
})

test("run execution, approvals, document ingestion and unrelated APIs NEVER enabled",()=>{
  const blocked=[
    "/api/v2/runs",
    "/api/v2/runs/"+uuid,
    "/api/v2/runs/"+uuid+"/model-approval",
    "/api/v2/agent-specs/"+uuid+"/runs",
    "/api/v2/knowledge-bases/"+uuid+"/document-files",
    "/api/v2/knowledge-bases/"+uuid+"/text-documents",
    "/api/v2/plugins",
    "/api/v2/model-connections",
    "/api/v2/teams",
    "/api/v2/agent-specs/"+uuid+"/unknown",
    "/api/v2/agent-specs?limit=1",
    "/__pb/api/collections",
  ]
  for(const url of blocked){
    for(const method of ["GET","POST","PATCH","DELETE","HEAD"]){
      assert.equal(permitNativePg18BusinessUatRequest(url,method,both),false,url+" "+method)
    }
  }
  assert.equal(permitNativePg18BusinessUatRequest("/healthz","POST",both),false)
})
