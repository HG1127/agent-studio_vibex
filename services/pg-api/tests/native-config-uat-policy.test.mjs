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
const names=["agent-specs","workflows","knowledge-bases","tool-connections"]
const readOnly={configurationWrites:false,employeeProvisioning:false,
  runApprovalUat:false,knowledgeIngestUat:false,modelProbeUat:false}
const configUat={configurationWrites:true,employeeProvisioning:false,
  runApprovalUat:false,knowledgeIngestUat:false,modelProbeUat:false}
const both={configurationWrites:true,employeeProvisioning:true,
  runApprovalUat:false,knowledgeIngestUat:false,modelProbeUat:false}

test("derived owner storage needs its own operator marker; reads and original confirmation remain available without write scope",()=>{
  const derived={AGENT_STUDIO_PG_AGENT_DERIVED_MEMORY_ENABLED:'true',AGENT_STUDIO_PG_AGENT_DERIVED_MEMORY_APPROVED:'APPROVE_DISPOSABLE_PG18_SOURCE_BOUND_MEMORY_ONLY'}
  const valid={...enabled,...derived},selected=selectNativePg18UatCapabilities(valid,true,https,1100)
  assert.equal(selected.agentDerivedMemoryUat,true);assert.equal(selected.autonomousAgentUat,undefined);assert.equal(selected.boundModelExecutionUat,undefined)
  for(const env of [derived,{...valid,AGENT_STUDIO_PG_AGENT_DERIVED_MEMORY_ENABLED:'false'},{...valid,AGENT_STUDIO_PG_AGENT_DERIVED_MEMORY_APPROVED:undefined},{...enabled,AGENT_STUDIO_PG_AGENT_DERIVED_MEMORY_APPROVED:derived.AGENT_STUDIO_PG_AGENT_DERIVED_MEMORY_APPROVED}])assert.throws(()=>selectNativePg18UatCapabilities(env,true,https,1100))
  assert.throws(()=>selectNativePg18UatCapabilities(valid,false,https,1100));assert.throws(()=>selectNativePg18UatCapabilities(valid,true,https,0))
  const base='/api/v2/agent-derived-memories'
  for(const path of [base,base+'/preview']){assert.equal(permitNativePg18BusinessUatRequest(path,'GET',readOnly),true);assert.equal(permitNativePg18BusinessUatRequest(path,'POST',selected),false)}
  assert.equal(permitNativePg18BusinessUatRequest(base+'/confirm','POST',readOnly),true)
  assert.equal(permitNativePg18BusinessUatRequest(base+'/change','POST',configUat),false);assert.equal(permitNativePg18BusinessUatRequest(base+'/change','POST',selected),true)
  assert.equal(permitNativePg18BusinessUatRequest(base+'/change','GET',selected),false)
})

test("memory admission needs its independent marker and both Native config and standalone Agent scope",()=>{
  const memory={AGENT_STUDIO_PG_AGENT_MEMORY_ENABLED:"true",AGENT_STUDIO_PG_AGENT_MEMORY_APPROVED:"APPROVE_DISPOSABLE_PG18_OWNER_MEMORY_ONLY"}
  const autonomous={AGENT_STUDIO_PG_AUTONOMOUS_AGENT_ENABLED:"true",AGENT_STUDIO_PG_AUTONOMOUS_AGENT_APPROVED:"APPROVE_DISPOSABLE_PG18_AUTONOMOUS_AGENT_ONLY"}
  const valid={...enabled,...autonomous,...memory}
  const selected=selectNativePg18UatCapabilities(valid,true,https,1100)
  assert.equal(selected.agentMemoryUat,true);assert.equal(selected.autonomousAgentUat,true)
  assert.equal(selectNativePg18UatCapabilities({...enabled,...autonomous},true,https,1100).agentMemoryUat,undefined)
  for(const input of [memory,{...enabled,...memory},{...autonomous,...memory},{...valid,AGENT_STUDIO_PG_AGENT_MEMORY_APPROVED:undefined}])
    assert.throws(()=>selectNativePg18UatCapabilities(input,true,https,1100))
  assert.throws(()=>selectNativePg18UatCapabilities(valid,false,https,1100))
  assert.throws(()=>selectNativePg18UatCapabilities(valid,true,https,0))
  assert.throws(()=>selectNativePg18UatCapabilities(valid,true,"http://127.0.0.1:7403",1100))
})

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
test("model connection CRUD is owner-authenticated and gated; DELETE is scoped to that resource",()=>{
  const collection="/api/v2/model-connections"
  const item=collection+"/"+uuid
  for(const policy of [readOnly]){
    assert.equal(permitNativePg18BusinessUatRequest(collection,"GET",policy),true)
    assert.equal(permitNativePg18BusinessUatRequest(item,"GET",policy),true)
    for(const [path,method] of [[collection,"POST"],[item,"PATCH"],[item,"DELETE"],
      [item,"POST"],[collection,"PATCH"],[collection,"DELETE"]])
      assert.equal(permitNativePg18BusinessUatRequest(path,method,policy),false)
  }
  assert.equal(permitNativePg18BusinessUatRequest(collection,"POST",configUat),true)
  assert.equal(permitNativePg18BusinessUatRequest(item,"PATCH",configUat),true)
  assert.equal(permitNativePg18BusinessUatRequest(item,"DELETE",configUat),true)
  assert.equal(permitNativePg18BusinessUatRequest(item,"POST",configUat),false)
  assert.equal(permitNativePg18BusinessUatRequest(collection,"DELETE",configUat),false)
  assert.equal(permitNativePg18BusinessUatRequest(item+"?force=1","DELETE",configUat),false)
  assert.equal(permitNativePg18BusinessUatRequest("/api/v2/agents/"+uuid,"DELETE",configUat),false)
})

