// PDF/DOCX parser CHILD PROCESS. Only IPC data, no user DB/JWT credentials;
// the parent enforces a timeout and terminates each child after parsing.
import {parseUploadedDocument} from "./document-parser.ts"

process.once("message",async raw=>{
  try{
    const parsed=await parseUploadedDocument(raw)
    if(process.send)process.send({ok:true,parsed},()=>process.exit(0))
    else process.exit(1)
  }catch(error){
    const status=error&&typeof error.status==="number"?error.status:422
    const code=error&&typeof error.code==="string"?error.code:"document_parse_failed"
    if(process.send)process.send({ok:false,status,code},()=>process.exit(0))
    else process.exit(1)
  }
})
