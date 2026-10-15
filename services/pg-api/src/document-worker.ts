// Untrusted PDF/DOCX parsing occurs in a bounded CHILD PROCESS, not in the
// HTTP event loop. This is process isolation, NOT an OS-level sandbox.
import {fork, type ChildProcess} from "node:child_process"
import {fileURLToPath} from "node:url"
import {HttpError} from "./contracts.ts"
import type {ParsedDocument} from "./document-parser.ts"

const MAX_ACTIVE_PARSERS=2
let activeParsers=0
const parserPath=fileURLToPath(new URL("./document-parser.worker.mjs",import.meta.url))
const allowedMimes=new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
])
export function parserProcessCount():number {return activeParsers}

export async function parseDocumentIsolated(
  raw:unknown,timeoutMs=12000,
):Promise<ParsedDocument> {
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>12000)
    throw new Error("invalid_parser_timeout")
  if(!raw||typeof raw!=="object"||Array.isArray(raw))
    throw new HttpError(400,"invalid_document_request")
  const input=raw as Record<string,unknown>
  if(typeof input.content_base64!=="string"||
     input.content_base64.length>720000)
    throw new HttpError(400,"invalid_document_base64")
  if(activeParsers>=MAX_ACTIVE_PARSERS)
    throw new HttpError(429,"document_parser_busy")
  activeParsers++
  return new Promise<ParsedDocument>((resolve,reject)=>{
    let child:ChildProcess|undefined
    let done=false
    let slotReleased=false
    let timer:ReturnType<typeof setTimeout>|undefined
    const release=()=>{
      if(slotReleased)return
      slotReleased=true
      activeParsers=Math.max(0,activeParsers-1)
    }
    const finish=(error?:Error,parsed?:ParsedDocument)=>{
      if(done)return
      done=true
      if(timer)clearTimeout(timer)
      if(child&&!child.killed&&child.exitCode===null){
        try{child.kill("SIGKILL")}catch{release()}
      }else release()
      if(error)reject(error)
      else if(parsed)resolve(parsed)
      else reject(new HttpError(422,"document_parse_failed"))
    }
    try{
      child=fork(parserPath,[],{
        execPath:process.execPath,
        execArgv:["--experimental-strip-types","--max-old-space-size=256"],
        // Do not forward database credentials, model secrets, or OIDC config.
        env:{
          NODE_ENV:"production",
          ...(process.platform==="win32"?
            {SystemRoot:process.env.SystemRoot||"C:\\Windows"}:{}),
        },
        windowsHide:true,
        stdio:["ignore","ignore","ignore","ipc"],
      })
      child.once("close",release)
      child.once("error",()=>finish(new HttpError(422,"document_parse_failed")))
      child.once("exit",()=>finish(new HttpError(422,"document_parse_failed")))
      child.once("message",(message:unknown)=>{
        if(!message||typeof message!=="object")
          return finish(new HttpError(422,"document_parse_failed"))
        const result=message as {
          ok?:boolean;status?:number;code?:string;parsed?:ParsedDocument
        }
        if(result.ok===true){
          const parsed=result.parsed
          if(!parsed||typeof parsed.filename!=="string"||
             parsed.filename.length>120||typeof parsed.text!=="string"||
             Array.from(parsed.text).length>12000||
             !allowedMimes.has(parsed.mime_type))
            return finish(new HttpError(422,"document_parse_failed"))
          return finish(undefined,parsed)
        }
        const status=[400,413,422].includes(Number(result.status))
          ?Number(result.status):422
        const code=typeof result.code==="string"&&
          /^[a-z_]{1,80}$/.test(result.code)
          ?result.code:"document_parse_failed"
        finish(new HttpError(status,code))
      })
      timer=setTimeout(()=>{
        finish(new HttpError(422,"document_parse_timeout"))
      },timeoutMs)
      child.send(raw,error=>{
        if(error)finish(new HttpError(422,"document_parse_failed"))
      })
    }catch{
      finish(new HttpError(422,"document_parse_failed"))
      release()
    }
  })
}