test("provider probe egress is independently gated and cannot inherit config UAT",()=>{
  const path="/api/v2/model-connections/"+uuid+"/probe"
  const marker="APPROVE_DISPOSABLE_PG18_PROVIDER_READONLY_PROBE_ONLY"
  const env={...enabled,AGENT_STUDIO_PG18_MODEL_PROBE_UAT_ENABLED:"true",
    AGENT_STUDIO_PG18_MODEL_PROBE_UAT_APPROVED:marker}
  const approved=selectNativePg18UatCapabilities(env,true,https,1200)
  assert.deepEqual(approved,{...configUat,modelProbeUat:true})
  assert.equal(permitNativePg18BusinessUatRequest(path,"POST",approved),true)
  for(const p of [readOnly,configUat,both])
    assert.equal(permitNativePg18BusinessUatRequest(path,"POST",p),false)
  for(const [target,method] of [
    [path,"GET"],[path,"PATCH"],[path,"DELETE"],
    [path+"?host=local","POST"],[path+"/extra","POST"],
  ])assert.equal(permitNativePg18BusinessUatRequest(target,method,approved),false)
  for(const bad of [
    {...enabled,AGENT_STUDIO_PG18_MODEL_PROBE_UAT_ENABLED:"true"},
    {...env,AGENT_STUDIO_PG18_MODEL_PROBE_UAT_APPROVED:"wrong"},
    {...env,AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:undefined},
    {...enabled,AGENT_STUDIO_PG18_MODEL_PROBE_UAT_APPROVED:marker},
  ])assert.throws(()=>selectNativePg18UatCapabilities(bad,true,https,1200),
    /unsafe_native_pg18_uat_config/)
  assert.throws(()=>selectNativePg18UatCapabilities(env,false,https,1200),
    /unsafe_native_pg18_uat_config/)
  assert.throws(()=>selectNativePg18UatCapabilities(env,true,"http://localhost",1200),
    /unsafe_native_pg18_uat_config/)
  assert.throws(()=>selectNativePg18UatCapabilities(env,true,https,0),
    /unsafe_native_pg18_uat_config/)
})

