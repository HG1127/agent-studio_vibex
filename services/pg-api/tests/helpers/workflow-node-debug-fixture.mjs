// Synthetic Cookie/SQL fixture; no installed database or provider connection.
import {createServer} from "node:http"
import {readFileSync} from "node:fs"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {freshSchemaForTest} from "../../src/baota-pg18-fresh-init.mjs"
import {prepareNativeAuthPgliteRoles,reviewedNativeSqlForEmbeddedTest} from "./native-pg18-embedded.mjs"
import {NativeAuthRepository} from "../../src/native-auth-repository.mjs"
import {createNativeAuthHttpHandler} from "../../src/native-auth-http.mjs"
import {permitNativePg18BusinessUatRequest} from "../../src/native-config-uat-policy.ts"
import {AgentSpecRepository} from "../../src/repository.ts"
import {WorkflowRepository} from "../../src/workflow-repository.ts"
import {WorkflowV2RunRepository} from "../../src/workflow-v2-run-repository.ts"
import {ModelConnectionRepository} from "../../src/model-connection-repository.ts"
import {createHandler} from "../../src/http.ts"
import {createPgNativePilotApi} from "../../../../src/lib/pgNativePilotApi.ts"
export const debugKey=Buffer.from("0123456789abcdef".repeat(4),"hex"),debugCredential="synthetic-node-debug-credential-never-send"
export async function workflowNodeDebugFixture(){
  const db=await PGlite.create({extensions:{vector}});let server
  try{
    await db.exec("CREATE DATABASE agent_studio");await db.exec(freshSchemaForTest().sql)
    await prepareNativeAuthPgliteRoles(db)
    await db.exec(reviewedNativeSqlForEmbeddedTest(readFileSync(new URL("../../../../db/postgres/010_pg18_native_auth_proposed.sql",import.meta.url),"utf8")))
    await db.query("INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_023','synthetic predecessor') ON CONFLICT DO NOTHING")
    for(const file of ["pg_v9_024_bound_dispatch_identity.sql","pg_v9_025_workflow_model_identity.sql"])
      await db.exec(readFileSync(new URL("../../../../db/postgres/migrations/"+file,import.meta.url),"utf8").split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n"))
    let tail=Promise.resolve()
    const pool={async connect(){const previous=tail;let release;tail=new Promise(resolve=>{release=resolve});await previous;return {query:(sql,args=[])=>db.query(sql,args),release}}}
    const auth=new NativeAuthRepository(pool),password="SyntheticNodeDebugPassword#2026"
    await auth.provisionInitialAdmin({email:"alice@example.com",password,display_name:"Synthetic Alice"})
    const admin=await auth.login("alice@example.com",password);await auth.provisionEmployee(admin.token,{email:"bob@example.com",password,display_name:"Synthetic Bob"})
    const owner=(await auth.getSessionProfile(admin.token)).identity,models=new ModelConnectionRepository(pool,debugKey)
    const saved=await models.create(owner,{name:"Synthetic debug model",provider:"openai",base_url:"https://api.openai.com/v1",models:["synthetic"],api_key:debugCredential,enabled:true})
    const model=await models.testConnection(owner,saved.id,saved.revision,async()=>({status:"ok",latency_ms:1,error_code:""}))
    const binding={connection_id:model.id,connection_revision:model.revision,model_id:"synthetic"}
    const graph={version:2,nodes:[{id:"start",type:"start",data:{title:"Start"},position:{x:0,y:0}},
      {id:"tool",type:"tool",data:{title:"Tool",tool_binding_required:true,params_template:"{}"},position:{x:100,y:0}},
      {id:"model",type:"model",data:{title:"Model",model_binding:binding,prompt:"Test {{input}} / {{Tool.output}}"},position:{x:300,y:0}},
      {id:"end",type:"end",data:{title:"End",output_template:"{{Model.output}}"},position:{x:500,y:0}}],
      edges:[{id:"a",source:"start",target:"tool"},{id:"b",source:"tool",target:"model"},{id:"c",source:"model",target:"end"}]}
    const flow=await new WorkflowRepository(pool).create(owner,"Synthetic debug workflow",graph)
    const samples={input:"Synthetic {{unknown}} task",outputs:{tool:'quoted "sample"\nline'}},body={node_id:"model",expected_revision:1,idempotency_key:"synthetic-node-debug-request",samples}
    let native,backend,enabled=true;const origin="https://node-debug.test.invalid"
    const configure=()=>{native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,allowConfigurationWrites:true,allowWorkflowV2Submission:enabled,
      businessHandler:(req,res)=>{if(!permitNativePg18BusinessUatRequest(new URL(req.url,origin).pathname,req.method,{configurationWrites:true,workflowV2ExecutionUat:enabled})){
        res.writeHead(405,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"pilot_business_writes_disabled"}));return}return backend(req,res)}})}
    configure();const runs=new WorkflowV2RunRepository(pool)
    backend=createHandler({allowedOrigin:origin,verifyToken:async()=>{throw Error("cookie_required")},authenticateRequest:req=>native.authenticateRequest(req),
      repository:new AgentSpecRepository(pool),workflowRepository:new WorkflowRepository(pool),workflowV2RunRepository:runs,modelConnectionRepository:models})
    server=createServer((req,res)=>{void native.handler(req,res).catch(()=>res.destroy())});await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve)})
    const base="http://127.0.0.1:"+server.address().port,client=()=>{
      let cookie="";const dropped={submit:false,decision:false},calls=[]
      const raw=async(route,options={})=>{
        calls.push({route,body:options.body,method:options.method??"GET"})
        const response=await fetch(base+route,{...options,headers:{...options.headers,Origin:origin,...(cookie?{Cookie:cookie}:{})},signal:AbortSignal.timeout(15000)})
        const saved=response.headers.get("set-cookie");if(saved)cookie=saved.split(";")[0]
        const kind=route.endsWith("/model-node-debug")?"submit":route.endsWith("/decision")?"decision":null
        if(kind&&dropped[kind]){dropped[kind]=false;await response.arrayBuffer();throw TypeError("synthetic committed response loss")}
        return response
      };return {api:createPgNativePilotApi(raw,""),raw,dropped,calls}
    }
    const alice=client(),bob=client();await alice.api.login("alice@example.com",password);await bob.api.login("bob@example.com",password)
    return {db,pool,owner,model,flow,graph,samples,body,runs,alice,bob,base,
      enable(value){enabled=value;configure()},async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await db.close()}}
  }catch(error){server?.closeAllConnections();server?.close();await db.close();throw error}
}
