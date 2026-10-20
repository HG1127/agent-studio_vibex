#!/usr/bin/env node
// Disposable PG18 CI: claim ONE synthetic Prepare job from an independent
// operating-system process. No task execution, model calls or HTTP.
// No unsafe defaults: exact CI target is checked before creating a Pool.
import {createHash} from "node:crypto"
import pg from "pg"
import {requireEphemeralPg18Ci} from "../../src/pg18-ephemeral-ci-guard.mjs"
import {AgentPrepareWorker} from "../../src/agent-worker.ts"

const names=new Set(["a","b"])
function workerPassword(adminPassword){
  return "synthetic-"+createHash("sha256")
    .update(adminPassword+":worker").digest("hex").slice(0,48)
}
function adapter(pool){
  return {async connect(){
    const client=await pool.connect()
    return {
      async query(sql,params=[]){
        const r=await client.query(sql,params)
        return {rows:r.rows}
      },
      release(){client.release()}
    }
  }}
}
async function run(){
  const args=process.argv.slice(2)
  if(args.length!==2||args[0]!=="--prepare-claim-once"||!names.has(args[1]))
    throw Error("invalid_ephemeral_claim_args")
  const target=requireEphemeralPg18Ci(process.env)
  const workerId="pg18-ci-prepare-"+args[1]
  const pool=new pg.Pool({...target,
    user:"agentstudio_stage_worker",
    password:workerPassword(target.password),
    max:1,connectionTimeoutMillis:4000})
  try{
    const claim=await new AgentPrepareWorker(adapter(pool),workerId).claim()
    if(!claim||claim.lease_owner!==workerId||
       claim.payload?.phase!=="prepare")
      throw Error("unexpected_prepare_lease")
    // Return only synthetic queue lease metadata; never any prompt, model
    // input, credential or private SQL output.
    const fields=[
      "id","run_id","owner_user_id","kind","payload",
      "lease_owner","lease_token","lease_version","lease_until",
      "attempts","max_attempts"
    ]
    const lease=Object.fromEntries(fields.map(key=>[key,claim[key]]))
    process.stdout.write(JSON.stringify({worker:workerId,lease})+"\n")
  }finally{
    await pool.end()
  }
}
void run().catch(()=>{
  process.stderr.write("pg18_ephemeral_claim_refused\n")
  process.exitCode=3
})