test("Workflow graph-validation run requires its OWN inert UAT approval",()=>{
  const marker="APPROVE_DISPOSABLE_PG18_WORKFLOW_VALIDATION_ONLY"
  const env={...enabled,
    AGENT_STUDIO_PG18_WORKFLOW_VALIDATION_UAT_ENABLED:"true",
    AGENT_STUDIO_PG18_WORKFLOW_VALIDATION_UAT_APPROVED:marker}
  const allow=selectNativePg18UatCapabilities(env,true,https,1200)
  assert.deepEqual(allow,{...configUat,workflowValidationUat:true})
  const submit="/api/v2/workflows/"+uuid+"/validate"
  const detail="/api/v2/workflow-validations/"+uuid
  for(const state of [readOnly,configUat,both]){
    assert.equal(permitNativePg18BusinessUatRequest(submit,"POST",state),false)
    assert.equal(permitNativePg18BusinessUatRequest(detail,"GET",state),false)
  }
  assert.equal(permitNativePg18BusinessUatRequest(submit,"POST",allow),true)
  assert.equal(permitNativePg18BusinessUatRequest(detail,"GET",allow),true)
  for(const [route,method] of [
    [submit,"GET"],[submit,"PATCH"],[submit,"DELETE"],
    [detail,"POST"],[detail,"PATCH"],[detail,"DELETE"],
    [submit+"?run=1","POST"],[detail+"?owner=alice","GET"],
    [submit+"/extra","POST"],["/api/v2/workflows","POST"]
  ]){
    if(route==="/api/v2/workflows")continue // Normal config CRUD remains separate
    assert.equal(permitNativePg18BusinessUatRequest(route,method,allow),false)
  }
  for(const bad of [
    {...enabled,AGENT_STUDIO_PG18_WORKFLOW_VALIDATION_UAT_ENABLED:"true"},
    {...enabled,AGENT_STUDIO_PG18_WORKFLOW_VALIDATION_UAT_APPROVED:marker},
    {...env,AGENT_STUDIO_PG18_WORKFLOW_VALIDATION_UAT_APPROVED:"true"},
    {...env,AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:undefined},
  ])assert.throws(()=>selectNativePg18UatCapabilities(bad,true,https,1200),
    /unsafe_native_pg18_uat_config/)
  assert.throws(()=>selectNativePg18UatCapabilities(env,false,https,1200),
    /unsafe_native_pg18_uat_config/)
  assert.throws(()=>selectNativePg18UatCapabilities(env,true,"http://localhost",1200),
    /unsafe_native_pg18_uat_config/)
  assert.throws(()=>selectNativePg18UatCapabilities(env,true,https,0),
    /unsafe_native_pg18_uat_config/)
})

