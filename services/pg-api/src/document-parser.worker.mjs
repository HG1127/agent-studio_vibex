// PDF/DOCX parser CHILD PROCESS. Only IPC data, no user DB/JWT credentials;
// the parent enforces a timeout and terminates each child after parsing.
import {parseUploadedDocument} from "./document-parser.ts"

process.once("message",async raw=>{
  try{
    if(!raw||typeof raw!=="object"||Object.keys(raw).some(key=>!["input","profile"].includes(key)))throw Error("invalid_parser_message")
    const parsed=await parseUploadedDocument(raw.input,raw.profile)
    if(process.send)process.send({ok:true,parsed},()=>process.exit(0))
    else process.exit(1)
  }catch(error){
    const status=error&&typeof error.status==="number"?error.status:422
    const code=error&&typeof error.code==="string"?error.code:"document_parse_failed"
    if(process.send)process.send({ok:false,status,code},()=>process.exit(0))
    else process.exit(1)
  }
})
