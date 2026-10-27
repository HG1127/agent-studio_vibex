import {HttpError,isUuid,type Identity,type SqlPool} from "./contracts.ts"
import {withActor} from "./repository.ts"
import {safeKnowledgeQuery,type KnowledgeSearchHit,type KnowledgeDocumentRow} from "./knowledge-repository.ts"
import type {KnowledgeContentMetadata,KnowledgeContentReceipt} from "./knowledge-sharing-contracts.ts"
export type {KnowledgeContentMetadata,KnowledgeContentReceipt} from "./knowledge-sharing-contracts.ts"
function uuid(value:unknown){if(!isUuid(value))throw new HttpError(400,"invalid_knowledge_identifier");return value.toLowerCase()}
export function safeSharedKnowledgeText(raw:{filename:unknown;text:unknown}):{filename:string;text:string;mime_type:string}{
  const mime:Record<string,string>={txt:"text/plain",md:"text/markdown",markdown:"text/markdown",csv:"text/csv",tsv:"text/tab-separated-values",json:"application/json",html:"text/html",htm:"text/html"}
  if(typeof raw.filename!=="string"||typeof raw.text!=="string"||raw.filename.length>180||
    raw.filename.trim()!==raw.filename||raw.filename.startsWith(".")||/[/\\\x00-\x1f\x7f]/.test(raw.filename)||
    !raw.text.trim()||raw.text.includes("\0")||Array.from(raw.text).length>160000)throw new HttpError(400,"invalid_text_document")
  const type=mime[raw.filename.toLowerCase().split(".").at(-1)??""]
  if(typeof type!=="string")throw new HttpError(400,"unsupported_document_format")
  return {filename:raw.filename,text:raw.text,mime_type:type}
}
export class KnowledgeContentRepository {
  readonly pool:SqlPool
  constructor(pool:SqlPool){this.pool=pool}
  private async call<Row>(identity:Identity,sql:string,values:unknown[]):Promise<Row[]>{
    try{return await withActor(this.pool,identity,async db=>{
      await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='5s'")
      return (await db.query<Row>(sql,values)).rows
    })}catch(error){
      const e=error as {code?:string;message?:string},status:Record<string,number>={P0400:400,P0403:403,P0404:404,P0409:409,P0429:429}
      if(e.code&&status[e.code])throw new HttpError(status[e.code]!,/^[a-z_]{3,80}$/.test(e.message??"")?e.message!:"knowledge_content_failed")
      throw error
    }
  }
  async get(identity:Identity,base:string){
    const row=(await this.call<KnowledgeContentMetadata>(identity,"SELECT * FROM agentstudio.knowledge_content_metadata($1::uuid)",[uuid(base)]))[0]
    if(!row||!Number.isSafeInteger(Number(row.revision))||Number(row.revision)<1)throw Error("invalid_knowledge_content_metadata")
    return {...row,revision:Number(row.revision)}
  }
  documents(identity:Identity,base:string){return this.call<KnowledgeDocumentRow>(identity,"SELECT * FROM agentstudio.knowledge_content_documents($1::uuid)",[uuid(base)])}
  async search(identity:Identity,base:string,query:string,limit=8):Promise<KnowledgeSearchHit[]>{
    const term=safeKnowledgeQuery(query)
    if(!Number.isSafeInteger(limit)||limit<1||limit>10)throw new HttpError(400,"invalid_search_limit")
    return (await this.call<Omit<KnowledgeSearchHit,"citation">>(identity,"SELECT * FROM agentstudio.knowledge_content_search($1::uuid,$2::text,$3::integer)",[uuid(base),term,limit]))
      .map(row=>({...row,chunk_index:Number(row.chunk_index),citation:row.filename+"#chunk-"+row.chunk_index}))
  }
  async receipt(identity:Identity,base:string,request:string){
    return (await this.call<{result:KnowledgeContentReceipt|null}>(identity,"SELECT agentstudio.knowledge_content_receipt($1::uuid,$2::uuid) AS result",[uuid(base),uuid(request)]))[0]?.result??null
  }
  async importParsed(identity:Identity,base:string,request:string,input:{filename:string;mime_type:string;text:string}){
    if(!input||typeof input.filename!=="string"||typeof input.text!=="string"||typeof input.mime_type!=="string"||input.text.includes("\0"))
      throw new HttpError(400,"invalid_parsed_document")
    return (await this.call<{result:{item:KnowledgeContentReceipt;replayed:boolean}}>(identity,
      "SELECT agentstudio.knowledge_content_import($1::uuid,$2::uuid,$3::text,$4::text,$5::text) AS result",
      [uuid(base),uuid(request),input.filename,input.mime_type,input.text]))[0]!.result
  }
  async delete(identity:Identity,base:string,request:string,document:string,sha256:string){
    if(typeof sha256!=="string"||!/^[a-f0-9]{64}$/.test(sha256))throw new HttpError(400,"invalid_document_hash")
    return (await this.call<{result:{item:KnowledgeContentReceipt;replayed:boolean}}>(identity,
      "SELECT agentstudio.knowledge_content_delete($1::uuid,$2::uuid,$3::uuid,$4::text) AS result",
      [uuid(base),uuid(request),uuid(document),sha256]))[0]!.result
  }
}