test("safe Workflow execution has its own queue/worker approval and cannot inherit graph-validation or Run UAT",()=>{
  const marker="APPROVE_DISPOSABLE_PG18_WORKFLOW_EXECUTION_ONLY"
  const env={...enabled,
    AGENT_STUDIO_PG18_WORKFLOW_EXECUTION_UAT_ENABLED:"true",
    AGENT_STUDIO_PG18_WORKFLOW_EXECUTION_UAT_APPROVED:marker}
  const approved=selectNativePg18UatCapabilities(env,true,https,1200)
  assert.deepEqual(approved,{...configUat,workflowExecutionUat:true})
  const submit="/api/v2/workflows/"+uuid+"/runs"
  const collection="/api/v2/workflow-runs"
  const detail=collection+"/"+uuid
  for(const policy of [readOnly,configUat,both,
    {...configUat,workflowValidationUat:true},{...configUat,runApprovalUat:true}]){
    assert.equal(permitNativePg18BusinessUatRequest(submit,"POST",policy),false)
    assert.equal(permitNativePg18BusinessUatRequest(collection,"GET",policy),true)
    assert.equal(permitNativePg18BusinessUatRequest(detail,"GET",policy),true)
  }
  assert.equal(permitNativePg18BusinessUatRequest(submit,"POST",approved),true)
  assert.equal(permitNativePg18BusinessUatRequest(collection,"GET",approved),true)
  assert.equal(permitNativePg18BusinessUatRequest(detail,"GET",approved),true)
  for(const [route,method] of [
    [submit,"GET"],[submit,"PATCH"],[submit,"DELETE"],
    [collection,"POST"],[collection,"PATCH"],[collection,"DELETE"],
    [detail,"POST"],[detail,"PATCH"],[detail,"DELETE"],
    [submit+"?force=1","POST"],[detail+"?owner=other","GET"],
    [collection+"?limit=1","GET"],[submit+"/run-now","POST"],
    ["/api/v2/runs","POST"],["/api/v2/agent-specs/"+uuid+"/runs","POST"],
  ])assert.equal(permitNativePg18BusinessUatRequest(route,method,approved),false)
  for(const bad of [
    {...enabled,AGENT_STUDIO_PG18_WORKFLOW_EXECUTION_UAT_ENABLED:"true"},
    {...enabled,AGENT_STUDIO_PG18_WORKFLOW_EXECUTION_UAT_APPROVED:marker},
    {...env,AGENT_STUDIO_PG18_WORKFLOW_EXECUTION_UAT_APPROVED:"true"},
    {...env,AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:undefined},
  ])assert.throws(()=>selectNativePg18UatCapabilities(bad,true,https,1200),
    /unsafe_native_pg18_uat_config/)
  assert.throws(()=>selectNativePg18UatCapabilities(env,false,https,1200),
    /unsafe_native_pg18_uat_config/)
  assert.throws(()=>selectNativePg18UatCapabilities(env,true,"http://localhost",1200),
    /unsafe_native_pg18_uat_config/)
  assert.throws(()=>selectNativePg18UatCapabilities(env,true,https,0),
    /unsafe_native_pg18_uat_config/)
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
  for(const pathname of [root,uuidPath]){
    for(const mode of [readOnly,configUat,allowed])
      assert.equal(permitNativePg18BusinessUatRequest(pathname,"GET",mode),true)
  }
  for(const pathname of [submit,uuidPath+"/model-approval"]){
    assert.equal(permitNativePg18BusinessUatRequest(pathname,"POST",allowed),true)
    for(const mode of [readOnly,configUat])
      assert.equal(permitNativePg18BusinessUatRequest(pathname,"POST",mode),false)
  }
  for(const [pathname,method] of [[root,"POST"],[uuidPath,"PATCH"],
    [root+"?limit=2","GET"],[uuidPath+"?cursor=1","GET"],
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

test("PG18 schedule inventory stays readable; only explicit config UAT can write inert drafts",()=>{
  const collection="/api/v2/schedules"
  const item=collection+"/"+uuid
  const history=item+"/occurrences"
  for(const policy of [readOnly,configUat,both]){
    for(const endpoint of [collection,item,history])
      assert.equal(permitNativePg18BusinessUatRequest(endpoint,"GET",policy),true)
    const writable=policy.configurationWrites===true
    assert.equal(permitNativePg18BusinessUatRequest(collection,"POST",policy),writable)
    assert.equal(permitNativePg18BusinessUatRequest(item,"PATCH",policy),writable)
    assert.equal(permitNativePg18BusinessUatRequest(item,"DELETE",policy),writable)
    for(const method of ["POST","PATCH","PUT","DELETE","HEAD"]){
      assert.equal(permitNativePg18BusinessUatRequest(history,method,policy),false)
    }
    for(const [endpoint,method] of [
      [collection,"PATCH"],[collection,"DELETE"],[collection,"PUT"],
      [item,"POST"],[item,"HEAD"],[history,"POST"],
      [collection+"/run-now","POST"],[item+"/enable","PATCH"]
    ])assert.equal(permitNativePg18BusinessUatRequest(endpoint,method,policy),false)
    for(const invalid of [
      collection+"/not-a-uuid",history+"/run",collection+"?limit=1",
      history+"?limit=30",item+"?revision=2",
    ])assert.equal(permitNativePg18BusinessUatRequest(invalid,"GET",policy),false)
  }
})
test("scheduled execution requires its own opt-in while owner status and pause remain available after revocation",()=>{
  const item="/api/v2/schedules/"+uuid
  for(const policy of [readOnly,configUat,both]){
    assert.equal(permitNativePg18BusinessUatRequest(item+"/execution","GET",policy),true)
    assert.equal(permitNativePg18BusinessUatRequest(item+"/pause","POST",policy),true)
    for(const action of ["activate","run-now","retry-start"])
      assert.equal(permitNativePg18BusinessUatRequest(item+"/"+action,"POST",policy),false)
  }
  const approved={...both,scheduleRuntimeUat:true}
  for(const action of ["activate","run-now","retry-start"])
    assert.equal(permitNativePg18BusinessUatRequest(item+"/"+action,"POST",approved),true)
  assert.throws(()=>selectNativePg18UatCapabilities({...enabled,AGENT_STUDIO_PG18_SCHEDULE_RUNTIME_ENABLED:"true",AGENT_STUDIO_PG18_SCHEDULE_RUNTIME_APPROVED:"APPROVE_DISPOSABLE_PG18_SCHEDULE_RUNTIME_ONLY"},true,https,1100),/unsafe_native_pg18_uat_config/)
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
  assert.equal(permitNativePg18BusinessUatRequest("/api/v2/runs","GET",chosen),true)
})

test("run WRITES, approvals, document ingestion and unrelated APIs NEVER enabled",()=>{
  const blocked=[
    "/api/v2/runs/"+uuid+"/model-approval",
    "/api/v2/agent-specs/"+uuid+"/runs",
    "/api/v2/knowledge-bases/"+uuid+"/document-files",
    "/api/v2/knowledge-bases/"+uuid+"/text-documents",
    "/api/v2/plugins",
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
  for(const path of ["/api/v2/runs","/api/v2/runs/"+uuid]){
    assert.equal(permitNativePg18BusinessUatRequest(path,"GET",both),true)
    for(const method of ["POST","PATCH","DELETE","HEAD"])
      assert.equal(permitNativePg18BusinessUatRequest(path,method,both),false)
  }
  assert.equal(permitNativePg18BusinessUatRequest("/healthz","POST",both),false)
})
