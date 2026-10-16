import test from "node:test"
import assert from "node:assert/strict"
import {createHash} from "node:crypto"
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs"
import {tmpdir} from "node:os"
import path from "node:path"
import {spawnSync} from "node:child_process"
import {DatabaseSync} from "node:sqlite"
import {fileURLToPath} from "node:url"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const cli=path.join(root,"ops/pg-stage-operator.mjs")
const employee="employee0000001"
const employeeUuid="11111111-1111-4111-8111-111111111111"
const privateText="PRIVATE_TEST_PASSWORD_NEVER_ECHO_THIS"
const spec=()=>({
  goal:"Summarize public evidence",task_scope:"Synthetic only",
  deliverables:["Short memo"],task_plan:["Read summary"],
  done_criteria:["Caveats"],
  tools:["summarize"],knowledge_base_ids:[],require_approval:true,
})
function fixture({agent=true,workflow=false,orphanKBContent=false,unknownTable=false,hiddenCustom=false,platformTable=false,platformAuthTable=false,embeddingHistory=false,workflowHistory=false,agentEvents=false}={}){
  const dir=mkdtempSync(path.join(tmpdir(),"stage-operator-synthetic-"))
  const snapshot=path.join(dir,"snapshot.sqlite")
  const manifest=path.join(dir,"manifest.json")
  const mapping=path.join(dir,"mapping.json")
  const oidc=path.join(dir,"reviewed-oidc.json")
  const approval=path.join(dir,"approved-source.json")
  const db=new DatabaseSync(snapshot)
  db.exec("CREATE TABLE studio_users(id TEXT PRIMARY KEY,password TEXT);"+
    "CREATE TABLE agent_specs(id TEXT,rh_user_id TEXT,name TEXT,spec TEXT,"+
    "source TEXT,template_key TEXT,created TEXT,updated TEXT)")
  db.prepare("INSERT INTO studio_users VALUES(?,?)").run(employee,privateText)
  if(agent)db.prepare("INSERT INTO agent_specs VALUES(?,?,?,?,?,?,?,?)")
    .run("aaaaaaaaaaaaaaa",employee,"Synthetic Agent",JSON.stringify(spec()),
      "","","2026-10-14 09:00:00.000Z","2026-10-14 10:00:00.000Z")
  if(workflow){
    db.exec("CREATE TABLE workflows(id TEXT)")
    db.prepare("INSERT INTO workflows VALUES(?)").run(privateText)
  }
  if(workflowHistory){
    db.exec("CREATE TABLE workflow_runs(id TEXT); CREATE TABLE workflow_events(id TEXT)")
    db.prepare("INSERT INTO workflow_runs VALUES(?)").run("w".repeat(15))
  }
  if(agentEvents){
    db.exec("CREATE TABLE agent_runs(id TEXT);CREATE TABLE run_events(id TEXT)")
    db.prepare("INSERT INTO run_events VALUES(?)").run("e".repeat(15))
  }
  if(orphanKBContent){
    db.exec("CREATE TABLE agent_studio_kb_documents(id TEXT)")
    db.prepare("INSERT INTO agent_studio_kb_documents VALUES(?)")
      .run("orphan-document")
  }
  if(unknownTable){
    db.exec("CREATE TABLE unexpected_future_module(id TEXT,payload TEXT)")
    db.prepare("INSERT INTO unexpected_future_module VALUES(?,?)")
      .run("synthetic","PRIVATE_TABLE_DATA_NEVER_OUTPUT")
  }
  if(hiddenCustom){
    db.exec('CREATE TABLE "_unreviewed_business"(id TEXT,payload TEXT)')
    db.prepare('INSERT INTO "_unreviewed_business" VALUES(?,?)')
      .run("private-row","UNDISCLOSED_PRIVATE_BUSINESS")
  }
  if(platformTable){
    db.exec('CREATE TABLE "_collections"(id TEXT,raw_rules TEXT)')
    db.prepare('INSERT INTO "_collections" VALUES(?,?)')
      .run("synthetic","PRIVATE_PB_PLATFORM_CONFIGURATION")
  }
  if(platformAuthTable){
    db.exec('CREATE TABLE "_superusers"(id TEXT,password_hash TEXT)')
    db.prepare('INSERT INTO "_superusers" VALUES(?,?)')
      .run("synthetic-superuser","NEVER_MIGRATE_LEGACY_ADMIN_PASSWORD_HASH")
  }
  if(embeddingHistory){
    db.exec(
      "CREATE TABLE agent_studio_kb_bases("+
      "id TEXT PRIMARY KEY,rh_user_id TEXT,name TEXT,description TEXT,created_ms INTEGER,updated_ms INTEGER);"+
      "CREATE TABLE model_connections(id TEXT PRIMARY KEY,rh_user_id TEXT,api_key TEXT);"+
      "CREATE TABLE agent_studio_kb_documents("+
      "id TEXT PRIMARY KEY,base_id TEXT,rh_user_id TEXT,filename TEXT,size_chars INTEGER,chunk_count INTEGER,created_ms INTEGER);"+
      "CREATE TABLE agent_studio_kb_chunks("+
      "id TEXT PRIMARY KEY,base_id TEXT,document_id TEXT,rh_user_id TEXT,chunk_index INTEGER,text_content TEXT);"+
      "CREATE TABLE agent_studio_kb_vectors("+
      "chunk_id TEXT PRIMARY KEY,rh_user_id TEXT,base_id TEXT,document_id TEXT,connection_id TEXT,model_name TEXT,dimensions INTEGER,vector_json TEXT,indexed_ms INTEGER);"+
      "CREATE TABLE agent_studio_kb_embedding_settings("+
      "rh_user_id TEXT PRIMARY KEY,connection_id TEXT,model_name TEXT,updated_ms INTEGER);"+
      "CREATE TABLE agent_studio_kb_embedding_queue("+
      "rh_user_id TEXT,base_id TEXT,attempts INTEGER,next_attempt_ms INTEGER,lease_until_ms INTEGER,last_error TEXT,updated_ms INTEGER,PRIMARY KEY(rh_user_id,base_id))"
    )
    db.prepare("INSERT INTO agent_studio_kb_bases VALUES(?,?,?,?,?,?)")
      .run("baseA",employee,"Synthetic KB","",1792030400000,1792030400000)
    db.prepare("INSERT INTO model_connections VALUES(?,?,?)")
      .run("connA",employee,"PRIVATE_SYNTHETIC_API_KEY_NOT_EXPORTED")
    db.prepare("INSERT INTO agent_studio_kb_embedding_settings VALUES(?,?,?,?)")
      .run(employee,"connA","SYNTHETIC-EMBEDDING",1792030400100)
    db.prepare("INSERT INTO agent_studio_kb_embedding_queue VALUES(?,?,?,?,?,?,?)")
      .run(employee,"baseA",1,1792030400200,1792030400300,
        "SYNTHETIC_OLD_ERROR_NOT_EXECUTED",1792030400400)
  }
  const tables=db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table'"+
    " AND name NOT GLOB 'sqlite_*' ORDER BY name").all().map(x=>String(x.name))
  const counts=Object.fromEntries(tables.map(name=>[
    name,Number(db.prepare('SELECT COUNT(*) AS n FROM "'+name+'"').get().n),
  ]))
  db.close()
  const bytes=readFileSync(snapshot)
  const sha=createHash("sha256").update(bytes).digest("hex")
  writeFileSync(manifest,JSON.stringify({
    format:"agent-studio-sqlite-snapshot-v1",
    bytes:bytes.length,sha256:sha,tables:counts,
  }))
  writeFileSync(mapping,JSON.stringify({
    schema_version:"studio-approved-identity-map-v2",
    source_sha256:sha,
    records:[{
      old_id:employee,new_studio_user_id:employeeUuid,
      verified_by:"Synthetic independent reviewer",
      approved_at:"2026-10-15T00:00:00Z",
    }],
  }))
  writeFileSync(oidc,JSON.stringify({
    schema_version:"studio-reviewed-oidc-provision-v1",
    source_sha256:sha,
    records:[{
      old_id:employee,new_studio_user_id:employeeUuid,
      external_issuer:"https://synthetic-oidc.example.invalid",
      external_subject:"synthetic-verified-subject",
      reviewed_by:"Synthetic separate IdP reviewer",
      reviewed_at:"2026-10-15T00:00:00Z",
    }],
  }))
  writeFileSync(approval,JSON.stringify({
    source_sha256:sha,approved_by:"Synthetic auditor",
    approved_at:"2026-10-15T00:00:00Z",
  }))
  return {dir,snapshot,manifest,mapping,oidc,approval}
}
const invoke=(f,mode="--plan",extra=[],env={})=>spawnSync(
  process.execPath,[
    cli,mode,
    "--snapshot",f.snapshot,"--manifest",f.manifest,
    "--mapping",f.mapping,"--oidc",f.oidc,
    "--approval",f.approval,...extra,
  ],{cwd:root,encoding:"utf8",timeout:40000,env:{
    ...process.env,AGENT_STUDIO_PG_STAGE_OPERATOR_ENABLED:"false",
    ...env,
  }}
)
test("single offline operator plan composes approved disabled identity, Agent and reconciliation without any database connection",()=>{
  const f=fixture()
  try{
    const out=invoke(f)
    assert.equal(out.status,0,out.stderr)
    const parsed=JSON.parse(out.stdout)
    assert.equal(parsed.operation,"dry_run")
    assert.equal(parsed.result,"preflight_verified")
    assert.equal(parsed.source_snapshot_verified,true)
    assert.equal(parsed.full_manifest_verified,true)
    assert.equal(parsed.production_cutover_allowed,false)
    assert.equal(parsed.phase_results.length,3)
    assert.deepEqual(parsed.phase_results.map(x=>x.phase),[
      "identity","agent","reconciliation",
    ])
    assert.ok(parsed.phase_results.every(x=>x.status==="passed"))
    for(const secret of [privateText,employee,employeeUuid,
      "synthetic-verified-subject",f.snapshot]){
      assert.ok(!out.stdout.includes(secret)&&!out.stderr.includes(secret))
    }
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("stage execution cannot start without explicit operator opt-in and destroyable-stage confirmation",()=>{
  const f=fixture()
  try{
    const absent=invoke(f,"--execute")
    assert.equal(absent.status,1)
    assert.match(absent.stderr,/isolated_stage_confirmation_required/)
    const disabled=invoke(f,"--execute",[
      "--confirm-isolated-stage","agentstudio_stage",
      "--allow-partial-trial",
    ])
    assert.equal(disabled.status,1)
    assert.match(disabled.stderr,/stage_operator_disabled/)
    assert.doesNotMatch(disabled.stderr,/ECONNREFUSED|ENOTFOUND/)
    const wrong=invoke(f,"--execute",[
      "--confirm-isolated-stage","production",
      "--allow-partial-trial",
    ],{AGENT_STUDIO_PG_STAGE_OPERATOR_ENABLED:"true"})
    assert.equal(wrong.status,1)
    assert.match(wrong.stderr,/isolated_stage_confirmation_required/)
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("unknown legacy workflow content blocks ALL domains before stage writes",()=>{
  const f=fixture({workflow:true})
  try{
    const out=invoke(f)
    assert.equal(out.status,2,out.stderr)
    const info=JSON.parse(out.stdout)
    assert.equal(info.result,"preflight_blocked")
    assert.equal(info.production_cutover_allowed,false)
    assert.equal(info.phase_results.find(x=>x.phase==="workflow").status,"blocked")
    assert.ok(info.phase_results.some(x=>x.phase==="agent"&&x.status==="passed"))
    assert.ok(!out.stdout.includes(privateText))
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("nonempty Workflow run history is routed to audited, inert archive and cannot silently disappear",()=>{
  const f=fixture({workflowHistory:true})
  try{
    const out=invoke(f)
    assert.equal(out.status,2,out.stderr)
    const report=JSON.parse(out.stdout)
    assert.equal(report.result,"preflight_blocked")
    assert.equal(report.unmapped_nonempty_tables,0)
    assert.ok(report.phase_results.some(x=>x.phase==="workflow_history"&&x.status==="blocked"))
    assert.equal(report.production_cutover_allowed,false)
    assert.equal(report.phase_results.find(x=>x.phase==="workflow_history").exit_code,1)
    assert.ok(!out.stdout.includes(privateText))
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("Agent events require a reviewed matching historical run before stage writes",()=>{
  const f=fixture({agentEvents:true})
  try{
    const out=invoke(f)
    assert.equal(out.status,2,out.stderr)
    const report=JSON.parse(out.stdout)
    assert.equal(report.result,"preflight_blocked")
    assert.equal(report.unmapped_nonempty_tables,0)
    assert.ok(report.phase_results.some(x=>x.phase==="agent_events"&&x.status==="blocked"))
    assert.equal(report.production_cutover_allowed,false)
    assert.ok(!out.stdout.includes(privateText))
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("a metadata manifest that forgets any data table cannot authorize a trial even if snapshot SHA matches",()=>{
  const f=fixture()
  try{
    const info=JSON.parse(readFileSync(f.manifest,"utf8"))
    delete info.tables.agent_specs
    writeFileSync(f.manifest,JSON.stringify(info))
    const bad=invoke(f)
    assert.equal(bad.status,1)
    assert.match(bad.stderr,/backup_manifest_incomplete/)
    assert.equal(bad.stdout,"")
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("legacy KB content without its source base cannot be silently skipped",()=>{
  const f=fixture({orphanKBContent:true})
  try{
    const out=invoke(f)
    assert.equal(out.status,1)
    assert.match(out.stderr,/orphan_kb_content_without_base/)
    assert.equal(out.stdout,"")
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("combined KB metadata and historical embedding queue use only the verified W18 offline phase",()=>{
  const f=fixture({embeddingHistory:true})
  try{
    const out=invoke(f)
    assert.equal(out.status,0,out.stderr)
    const report=JSON.parse(out.stdout)
    assert.equal(report.result,"preflight_verified")
    assert.deepEqual(report.phase_results.map(x=>x.phase),[
      "identity","agent","knowledge_combined","reconciliation",
    ])
    assert.ok(report.phase_results.every(x=>x.status==="passed"))
    assert.equal(report.production_cutover_allowed,false)
    assert.equal(report.unmapped_nonempty_tables,0)
    assert.ok(!out.stdout.includes("PRIVATE_SYNTHETIC_API_KEY_NOT_EXPORTED"))
    assert.ok(!out.stdout.includes("SYNTHETIC_OLD_ERROR_NOT_EXECUTED"))
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("previously unknown nonempty collection blocks EVERY stage import before networking",()=>{
  const f=fixture({unknownTable:true})
  try{
    const out=invoke(f)
    assert.equal(out.status,2,out.stderr)
    const result=JSON.parse(out.stdout)
    assert.equal(result.result,"preflight_blocked")
    assert.equal(result.unmapped_nonempty_tables,1)
    assert.deepEqual(result.blockers,["unmapped_nonempty_legacy_tables"])
    assert.equal(result.phase_results.length,0)
    assert.equal(result.production_cutover_allowed,false)
    assert.ok(!out.stdout.includes("PRIVATE_TABLE_DATA_NEVER_OUTPUT"))
    const cannotExecute=invoke(f,"--execute",[
      "--confirm-isolated-stage","agentstudio_stage","--allow-partial-trial",
    ],{AGENT_STUDIO_PG_STAGE_OPERATOR_ENABLED:"true",
      AGENT_STUDIO_PG_HOST:"127.0.0.1",
      AGENT_STUDIO_PG_DATABASE:"agentstudio_stage",
      AGENT_STUDIO_PG_IMPORT_USER:"agentstudio_admin",
      AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE:"",
    })
    assert.equal(cannotExecute.status,1)
    // On GitHub hosted CI, the *stronger* production-data-in-CI fence
    // runs before any credential/PG access and must take precedence.
    const expected=process.env.GITHUB_ACTIONS==="true"?
      /real_business_snapshot_forbidden_in_github_ci/:
      /stage_operator_password_file_required/
    assert.match(cannotExecute.stderr,expected)
    assert.doesNotMatch(cannotExecute.stderr,/ECONNREFUSED|ENOTFOUND/)
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("unknown nonempty underscore-prefixed collection fails before any stage writes",()=>{
  const f=fixture({hiddenCustom:true})
  try{
    const out=invoke(f)
    assert.equal(out.status,2,out.stderr)
    const info=JSON.parse(out.stdout)
    assert.equal(info.result,"preflight_blocked")
    assert.equal(info.unmapped_nonempty_tables,1)
    assert.equal(info.excluded_platform_table_count,0)
    assert.equal(info.phase_results.length,0)
    assert.deepEqual(info.blockers,["unmapped_nonempty_legacy_tables"])
    assert.ok(!out.stdout.includes("UNDISCLOSED_PRIVATE_BUSINESS"))
    assert.equal(info.production_cutover_allowed,false)
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})

test("explicit PocketBase system metadata exclusion is separately counted and never greenlights production",()=>{
  const f=fixture({platformTable:true})
  try{
    const out=invoke(f)
    assert.equal(out.status,0,out.stderr)
    const info=JSON.parse(out.stdout)
    assert.equal(info.result,"preflight_verified")
    assert.equal(info.excluded_platform_table_count,1)
    assert.equal(info.excluded_platform_row_count,1)
    assert.equal(info.platform_configuration_rebuild_required,true)
    assert.equal(info.unmapped_nonempty_tables,0)
    assert.ok(info.blockers.includes("pocketbase_platform_metadata_rebuild_unverified"))
    assert.equal(info.production_cutover_allowed,false)
    assert.ok(!out.stdout.includes("PRIVATE_PB_PLATFORM_CONFIGURATION"))
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("PocketBase superuser credentials require separate IdP reprovision review, not silent import",()=>{
  const f=fixture({platformAuthTable:true})
  try{
    const out=invoke(f)
    assert.equal(out.status,0,out.stderr)
    const result=JSON.parse(out.stdout)
    assert.equal(result.result,"preflight_verified")
    assert.equal(result.excluded_auth_table_count,1)
    assert.equal(result.excluded_auth_row_count,1)
    assert.equal(result.legacy_auth_reprovision_review_required,true)
    assert.ok(result.blockers.includes("pocketbase_legacy_auth_reprovision_unverified"))
    assert.equal(result.production_cutover_allowed,false)
    assert.ok(!out.stdout.includes("NEVER_MIGRATE_LEGACY_ADMIN_PASSWORD_HASH"))
    assert.ok(!out.stderr.includes("NEVER_MIGRATE_LEGACY_ADMIN_PASSWORD_HASH"))
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("expired or mismatched review blocks before planning or connecting to stage",()=>{
  const f=fixture()
  try{
    const x=JSON.parse(readFileSync(f.oidc,"utf8"))
    x.source_sha256="a".repeat(64)
    writeFileSync(f.oidc,JSON.stringify(x))
    const out=invoke(f)
    assert.equal(out.status,1)
    assert.match(out.stderr,/unapproved_operator_reviews/)
    assert.equal(out.stdout,"")
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
