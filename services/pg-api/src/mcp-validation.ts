import {Worker} from "node:worker_threads"
import {createHash} from "node:crypto"
import {mcpTool,type McpTool} from "./mcp-catalog.ts"
const compiled=new Map<string,boolean>()
export async function validateMcpArguments(tool:McpTool,args?:Record<string,unknown>):Promise<boolean>{
  try{mcpTool({name:tool.name,inputSchema:tool.input_schema});if(args&&Buffer.byteLength(JSON.stringify(args))>12000)return false}
  catch{return false}
  const key=createHash("sha256").update(JSON.stringify(tool.input_schema)).digest("hex")
  if(args===undefined&&compiled.has(key))return compiled.get(key)!
  const valid=await new Promise<boolean>(resolve=>{
    const worker=new Worker(new URL("./mcp-validation-worker.mjs",import.meta.url),{workerData:{schema:tool.input_schema,...(args===undefined?{}:{args})},
      resourceLimits:{maxOldGenerationSizeMb:64,maxYoungGenerationSizeMb:16,stackSizeMb:4},execArgv:[]})
    let settled=false
    const finish=(valid:boolean)=>{if(settled)return;settled=true;clearTimeout(timer);void worker.terminate().catch(()=>{});resolve(valid)}
    const timer=setTimeout(()=>finish(false),1500)
    worker.once("message",value=>finish(value?.valid===true));worker.once("error",()=>finish(false));worker.once("exit",()=>finish(false))
  }).catch(()=>false)
  if(args===undefined){if(compiled.size>=128)compiled.delete(compiled.keys().next().value!);compiled.set(key,valid)}
  return valid
}
