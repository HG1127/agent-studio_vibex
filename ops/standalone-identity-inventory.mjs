#!/usr/bin/env node
// Read-only inventory of legacy user ownership, for an operator-approved
// migration. Never edits database records or auto-guesses old-to-new identities.
import fs from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const argv=process.argv.slice(2)
const value=(flag)=>{
 const n=argv.indexOf(flag)
 if(n<0)return ""
 if(!argv[n+1] || argv[n+1].startsWith("--"))throw Error("missing value for "+flag)
 return path.resolve(argv[n+1])
}
const fields=["rh_user_id","owner_uid","owner_user_id","used_by"]
const quote=s=>'"'+String(s).replaceAll('"','""')+'"'
function saveJson(filename,obj){
 const dest=path.resolve(filename)
 fs.mkdirSync(path.dirname(dest),{recursive:true,mode:0o700})
 fs.writeFileSync(dest,JSON.stringify(obj,null,2)+"\n",{flag:"wx",mode:0o600})
}
let db
try{
 const filename=value("--db")
 if(!filename)throw Error("provide an explicit --db path to a verified SQLite snapshot")
 const live=path.join(root,"pocketbase","pb_data","data.db")
 if(path.normalize(filename).toLowerCase()===path.normalize(live).toLowerCase())
   throw Error("refusing to inspect the project live database; create a verified backup first")
 const stat=fs.statSync(filename)
 if(!stat.isFile()||stat.size===0)throw Error("not a nonempty SQLite file")
 const initial={size:stat.size,mtimeMs:stat.mtimeMs}
 db=new DatabaseSync(filename,{readOnly:true})
 const pragma=db.prepare("PRAGMA quick_check").get()
 if(Object.values(pragma)[0]!=="ok")throw Error("SQLite integrity check failed")
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
 const inventory=[]
 const allIds=new Set()
 for(const item of tables){
   const name=String(item.name)
   const columns=db.prepare("PRAGMA table_info("+quote(name)+")").all().map(c=>String(c.name))
   for(const field of fields){
     if(!columns.includes(field))continue
     const key=quote(field),tbl=quote(name)
     const result=db.prepare("SELECT COUNT(*) AS rows, COUNT(DISTINCT "+key+") AS owners FROM "+tbl+
       " WHERE "+key+" IS NOT NULL AND LENGTH(TRIM(CAST("+key+" AS TEXT)))>0").get()
     inventory.push({table:name,identity_field:field,rows:Number(result.rows),distinct_owner_ids:Number(result.owners)})
     if(argv.includes("--mapping-template")){
       for(const r of db.prepare("SELECT DISTINCT "+key+" AS id FROM "+tbl+
          " WHERE "+key+" IS NOT NULL AND LENGTH(TRIM(CAST("+key+" AS TEXT)))>0").all()){
         if(r.id!==undefined&&r.id!==null)allIds.add(String(r.id))
       }
     }
   }
 }
 db.close();db=null
 const check=fs.statSync(filename)
 if(check.size!==initial.size||check.mtimeMs!==initial.mtimeMs)
   throw Error("source changed during inventory; use a frozen verified backup")
 const report={
   schema_version:"studio-identity-inventory-v1",
   database:filename,read_only:true,
   tables_with_identity:inventory.length,
   total_owner_references:inventory.reduce((n,x)=>n+x.rows,0),
   identity_columns:inventory,
   warning:"This is NOT an identity migration. Existing RH owner IDs must be mapped after a verified personal/business authorization review."
 }
 const output=value("--output")
 if(output)saveJson(output,report)
 else console.log(JSON.stringify(report,null,2))
 const mapping=value("--mapping-template")
 if(mapping) {
   const entries=[...allIds].sort().map(old_id=>({old_id,new_studio_user_id:null,verified_by:null}))
   saveJson(mapping,{
     schema_version:"studio-approved-identity-map-v1",
     source_database:filename,
     records:entries,
     warning:"Sensitive user IDs. Store securely. Never auto-populate new_studio_user_id or apply to a live database."
   })
   console.log("Saved restricted mapping template with "+entries.length+" distinct owner identifiers (no IDs shown in terminal).")
 }
}catch(err){
 if(db)db.close()
 console.error("Read-only identity inventory blocked: "+String(err.message||err))
 process.exitCode=1
}
