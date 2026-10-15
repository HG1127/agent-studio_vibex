// V8 PostgreSQL employee-owned knowledge base METADATA pilot.
// Never accesses document bodies, object storage keys or embeddings.
// Team sharing and ingestion are deliberately NOT enabled in this slice.
import {createHash,randomUUID} from "node:crypto"
import {HttpError,isUuid,type Identity,type SqlPool}
  from "./contracts.ts"
import {withActor} from "./repository.ts"


function hasControl(value:string):boolean {
  return Array.from(value).some(char=>char.charCodeAt(0)<32 || char.charCodeAt(0)===127)
}
export interface TextDocumentInput {
  filename:string
  text:string
}
export interface TextDocumentCreated {
  id:string
  filename:string
  sha256:string
  status:"indexed"
  chunk_count:number
}
export function safeTextDocumentInput(raw:unknown):TextDocumentInput {
  if(!raw || typeof raw!=="object" || Array.isArray(raw))
    throw new HttpError(400,"invalid_text_document")
  const body=raw as Record<string,unknown>
  if(Object.keys(body).some(key=>!["filename","text"].includes(key)))
    throw new HttpError(400,"unknown_request_field")
  if(typeof body.filename!=="string" || typeof body.text!=="string")
    throw new HttpError(400,"invalid_text_document")
  const filename=body.filename.trim()
  if(filename.length<5 || filename.length>120 || filename.startsWith(".") ||
    !/\.(txt|md)$/i.test(filename) || /[/\\]/.test(filename) || hasControl(filename))
    throw new HttpError(400,"invalid_text_filename")
  const text=body.text
  if(text.length<1 || text.length>12000 || !text.trim() ||
     text.includes("\u0000"))
    throw new HttpError(400,"invalid_text_content")
  return {filename,text}
}

export interface KnowledgeBaseRow {
  id:string
  owner_user_id:string
  name:string
  description:string
  visibility:"private"
  revision:number
  created_at:string
  updated_at:string
}
export interface KnowledgeDocumentRow {
  id:string
  filename:string
  mime_type:string
  status:string
  sha256:string
  created_at:string
}

export interface KnowledgeSearchHit {
  document_id:string
  filename:string
  chunk_index:number
  snippet:string
  citation:string
}
export function safeKnowledgeQuery(raw:unknown):string {
  if(typeof raw!=="string" || raw.length>160)throw new HttpError(400,"invalid_search_query")
  const query=raw.trim()
  if(query.length<2)throw new HttpError(400,"invalid_search_query")
  if(hasControl(query))throw new HttpError(400,"invalid_search_query")
  return query
}

export interface KnowledgeSemanticHit extends KnowledgeSearchHit {
  distance:number
}
function vectorLiteral(raw:readonly number[]):string {
  if(!Array.isArray(raw) || raw.length!==1536)
    throw new HttpError(400,"invalid_embedding_vector")
  let magnitude=0
  for(const value of raw){
    if(typeof value!=="number" || !Number.isFinite(value) ||
       Math.abs(value)>100)
      throw new HttpError(400,"invalid_embedding_vector")
    magnitude+=value*value
  }
  if(!Number.isFinite(magnitude) || magnitude===0)
    throw new HttpError(400,"invalid_embedding_vector")
  return "["+raw.join(",")+"]"
}
function safeEmbeddingModel(raw:unknown):string {
  if(typeof raw!=="string" || raw.length<1 || raw.length>120 ||
     !/^[A-Za-z0-9_./:-]+$/.test(raw))
    throw new HttpError(400,"invalid_embedding_model")
  return raw
}


