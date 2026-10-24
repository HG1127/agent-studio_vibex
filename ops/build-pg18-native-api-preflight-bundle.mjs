#!/usr/bin/env node
// Create an isolated, operator-uploaded PG18 native API PRE-FLIGHT package.
// No database access, service startup, secrets, PocketBase data or npm install.
// The output is a verifiable source bundle, not an online deployment.
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {spawnSync} from "node:child_process"
import {createHash} from "node:crypto"
import ts from "typescript"

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const included=new Set([
  "services/pg-api/src/native-server.ts",
  "services/pg-api/src/native-auth-repository.d.mts",
  "services/pg-api/src/native-auth-http.d.mts",
  "ops/baota-pg18-native-api-preflight.sh",
])
const hash=raw=>createHash("sha256").update(raw).digest("hex")
const thirdParty={
  ajv:"8.20.0",
  pg:"8.23.1",
  jszip:"3.10.2",
  mammoth:"1.13.0",
  "pdfjs-dist":"6.4.299",
}
function refuse(reason){throw Error("native_preflight_bundle_refused:"+reason)}
function validatedPath(rel){
  if(typeof rel!=="string"||(!rel.startsWith("services/pg-api/src/")&&!["shared/schedule-time.mjs","shared/agent-role-limits.mjs"].includes(rel))||
     !/^[A-Za-z0-9._/-]+$/.test(rel)||rel.includes("..")||
     !/\.(?:ts|mjs|mts|js)$/.test(rel))
    refuse("unexpected_dependency:"+(typeof rel==="string"&&/^[A-Za-z0-9._/-]{1,300}$/.test(rel)?rel:"invalid"))
  return rel
}
const visited=new Set()
const foundExternals=new Set()
function includeSource(rel){
  validatedPath(rel)
  if(visited.has(rel))return
  visited.add(rel)
  included.add(rel)
  const source=path.join(repo,rel)
  if(!fs.existsSync(source)||!fs.lstatSync(source).isFile()||
     fs.lstatSync(source).isSymbolicLink())refuse("missing_source")
  const code=fs.readFileSync(source,"utf8")
  const tree=ts.createSourceFile(rel,code,ts.ScriptTarget.Latest,true)
  const targets=new Set()
  const add=node=>{if(node&&ts.isStringLiteralLike(node))targets.add(node.text)}
  const visit=node=>{
    if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))add(node.moduleSpecifier)
    else if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword)add(node.arguments[0])
    else if(ts.isImportTypeNode(node)&&ts.isLiteralTypeNode(node.argument))add(node.argument.literal)
    else if(ts.isNewExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==="URL"&&
      node.arguments?.length===2&&node.arguments[1].getText(tree)==="import.meta.url"){
      const target=node.arguments[0]
      if(ts.isStringLiteralLike(target)&&target.text.startsWith("."))add(target)
    }
    ts.forEachChild(node,visit)
  }
  visit(tree)
  for(const target of targets){
    if(target.startsWith("."))includeSource(path.posix.normalize(path.posix.join(path.posix.dirname(rel),target)))
    else if(!target.startsWith("node:"))foundExternals.add(target.split("/").slice(0,target.startsWith("@")?2:1).join("/"))
  }
}
function tar(args){
  const result=spawnSync("tar",args,{
    encoding:"utf8",timeout:30000,cwd:repo,
  })
  if(result.status!==0)refuse("tar_failed:"+result.stderr.slice(0,150))
  return result.stdout
}
function checkFile(file){
  if(!fs.existsSync(file)||!fs.lstatSync(file).isFile()||
     fs.lstatSync(file).isSymbolicLink())refuse("non_regular_source")
  return fs.readFileSync(file)
}
function build(output,includeKnowledgeIndex=false){
  if(typeof output!=="string"||!path.isAbsolute(output)||output.includes("\0"))
    refuse("absolute_output_directory_required")
  const pathNormalized=path.resolve(output)
  // No artifacts in source tree; artifacts are outside Git and never secrets.
  const relative=path.relative(repo,pathNormalized)
  if(relative===""||(!relative.startsWith(".."+path.sep)&&
     relative!==".."&&!path.isAbsolute(relative)))
    refuse("output_inside_repo")
  fs.mkdirSync(pathNormalized,{recursive:true})
  includeSource("services/pg-api/src/native-server.ts")
  if(includeKnowledgeIndex){
    includeSource("services/pg-api/src/knowledge-index-service.ts")
    included.add("ops/templates/agentstudio-pg18-knowledge-index.service.example")
    included.add("ops/templates/agentstudio-pg18-knowledge-index-broker.service.example")
  }
  for(const module of foundExternals){
    if(!(module in thirdParty))refuse("unapproved_runtime_dependency:"+module)
  }
  for(const required of ["pg","jszip","pdfjs-dist","mammoth"])
    if(!(required in thirdParty))refuse("incomplete_package")
  const date=new Date().toISOString().replace(/[-:]/g,"").replace(/\..*/,"")
  const archive=path.join(pathNormalized,
    (includeKnowledgeIndex?"agentstudio_pg18_native_api_index_preflight_v1_":"agentstudio_pg18_native_api_preflight_v1_")+date+".tar.gz")
  if(fs.existsSync(archive))refuse("archive_already_exists")
  const staging=fs.mkdtempSync(path.join(pathNormalized,
    "native-api-review-staging-"))
  try{
    const files={}
    for(const relativePath of [...included].sort()){
      if(relativePath==="ops/baota-pg18-native-api-preflight.sh"||includeKnowledgeIndex&&[
        "ops/templates/agentstudio-pg18-knowledge-index.service.example",
        "ops/templates/agentstudio-pg18-knowledge-index-broker.service.example",
      ].includes(relativePath)){
        files[relativePath]=checkFile(path.join(repo,relativePath))
        continue
      }
      validatedPath(relativePath)
      files[relativePath]=checkFile(path.join(repo,relativePath))
    }
    // Explicit locked versions, not a loose dependency upgrade.
    const pkg={
      name:"agentstudio-pg18-native-api-operator-preflight",
      version:"0.0.0",private:true,type:"module",
      engines:{node:">=24"},
      dependencies:thirdParty,
    }
    files["services/pg-api/package.json"]=Buffer.from(
      JSON.stringify(pkg,null,2)+"\n")
    files["README_API_PREFLIGHT.txt"]=Buffer.from([
      "Agent Studio PG18 Native API — OPERATOR READ-ONLY PRE-FLIGHT V1",
      "This package contains source and dependency metadata only.",
      "It has no passwords, .env, database records, npm lockfile or binaries.",
      ...(includeKnowledgeIndex?["Includes index/query daemon source and read-only service examples. No service is started.",
        "Index offline plan: node --experimental-strip-types services/pg-api/src/knowledge-index-service.ts --plan",
        "SQL032-038 and dedicated NOINHERIT logins must be separately reviewed/provisioned; this package applies no SQL.",
        "Index and reader-query dispatch require separate operator approval and per-owner/per-query billing confirmation."]:[]),
      "Use a NEW directory /opt/agentstudio-pg18-api-preflight-v1.",
      "Target: PostgreSQL 18 at 127.0.0.1:5333, agent_studio only.",
      "Preserve all existing PocketBase and vcaios services.",
      "",
      "After separate verification of the OUTER tar SHA-256 and extraction:",
      "  cd /opt/agentstudio-pg18-api-preflight-v1",
      "  sha256sum -c SHA256SUMS",
      "  /opt/agentstudio-node24/bin/node --experimental-strip-types services/pg-api/src/native-server.ts --plan",
      "",
      "Install pinned non-dev packages (does not start Node services):",
      "  cd services/pg-api",
      "  PATH=/opt/agentstudio-node24/bin:$PATH /opt/agentstudio-node24/bin/npm install --omit=dev --ignore-scripts --no-audit --no-fund",
      "  cd ../..",
      "",
      "Database PRE-FLIGHT ONLY (never opens an HTTP listener):",
      "  bash ops/baota-pg18-native-api-preflight.sh",
      "Expected: mode=preflight, ready=true, target=agent_studio,",
      "  verified_roles=2, verified_active_admins=1,",
      "  writes_performed=false, port_opened=false, workers_started=false.",
      "",
      "DO NOT RUN --serve. Remote browser login requires a reviewed",
      "HTTPS same-origin reverse-proxy design and a separate authorization.",
      "Never start API Worker, run model jobs or switch PocketBase.",
      "",
    ].join("\n"))
    const manifestPaths=Object.keys(files).sort()
    for(const [rel,raw] of Object.entries(files)){
      if(/(?:^|\/)(?:\.env[^/]*|pb_data|node_modules|secrets?|credentials?)(?:\/|$)/i.test(rel))
        refuse("credentials_in_path")
      const destination=path.join(staging,rel)
      fs.mkdirSync(path.dirname(destination),{recursive:true})
      fs.writeFileSync(destination,raw)
    }
    const manifest=manifestPaths.map(rel=>
      hash(files[rel])+"  "+rel
    ).join("\n")+"\n"
    fs.writeFileSync(path.join(staging,"SHA256SUMS"),manifest)
    tar(["-czf",archive,"-C",staging,"."])
    const listing=tar(["-tzf",archive]).split(/\r?\n/)
      .filter(item=>item&&!item.endsWith("/"))
      .map(item=>item.replace(/^\.\//,"")).sort()
    if(JSON.stringify(listing)!==
       JSON.stringify([...manifestPaths,"SHA256SUMS"].sort()))
      refuse("unexpected_tar_contents")
    const verify=fs.mkdtempSync(path.join(pathNormalized,"native-api-verify-"))
    try{
      tar(["-xzf",archive,"-C",verify])
      for(const rel of manifestPaths)
        if(hash(fs.readFileSync(path.join(verify,rel)))!==hash(files[rel]))
          refuse("extracted_file_hash_mismatch")
      if(fs.readFileSync(path.join(verify,"SHA256SUMS"),"utf8")!==manifest)
        refuse("extracted_manifest_mismatch")
      const probe=spawnSync(process.execPath,[
        "--experimental-strip-types",
        "services/pg-api/src/native-server.ts","--plan",
      ],{cwd:verify,encoding:"utf8",timeout:18000,
        env:{...process.env,DATABASE_URL:"postgres://forbidden-prod"}})
      if(probe.status!==0)
        refuse("isolated_offline_plan_failed:"+
          probe.stderr.slice(0,190))
      const plan=JSON.parse(probe.stdout.trim())
      if(plan.network_used!==false||plan.database!=="agent_studio"||
         plan.database_port!==5333||plan.production_cutover_allowed!==false||
         plan.workers_started!==false)refuse("plan_not_safe")
      // No listener or unknown launch is permitted without --serve.
      const noArgs=spawnSync(process.execPath,[
        "--experimental-strip-types","services/pg-api/src/native-server.ts",
      ],{cwd:verify,encoding:"utf8",timeout:16000})
      if(noArgs.status!==1||
         !noArgs.stderr.includes("NATIVE_SERVER_EXPLICIT_MODE_REQUIRED"))
        refuse("default_start_not_refused")
      if(includeKnowledgeIndex){
        for(const args of [[],["--plan"]]){
          const index=spawnSync(process.execPath,["--experimental-strip-types","services/pg-api/src/knowledge-index-service.ts",...args],
            {cwd:verify,encoding:"utf8",timeout:18000,env:{...process.env,DATABASE_URL:"postgres://forbidden-prod"}})
          if(index.status!==0)refuse("isolated_index_plan_failed")
          const value=JSON.parse(index.stdout.trim())
          if(["credentials_read","network_used","provider_calls","workers_started","production_cutover_allowed"].some(key=>value[key]!==false))refuse("index_plan_not_safe")
        }
      }
    }finally{fs.rmSync(verify,{recursive:true,force:true})}
    return {
      archive,sha256:hash(fs.readFileSync(archive)),
      size_bytes:fs.statSync(archive).size,
      source_files:visited.size,
      packed_files:manifestPaths.length+1,
      dependencies:thirdParty,
      manifest_verified:true,
      offline_plan_verified:true,
      default_start_refused:true,
      contains_secrets:false,
      ...(includeKnowledgeIndex?{knowledge_index_service_included:true,index_default_plan_only:true}:{}),
    }
  }finally{fs.rmSync(staging,{recursive:true,force:true})}
}
if(process.argv[1]&&path.resolve(process.argv[1])===
  fileURLToPath(import.meta.url)){
  try{
    if(![4,5].includes(process.argv.length)||process.argv[2]!=="--output-dir"||process.argv.length===5&&process.argv[4]!=="--with-knowledge-index")
      refuse("exact_output_arguments_required")
    process.stdout.write(JSON.stringify(build(process.argv[3],process.argv.length===5))+"\n")
  }catch(e){
    process.stderr.write("PG18_NATIVE_API_BUNDLE_REFUSED:"+
      (e instanceof Error?e.message:"unknown")+"\n")
    process.exitCode=1
  }
}
