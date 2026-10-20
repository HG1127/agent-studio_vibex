// CI-only, pure loader of the already versioned empty PostgreSQL schema.
// Does not import operator bootstrap/credential tooling or connect to a DB.
import {readFileSync} from "node:fs"
import {createHash} from "node:crypto"
import path from "node:path"
import {fileURLToPath} from "node:url"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
export function loadPg18CiBaseline(){
  const raw=readFileSync(path.join(root,"db/postgres/001_stage_schema.sql"),"utf8")
  const lines=raw.split(/\r?\n/)
  if(lines.filter(x=>x.trim().startsWith("\\")).join("")!=="\\set ON_ERROR_STOP on"||
     lines.filter(x=>x.trim()==="BEGIN;").length!==1||
     lines.filter(x=>x.trim()==="COMMIT;").length!==1)
    throw Error("pg18_ci_baseline_format_changed")
  const sql=lines.filter(x=>!["\\set ON_ERROR_STOP on","BEGIN;","COMMIT;"]
    .includes(x.trim())).join("\n")
  if((sql.match(/\bCREATE TABLE agentstudio\./g)||[]).length!==20||
     !sql.includes("CREATE EXTENSION IF NOT EXISTS vector")||
     !sql.includes("FORCE ROW LEVEL SECURITY")||
     !sql.includes("CREATE POLICY worker_effect_safety_read")||
     /\bDROP\s+(?:TABLE|DATABASE|SCHEMA)\b/i.test(sql))
    throw Error("pg18_ci_baseline_contract_changed")
  return {sql,sha256:createHash("sha256").update(raw).digest("hex")}
}