const baseColumns="id,owner_user_id,name,description,visibility,revision,created_at,updated_at"
function normalized(row:KnowledgeBaseRow):KnowledgeBaseRow {
  const revision=Number(row.revision)
  if(!Number.isSafeInteger(revision)||revision<1)
    throw new Error("invalid_persisted_revision")
  if(row.visibility!=="private")
    throw new Error("unexpected_shared_knowledge_base")
  return {...row,revision}
}
export function safeDescription(raw:unknown):string {
  if(raw===undefined)return ""
  if(typeof raw!=="string" || raw.length>1000)
    throw new HttpError(400,"invalid_description")
  return raw.trim()
}
export class KnowledgeBaseRepository {
  readonly pool:SqlPool
  constructor(pool:SqlPool) {this.pool=pool}
  list(identity:Identity,limit=30):Promise<KnowledgeBaseRow[]> {
    const bounded=Math.max(1,Math.min(50,Math.trunc(limit)))
    return withActor(this.pool,identity,async(db,actor)=>{
      const result=await db.query<KnowledgeBaseRow>(
        "SELECT "+baseColumns+" FROM agentstudio.knowledge_bases "+
        "WHERE owner_user_id=$1::uuid AND visibility='private' "+
        "ORDER BY updated_at DESC,id LIMIT $2::int",[actor,bounded])
      return result.rows.map(normalized)
    })
  }
  get(identity:Identity,id:string):Promise<KnowledgeBaseRow|null> {
    if(!isUuid(id))throw new HttpError(400,"invalid_knowledge_base_id")
    return withActor(this.pool,identity,async(db,actor)=>{
      const result=await db.query<KnowledgeBaseRow>(
        "SELECT "+baseColumns+" FROM agentstudio.knowledge_bases "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND visibility='private'",
        [id,actor])
      return result.rows[0]?normalized(result.rows[0]):null
    })
  }
  create(identity:Identity,name:string,description:string):Promise<KnowledgeBaseRow> {
    return withActor(this.pool,identity,async(db,actor)=>{
      const result=await db.query<KnowledgeBaseRow>(
        "INSERT INTO agentstudio.knowledge_bases "+
        "(owner_user_id,name,description,visibility) "+
        "VALUES($1::uuid,$2::text,$3::text,'private') RETURNING "+baseColumns,
        [actor,name,description])
      if(!result.rows[0])throw new Error("insert_returned_no_rows")
      return normalized(result.rows[0])
    })
  }
  update(identity:Identity,id:string,name:string,description:string,revision:number):
    Promise<KnowledgeBaseRow|null> {
    if(!isUuid(id))throw new HttpError(400,"invalid_knowledge_base_id")
    if(!Number.isSafeInteger(revision)||revision<1)
      throw new HttpError(400,"invalid_revision")
    return withActor(this.pool,identity,async(db,actor)=>{
      const result=await db.query<KnowledgeBaseRow>(
        "UPDATE agentstudio.knowledge_bases SET "+
        "name=$3::text,description=$4::text,revision=revision+1,updated_at=now() "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND visibility='private' "+
        "AND revision=$5::bigint RETURNING "+baseColumns,
        [id,actor,name,description,revision])
      return result.rows[0]?normalized(result.rows[0]):null
    })
  }

