import {Worker} from "node:worker_threads"
import {createHash} from "node:crypto"
import {mcpTool,type McpTool} from "./mcp-catalog.ts"
export interface McpValidationWorker {
  on(event:"message",listener:(value:unknown)=>void):unknown
  once(event:"error"|"exit",listener:(value:unknown)=>void):unknown
  terminate():Promise<number>
}
type WorkerFactory=(data:{schema:Record<string,unknown>;args?:Record<string,unknown>})=>McpValidationWorker
export function createMcpArgumentValidator(startWorker:WorkerFactory=data=>new Worker(new URL("./mcp-validation-worker.mjs",import.meta.url),{
  workerData:data,resourceLimits:{maxOldGenerationSizeMb:64,maxYoungGenerationSizeMb:16,stackSizeMb:4},execArgv:[],
})){
  const compiled=new Map<string,boolean>()
  return async function validate(tool:McpTool,args?:Record<string,unknown>):Promise<boolean>{
    try{mcpTool({name:tool.name,inputSchema:tool.input_schema});if(args&&Buffer.byteLength(JSON.stringify(args))>12000)return false}
    catch{return false}
    const key=createHash("sha256").update(JSON.stringify(tool.input_schema)).digest("hex")
    if(args===undefined&&compiled.has(key))return compiled.get(key)!
    const outcome=await new Promise<{valid:boolean;completed:boolean}>(resolve=>{
      const worker=startWorker({schema:tool.input_schema,...(args===undefined?{}:{args})})
      let settled=false,ready=false
      const finish=(valid:boolean,completed=false)=>{if(settled)return;settled=true;clearTimeout(timer);void worker.terminate().catch(()=>{});resolve({valid,completed})}
      // Module loading has its own bounded startup time. Untrusted schema
      // compilation/regex evaluation still has exactly the original 1500ms.
      let timer=setTimeout(()=>finish(false),4000)
      worker.on("message",raw=>{
        if(!raw||typeof raw!=="object"||Array.isArray(raw)){finish(false);return}
        const value=raw as Record<string,unknown>
        if(value.type==="ready"&&Object.keys(value).length===1&&!ready){
          ready=true;clearTimeout(timer);timer=setTimeout(()=>finish(false),1500);return
        }
        if(ready&&value.type==="result"&&Object.keys(value).length===2&&typeof value.valid==="boolean")finish(value.valid,true)
        else finish(false)
      })
      worker.once("error",()=>finish(false));worker.once("exit",()=>finish(false))
    }).catch(()=>({valid:false,completed:false}))
    // Startup failures/timeouts must not poison the schema-only cache forever.
    if(args===undefined&&outcome.completed){if(compiled.size>=128)compiled.delete(compiled.keys().next().value!);compiled.set(key,outcome.valid)}
    return outcome.valid
  }
}
export const validateMcpArguments=createMcpArgumentValidator()
