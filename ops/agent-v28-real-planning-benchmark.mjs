#!/usr/bin/env node
/**
 * V28 held-out REAL-model planner benchmark. This never executes tools.
 * Without an explicitly enabled, credentialed provider it ONLY prints
 * a planned test matrix; no fixture output is counted as a live-model score.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { performance } from "node:perf_hooks"
import { V28_UNSEEN_TASKS } from "../tests/fixtures/agent-v28-unseen-tasks.mjs"
import { AGENT_DESIGN_SYSTEM_PROMPT, agentDesignTokenBudget } from "../src/lib/agentDesignProtocol.ts"
import { evaluateBlindAgentPlan } from "../src/lib/agentDesignEvaluation.ts"

const args = new Set(process.argv.slice(2))
const live = args.has("--live")
const smoke = args.has("--smoke")
const check = args.has("--check") || !live
const provider = String(process.env.AGENT_STUDIO_V28_PROVIDER || "").toLowerCase()
const model = String(process.env.AGENT_STUDIO_V28_MODEL || "")
const key = String(process.env.AGENT_STUDIO_V28_MODEL_API_KEY || "")
const confirmed = process.env.AGENT_STUDIO_V28_CONFIRM_LIVE === "YES"
const repeats = smoke ? 1 : 3
const tasks = smoke ? V28_UNSEEN_TASKS.slice(0,2) : V28_UNSEEN_TASKS
const cap = Number(process.env.AGENT_STUDIO_V28_MAX_TOTAL_TOKENS || 180000)
const deadlineMs = Math.min(120000,Math.max(10000,Number(process.env.AGENT_STUDIO_V28_TIMEOUT_MS || 70000)))
const validProviders = ["openai","anthropic","gemini"]
const configReady = confirmed && !!model && !!key && validProviders.includes(provider) &&
  Number.isSafeInteger(cap) && cap >= 1000 && cap <= 500000

if (check) {
  console.log(JSON.stringify({
    phase:"configuration_check",liveCalls:0,credentialsConfigured:configReady,
    liveReachabilityVerified:false,
    status:configReady?"CREDENTIALS_CONFIGURED_NOT_TESTED":"NO_CONNECTED_REAL_MODEL",
    syntheticTaskCount:V28_UNSEEN_TASKS.length,repeatCount:3,plannedCalls:30,
    testTypes:"mechanical schema/DAG/tool-recall/security plus pending human blind review",
    warnings:["No fixed fixture counts as real-model evidence","All tasks use synthetic data",
      "No external tools or emails are invoked","Actual USD cost is not inferred"],
  }))
  process.exit(0)
}
if (!live || !configReady) {
  console.error("V28_REAL_MODEL_UNAVAILABLE: explicit LIVE flag, configured provider/model and credential required.")
  process.exit(3)
}

const official = {
  openai:"https://api.openai.com/v1",
  anthropic:"https://api.anthropic.com/v1",
  gemini:"https://generativelanguage.googleapis.com/v1beta",
}
const base = String(process.env.AGENT_STUDIO_V28_BASE_URL || official[provider]).replace(/\/+$/,"")
const url = new URL(base)
if (url.protocol !== "https:" ||
  ((url.hostname === "localhost" || url.hostname.endsWith(".local") || url.hostname.startsWith("127.")) &&
    process.env.AGENT_STUDIO_V28_ALLOW_CUSTOM_BASE_URL !== "YES")) {
  console.error("V28_PROVIDER_BASE_REJECTED: HTTPS required; private base must be explicitly allowlisted.")
  process.exit(3)
}
if (base !== official[provider] && process.env.AGENT_STUDIO_V28_ALLOW_CUSTOM_BASE_URL !== "YES") {
  console.error("V28_CUSTOM_BASE_REQUIRES_OPT_IN")
  process.exit(3)
}

const report = {
  schema:"agent-studio-real-planning-v28",source:"live-provider",provider,model,
  startedAt:new Date().toISOString(),synthetic:true,plannedCalls:tasks.length*repeats,
  completion:"running",checks:[],tokenTotals:{input:0,output:0},
  unpricedCostUSD:null,manualBlindReview:"pending",
}
const reportDir=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-v28-blind-"))
const reportPath=path.join(reportDir,"results.json")
function store(){fs.writeFileSync(reportPath,JSON.stringify(report,null,2))}
function userRequest(task){
  // The expected labels/minimums are NOT sent to the model.
  return JSON.stringify({ requirement:task.task,available_tools:[] })
}
async function request(task) {
  const system=AGENT_DESIGN_SYSTEM_PROMPT
  const user=userRequest(task)
  const outputMax=agentDesignTokenBudget(task.task)
  let endpoint="",headers={"Content-Type":"application/json"},payload={}
  if(provider==="openai"){
    endpoint=base+"/chat/completions"
    headers.Authorization="Bearer "+key
    payload={model,messages:[{role:"system",content:system},{role:"user",content:user}],
      ...( /^(?:gpt-[5-9]|o[1-9])/i.test(model)
        ?{max_completion_tokens:outputMax}:{max_tokens:outputMax})}
  }else if(provider==="anthropic"){
    endpoint=base+"/messages"
    headers["x-api-key"]=key
    headers["anthropic-version"]="2023-06-01"
    payload={model,system,max_tokens:outputMax,messages:[{role:"user",content:user}]}
  }else{
    endpoint=base+"/models/"+encodeURIComponent(model)+":generateContent"
    headers["x-goog-api-key"]=key
    payload={systemInstruction:{parts:[{text:system}]},
      contents:[{role:"user",parts:[{text:user}]}],
      generationConfig:{maxOutputTokens:outputMax}}
  }
  const started=performance.now()
  const response=await fetch(endpoint,{method:"POST",headers,body:JSON.stringify(payload),
    signal:AbortSignal.timeout(deadlineMs)})
  const elapsedMs=Math.round(performance.now()-started)
  if(!response.ok){
    // No provider response body is logged: it may contain account metadata.
    return {ok:false,httpStatus:response.status,elapsedMs,kind:"provider_http_"+response.status}
  }
  const body=await response.json()
  const text=provider==="openai" ? String(body?.choices?.[0]?.message?.content||"")
    :provider==="anthropic" ? (body?.content||[]).filter(part=>part.type==="text").map(part=>part.text).join("\n")
    :(body?.candidates?.[0]?.content?.parts||[]).filter(part=>typeof part.text==="string").map(part=>part.text).join("\n")
  const input=provider==="openai"?body?.usage?.prompt_tokens:
    provider==="anthropic"?body?.usage?.input_tokens:body?.usageMetadata?.promptTokenCount
  const output=provider==="openai"?body?.usage?.completion_tokens:
    provider==="anthropic"?body?.usage?.output_tokens:body?.usageMetadata?.candidatesTokenCount
  return {ok:true,text,elapsedMs,usage:{
    input:Number.isFinite(Number(input))?Number(input):null,
    output:Number.isFinite(Number(output))?Number(output):null,
  }}
}

let stoppedForBudget=false
store()
for(const task of tasks){
  for(let attempt=1;attempt<=repeats;attempt++){
    if(report.tokenTotals.input+report.tokenTotals.output>=cap){stoppedForBudget=true;break}
    try{
      const result=await request(task)
      if(!result.ok){
        report.checks.push({id:task.id,attempt,providerStatus:result.kind,
          elapsedMs:result.elapsedMs,mechanicallyPassed:false,
          humanReview:"pending"})
        if([401,402,403,429].includes(result.httpStatus)){
          report.completion="stopped_auth_or_rate_limit"
          store()
          console.error("V28_ABORT_PROVIDER_STATUS_"+result.httpStatus)
          process.exit(4)
        }
      }else{
        const evaluated=evaluateBlindAgentPlan(task,result.text)
        report.tokenTotals.input+=result.usage.input??0
        report.tokenTotals.output+=result.usage.output??0
        if((result.usage.input===null||result.usage.output===null) &&
          process.env.AGENT_STUDIO_V28_ALLOW_UNMETERED !== "YES"){
          report.checks.push({id:task.id,attempt,providerStatus:"missing_usage_metering",
            mechanicallyPassed:false,elapsedMs:result.elapsedMs,humanReview:"pending"})
          report.completion="stopped_missing_usage_metering"
          store()
          console.error("V28_ABORT_UNMETERED_PROVIDER_USAGE")
          process.exit(4)
        }
        report.checks.push({
          id:task.id,attempt,providerStatus:"ok",elapsedMs:result.elapsedMs,
          usage:result.usage,responseHash:createHash("sha256").update(result.text).digest("hex"),
          ...evaluated,
        })
      }
      store()
      const latest=report.checks.at(-1)
      console.log(JSON.stringify({case:task.id,attempt,mechanicallyPassed:latest.mechanicallyPassed,
        elapsedMs:latest.elapsedMs,parsed:latest.parsed??false,manualReview:"pending"}))
    }catch{
      report.checks.push({id:task.id,attempt,providerStatus:"request_failed_or_timeout",
        mechanicallyPassed:false,humanReview:"pending"})
      store()
      console.log(JSON.stringify({case:task.id,attempt,providerStatus:"request_failed_or_timeout"}))
    }
  }
  if(stoppedForBudget)break
}
report.completedAt=new Date().toISOString()
report.completion=stoppedForBudget?"partial_token_budget":"completed"
const trials=report.checks
const passed=trials.filter(row=>row.mechanicallyPassed).length
const parsed=trials.filter(row=>row.parsed).length
const avg = values=>values.length ? Math.round(values.reduce((a,b)=>a+b,0)/values.length):null
report.summary={
  actualCalls:trials.length,passedMechanical:passed,parsedJSON:parsed,
  mechanicalPassRate:trials.length ? Number((passed/trials.length).toFixed(4)):null,
  meanLatencyMs:avg(trials.map(x=>x.elapsedMs).filter(Number.isFinite)),
  totalReportedTokens:report.tokenTotals.input+report.tokenTotals.output,
  trueTaskQualityReviewed:0,manualReview:"pending",usdCost:null,
}
store()
console.log(JSON.stringify({completion:report.completion,summary:report.summary,reportPath}))