  async searchKeyword(
    identity:Identity,id:string,query:string,limit=8,
  ):Promise<KnowledgeSearchHit[]|null> {
    if(!isUuid(id))throw new HttpError(400,"invalid_knowledge_base_id")
    const bounded=Math.max(1,Math.min(10,Math.trunc(limit)))
    return withActor(this.pool,identity,async(db,actor)=>{
      const base=await db.query<{id:string}>(
        "SELECT id FROM agentstudio.knowledge_bases "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND visibility='private'",
        [id,actor],
      )
      if(!base.rows[0])return null
      // Literal substring matching, not LIKE: '%' and '_' in the employee's
      // search phrase have no wildcard semantics. Do not select object_key,
      // embedding, or complete text_content in the response.
      const result=await db.query<Omit<KnowledgeSearchHit,"citation">>(
        "SELECT c.document_id,d.filename,c.chunk_index,"+
        "substring(c.text_content FROM "+
        "greatest(1,strpos(lower(c.text_content),lower($3::text))-120) FOR 360) "+
        "AS snippet "+
        "FROM agentstudio.knowledge_chunks AS c "+
        "JOIN agentstudio.knowledge_documents AS d "+
        "ON d.id=c.document_id AND d.owner_user_id=c.owner_user_id "+
        "WHERE d.base_id=$1::uuid AND c.owner_user_id=$2::uuid "+
        "AND d.owner_user_id=$2::uuid AND d.status='indexed' "+
        "AND strpos(lower(c.text_content),lower($3::text))>0 "+
        "ORDER BY d.created_at DESC,c.chunk_index,c.id LIMIT $4::int",
        [id,actor,query,bounded],
      )
      return result.rows.map(row=>({
        document_id:row.document_id,
        filename:row.filename,
        chunk_index:Number(row.chunk_index),
        snippet:row.snippet,
        citation:row.filename+"#chunk-"+String(row.chunk_index),
      }))
    })
  }


  // Internal repository method only; never bind it to a browser API until a
  // trusted server-side embedding provider and per-user quotas are configured.
  // The caller must obtain embeddings from an authorized model and must not
  // permit clients to select another person's resource or embedding provider.
  async searchByTrustedEmbedding(
    identity:Identity,id:string,embedding:readonly number[],model:string,limit=8,
  ):Promise<KnowledgeSemanticHit[]|null> {
    if(!isUuid(id))throw new HttpError(400,"invalid_knowledge_base_id")
    const value=vectorLiteral(embedding)
    const validatedModel=safeEmbeddingModel(model)
    const bounded=Math.max(1,Math.min(10,Math.trunc(limit)))
    return withActor(this.pool,identity,async(db,actor)=>{
      const owned=await db.query<{id:string}>(
        "SELECT id FROM agentstudio.knowledge_bases "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND visibility='private'",
        [id,actor],
      )
      if(!owned.rows[0])return null
      const result=await db.query<{
        document_id:string;filename:string;chunk_index:number
        snippet:string;distance:number
      }>(
        "SELECT c.document_id,d.filename,c.chunk_index,"+
        "substring(c.text_content FROM 1 FOR 360) AS snippet,"+
        "c.embedding <=> $3::vector AS distance "+
        "FROM agentstudio.knowledge_chunks AS c "+
        "JOIN agentstudio.knowledge_documents AS d "+
        "ON d.id=c.document_id AND d.owner_user_id=c.owner_user_id "+
        "WHERE d.base_id=$1::uuid AND c.owner_user_id=$2::uuid "+
        "AND d.owner_user_id=$2::uuid AND d.status='indexed' "+
        "AND c.embedding IS NOT NULL AND c.embedding_model=$4::text "+
        "ORDER BY distance ASC,c.id LIMIT $5::int",
        [id,actor,value,validatedModel,bounded],
      )
      return result.rows.map(row=>({
        document_id:row.document_id,
        filename:row.filename,
        chunk_index:Number(row.chunk_index),
        snippet:row.snippet,
        distance:Number(row.distance),
        citation:row.filename+"#chunk-"+String(row.chunk_index),
      }))
    })
  }


  async createTextDocument(
    identity:Identity,id:string,input:TextDocumentInput,
  ):Promise<TextDocumentCreated> {
    const safe=safeTextDocumentInput(input)
    const mime=safe.filename.toLowerCase().endsWith(".md")
      ?"text/markdown":"text/plain"
    return this.createParsedDocument(identity,id,{...safe,mime_type:mime})
  }

