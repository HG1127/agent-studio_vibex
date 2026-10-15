// Explicitly gated, model-only staging adapter. No arbitrary HTTP URLs,
// tools, plugins, browsers, or customer-supplied API credentials.
import {readFileSync,statSync} from "node:fs"

export interface ModelInput {
  goal:string
  instruction:string
  taskScope:string
  deliverables:string[]
  doneCriteria:string[]
}
export interface ModelProvider {
  generate(input:ModelInput):Promise<string>
}
export function createStagingOpenAIProvider(
  env:NodeJS.ProcessEnv=process.env,
  request:typeof fetch=fetch,
):ModelProvider {
  if(env.AGENT_STUDIO_PG_MODEL_WORKER_ENABLED!=="true")
    throw Error("model_worker_disabled")
  const endpoint=env.AGENT_STUDIO_MODEL_ENDPOINT||
    "https://api.openai.com/v1/chat/completions"
  let parsed:URL
  try{parsed=new URL(endpoint)}catch{throw Error("unsafe_model_endpoint")}
  // Fail closed: no redirects, private IPs, proxies or employee-controlled URLs.
  if(parsed.href!=="https://api.openai.com/v1/chat/completions")
    throw Error("unsafe_model_endpoint")
  const model=env.AGENT_STUDIO_MODEL_ID||""
  if(!/^[A-Za-z0-9._-]{1,100}$/.test(model))
    throw Error("invalid_model_id")
  const file=env.AGENT_STUDIO_MODEL_API_KEY_FILE||""
  if(!file)throw Error("missing_model_secret")
  const stat=statSync(file)
  if(!stat.isFile()||stat.size<20||stat.size>4096)
    throw Error("unsafe_model_secret")
  const key=readFileSync(file,"utf8").replace(/[\r\n]+$/g,"")
  if(key.length<20||/[\r\n\0]/.test(key))
    throw Error("unsafe_model_secret")
  return {
    async generate(input:ModelInput):Promise<string> {
      if(!input.goal.trim()||input.goal.length>2000 ||
         input.instruction.length>1200 ||
         input.taskScope.length>2000 ||
         input.deliverables.length>20||input.doneCriteria.length>20 ||
         [...input.deliverables,...input.doneCriteria]
           .some(x=>typeof x!=="string"||x.length>300))
        throw Error("invalid_model_input")
      const content=[
        "Goal: "+input.goal,
        "Scope: "+input.taskScope,
        "Instruction: "+input.instruction,
        "Deliverables:\n"+input.deliverables.join("\n"),
        "Acceptance criteria:\n"+input.doneCriteria.join("\n"),
      ].join("\n\n")
      let response:Response
      try{
        response=await request(parsed.href,{
          method:"POST",
          redirect:"error",
          signal:AbortSignal.timeout(45000),
          headers:{
            Authorization:"Bearer "+key,
            "Content-Type":"application/json",
            Accept:"application/json",
          },
          body:JSON.stringify({
            model,
            messages:[
              {role:"system",content:
                "Complete the user's requested analysis in text only. "+
                "Do not call tools, fetch websites or claim you did. "+
                "State uncertainty and distinguish unverified facts."},
              {role:"user",content},
            ],
            max_completion_tokens:1024,
          }),
        })
      }catch{throw Error("model_transport_unknown")}
      if(!response.ok)throw Error("model_response_rejected")
      let payload:unknown
      try{payload=await response.json()}catch{throw Error("model_response_invalid")}
      const data=payload as {choices?:{message?:{content?:unknown}}[]}
      const result=data?.choices?.[0]?.message?.content
      if(typeof result!=="string"||!result.trim()||result.length>12000)
        throw Error("model_output_invalid")
      return result
    },
  }
}
