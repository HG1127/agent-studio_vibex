#!/usr/bin/env node
// Fail release builds if PostgreSQL pilot code is accidentally bundled.
// This script INSPECTS the output only. It does not deploy, publish or access
// any backend, browser storage, secrets or external service.
import {readdirSync,readFileSync,statSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const dist=path.join(root,"dist")
const assets=path.join(dist,"assets")
if(!statSync(assets).isDirectory())
  throw Error("production_bundle_assets_missing")
const files=readdirSync(assets)
const leaks=files.filter(name=>/^(?:PgPilotPage|PgNativePilotPage)[-.]/.test(name))
for(const name of files){
  if(!name.endsWith(".js"))continue
  const code=readFileSync(path.join(assets,name),"utf8")
  if(code.includes("PostgreSQL V8.2 试验工作台")||
    code.includes("/__pg/api/v2")||
    code.includes("oidc_access_token_required")||
    code.includes("独立员工工作台")||
    code.includes("/__pg_native/")||
    code.includes("pg_native_connection_unavailable")||
    code.includes("__Host-agentstudio_session"))
    leaks.push(name)
}
if(leaks.length){
  process.stderr.write("PG pilot code detected in production assets: "+
    [...new Set(leaks)].join(", ")+"\n")
  process.exitCode=1
}else{
  process.stdout.write("production_pilot_bundle_isolation: PASS ("+
    files.length+" assets inspected)\n")
}