  // Only invoked with text parsed by the server's document-parser, never
  // with client-controlled MIME or arbitrary files. No raw binaries persist.
  async createParsedDocument(
    identity:Identity,id:string,
    source:{filename:string;text:string;mime_type:string},
  ):Promise<TextDocumentCreated> {
    if(!isUuid(id))throw new HttpError(400,"invalid_knowledge_base_id")
    const ext=source.filename.toLowerCase()
    const expected=ext.endsWith(".pdf")?"application/pdf":
      ext.endsWith(".docx")?"application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      ext.endsWith(".md")?"text/markdown":
      ext.endsWith(".txt")?"text/plain":null
    if(!expected || source.mime_type!==expected ||
       typeof source.text!=="string" || source.text.length===0 ||
       Array.from(source.text).length>12000 || source.text.includes("\u0000"))
      throw new HttpError(400,"invalid_parsed_document")
    const safe={filename:source.filename,text:source.text}
    const digest=createHash("sha256").update(safe.text,"utf8").digest("hex")
    const content=Array.from(safe.text)
    const chunks:string[]=[]
    for(let i=0;i<content.length;i+=800)chunks.push(content.slice(i,i+800).join(""))
    if(chunks.length>15)throw new HttpError(400,"invalid_text_content")
    const documentId=randomUUID()
    const mime=expected
    return withActor(this.pool,identity,async(db,actor)=>{
      const owned=await db.query<{id:string}>(
        "SELECT id FROM agentstudio.knowledge_bases "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND visibility='private'",
        [id,actor])
      if(!owned.rows[0])throw new HttpError(404,"knowledge_base_not_found")
      const duplicate=await db.query<{id:string}>(
        "SELECT id FROM agentstudio.knowledge_documents "+
        "WHERE base_id=$1::uuid AND owner_user_id=$2::uuid AND sha256=$3::text "+
        "AND status<>'deleted' LIMIT 1",
        [id,actor,digest])
      if(duplicate.rows[0])throw new HttpError(409,"duplicate_document")
      // Original uploaded file bytes are NOT stored. This sentinel denotes
      // text chunk storage inside PostgreSQL and is never exposed to clients.
      try{
        await db.query(
          "INSERT INTO agentstudio.knowledge_documents "+
          "(id,owner_user_id,base_id,filename,object_key,mime_type,sha256,status) "+
          "VALUES($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::text,$7::text,'indexed')",
          [documentId,actor,id,safe.filename,"inline-db:"+documentId,mime,digest])
        for(let i=0;i<chunks.length;i++){
          await db.query(
            "INSERT INTO agentstudio.knowledge_chunks "+
            "(owner_user_id,document_id,chunk_index,text_content) "+
            "VALUES($1::uuid,$2::uuid,$3::int,$4::text)",
            [actor,documentId,i,chunks[i]])
        }
      }catch(error){
        if((error as {code?:unknown})?.code==="23505")
          throw new HttpError(409,"duplicate_document")
        throw error
      }
      return {
        id:documentId,filename:safe.filename,sha256:digest,
        status:"indexed" as const,chunk_count:chunks.length,
      }
    })
  }

  async listDocuments(identity:Identity,id:string,limit=30):Promise<KnowledgeDocumentRow[]|null> {
    if(!isUuid(id))throw new HttpError(400,"invalid_knowledge_base_id")
    const bounded=Math.max(1,Math.min(50,Math.trunc(limit)))
    return withActor(this.pool,identity,async(db,actor)=>{
      // Make the distinction between empty KB and unauthorized KB explicit.
      const base=await db.query<{id:string}>(
        "SELECT id FROM agentstudio.knowledge_bases "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND visibility='private'",
        [id,actor])
      if(!base.rows[0])return null
      const docs=await db.query<KnowledgeDocumentRow>(
        "SELECT id,filename,mime_type,status,sha256,created_at "+
        "FROM agentstudio.knowledge_documents "+
        "WHERE base_id=$1::uuid AND owner_user_id=$2::uuid "+
        "AND status<>'deleted' ORDER BY created_at DESC,id LIMIT $3::int",
        [id,actor,bounded])
      // object_key and text_content are never selected or returned.
      return docs.rows
    })
  }
}
