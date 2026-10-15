// V8 knowledge-base METADATA-only API with real PGlite PostgreSQL, RLS,
// and cryptographically signed employee JWTs. No files, S3, models, browsers,
// live PocketBase or network beyond the test's loopback-only HTTP listener.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import {createServer} from "node:http"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from "jose"
import {AgentSpecRepository} from "../src/repository.ts"
import {KnowledgeBaseRepository} from "../src/knowledge-repository.ts"
import {createHandler} from "../src/http.ts"
import {createJwtVerifier} from "../src/auth.ts"
import {PDFDocument,StandardFonts} from "pdf-lib"
import JSZip from "jszip"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const schema=fs.readFileSync(path.join(root,"db/postgres/001_stage_schema.sql"),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")

test("signed JWT + actual PostgreSQL RLS protects employee knowledge metadata",async()=>{
  const pg=await PGlite.create({extensions:{vector}})
  let server
  try {
    await pg.exec(schema)
    const issuer="https://id.internal-staging.invalid"
    const audience="agentstudio-test"
    const users={}
    for(const subject of ["A","B"]){
      const result=await pg.query(
        "INSERT INTO agentstudio.users(external_issuer,external_subject) "+
        "VALUES($1,$2) RETURNING id",[issuer,subject])
      users[subject]=result.rows[0].id
    }
    const pool={async connect(){return {
      async query(sql,params=[]){return pg.query(sql,params)},
      release(){},
    }}}
    const {publicKey,privateKey}=await generateKeyPair("RS256",{extractable:true})
    const jwk=await exportJWK(publicKey)
    jwk.alg="RS256";jwk.kid="kb-test"
    const verifyToken=createJwtVerifier({issuer,audience},
      createLocalJWKSet({keys:[jwk]}))
    const sign=sub=>new SignJWT({sub})
      .setProtectedHeader({alg:"RS256",kid:"kb-test"})
      .setIssuer(issuer).setAudience(audience).setIssuedAt()
      .setExpirationTime("10m").sign(privateKey)
    const aToken=await sign("A")
    const bToken=await sign("B")
    server=createServer(createHandler({
      repository:new AgentSpecRepository(pool),
      knowledgeRepository:new KnowledgeBaseRepository(pool),
      verifyToken,allowedOrigin:"https://intranet.test.invalid",
    }))
    await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve))
    const origin="http://127.0.0.1:"+server.address().port
    const call=async(method,url,token,body,extra={})=>{
      const response=await fetch(origin+url,{
        method,
        headers:{
          Accept:"application/json",
          ...(body===undefined?{}:{"Content-Type":"application/json"}),
          ...(token?{Authorization:"Bearer "+token}:{}),...extra,
        },
        ...(body===undefined?{}:{body:JSON.stringify(body)}),
        signal:AbortSignal.timeout(6500),
      })
      return {status:response.status,data:await response.json(),
        headers:response.headers}
    }
    const base="/api/v2/knowledge-bases"
    assert.equal((await call("GET",base,undefined,undefined,{"X-Rh-User-Id":"A"})).status,401)
    assert.deepEqual((await call("GET",base,aToken)).data.items,[])
    assert.equal((await call("GET",base+"?limit=1000",aToken)).status,400)
    const rejected=await call("POST",base,aToken,{
      name:"bad",description:"internal",team_id:users.B,
    })
    assert.equal(rejected.status,400)
    assert.equal(rejected.data.error,"unknown_request_field")
    assert.equal((await call("POST",base,aToken,{name:"invalid",description:"x".repeat(1001)})).status,400)
    const a=await call("POST",base,aToken,{
      name:"技术手册",description:"测试用元数据",
    })
    assert.equal(a.status,201,JSON.stringify(a.data))
    assert.equal(a.data.item.owner_user_id,users.A)
    assert.equal(a.data.item.visibility,"private")
    assert.equal(a.data.item.revision,1)
    const b=await call("POST",base,bToken,{name:"财务资料"})
    assert.equal(b.status,201)
    assert.equal(b.data.item.owner_user_id,users.B)

    const scoped=await call("GET",base,aToken,undefined,{"X-Rh-User-Id":"B"})
    assert.equal(scoped.status,200)
    assert.deepEqual(scoped.data.items.map(item=>item.id),[a.data.item.id])
    assert.equal(scoped.headers.get("access-control-allow-origin"),null)
    assert.equal((await call("GET",base+"/"+b.data.item.id,aToken)).status,404)
    assert.equal((await call("PATCH",base+"/"+b.data.item.id,aToken,
      {name:"unauthorized",expected_revision:1})).status,404)
    assert.equal((await call("GET",base+"/"+b.data.item.id+"/documents",aToken)).status,404)
    const stale=await call("PATCH",base+"/"+a.data.item.id,aToken,{
      name:"旧版本",expected_revision:99,
    })
    assert.equal(stale.status,409)
    const update=await call("PATCH",base+"/"+a.data.item.id,aToken,{
      name:"更新后的知识库",description:"仅供本人使用",expected_revision:1,
    })
    assert.equal(update.status,200)
    assert.equal(update.data.item.revision,2)
    assert.equal(update.data.item.name,"更新后的知识库")

    // Synthetic imported metadata is inserted by the test administrator only.
    // In the public API, no ability to write document bytes or object keys exists.
    const secretObjectKey="private-company-storage-do-not-leak"
    const document=await pg.query(
      "INSERT INTO agentstudio.knowledge_documents("+
      "owner_user_id,base_id,filename,object_key,mime_type,sha256,status) "+
      "VALUES($1,$2,'manual.pdf',$3,'application/pdf',$4,'indexed') RETURNING id",
      [users.A,a.data.item.id,secretObjectKey,"a".repeat(64)])
    assert.equal(document.rows.length,1)
    const docs=await call("GET",base+"/"+a.data.item.id+"/documents",aToken)
    assert.equal(docs.status,200)
    assert.equal(docs.data.scope,"metadata_only")
    assert.equal(docs.data.items.length,1)
    assert.equal(docs.data.items[0].filename,"manual.pdf")
    assert.doesNotMatch(JSON.stringify(docs.data),/private-company-storage|object_key|text_content|embedding/)
    const bDocs=await call("GET",base+"/"+a.data.item.id+"/documents",bToken)
    assert.equal(bDocs.status,404)
    assert.equal((await call("POST",base+"/"+a.data.item.id+"/documents",aToken,
      {filename:"unsanctioned.txt"})).status,405)
    // Literal-keyword citation retrieval from already-indexed synthetic chunks.
    // Result must never expose the full text, vector, or private object key.
    const aText="量子计算行业的发展路径："+("研究资料内容".repeat(100))+
      "HIDDEN_AFTER_400_CHARS_NOT_A_RESULT"
    await pg.query(
      "INSERT INTO agentstudio.knowledge_chunks("+
      "owner_user_id,document_id,chunk_index,text_content) "+
      "VALUES($1,$2,0,$3)",[users.A,document.rows[0].id,aText])
    const bSecretDoc=await pg.query(
      "INSERT INTO agentstudio.knowledge_documents("+
      "owner_user_id,base_id,filename,object_key,mime_type,sha256,status) "+
      "VALUES($1,$2,'secret.pdf','B-PRIVATE-STORAGE','application/pdf',$3,'indexed') RETURNING id",
      [users.B,b.data.item.id,"b".repeat(64)])
    await pg.query(
      "INSERT INTO agentstudio.knowledge_chunks("+
      "owner_user_id,document_id,chunk_index,text_content) "+
      "VALUES($1,$2,0,$3)",[users.B,bSecretDoc.rows[0].id,
        "量子计算与B部门信息 B_CONFIDENTIAL_DO_NOT_LEAK"])
    const pendingDoc=await pg.query(
      "INSERT INTO agentstudio.knowledge_documents("+
      "owner_user_id,base_id,filename,object_key,mime_type,sha256,status) "+
      "VALUES($1,$2,'pending.pdf','A-PENDING-STORAGE','application/pdf',$3,'pending') RETURNING id",
      [users.A,a.data.item.id,"c".repeat(64)])
    await pg.query(
      "INSERT INTO agentstudio.knowledge_chunks("+
      "owner_user_id,document_id,chunk_index,text_content) "+
      "VALUES($1,$2,0,$3)",[users.A,pendingDoc.rows[0].id,
        "量子计算 -- DO_NOT_RETURN_PENDING_DOC"])

    const searchPath=base+"/"+a.data.item.id+"/search"
    const hits=await call("POST",searchPath,aToken,{query:"量子计算",limit:4})
    assert.equal(hits.status,200,JSON.stringify(hits.data))
    assert.equal(hits.data.mode,"literal_keyword")
    assert.equal(hits.data.scope,"current_user")
    assert.equal(hits.data.indexed_only,true)
    assert.equal(hits.data.items.length,1)
    assert.equal(hits.data.items[0].document_id,document.rows[0].id)
    assert.equal(hits.data.items[0].citation,"manual.pdf#chunk-0")
    assert.ok(hits.data.items[0].snippet.includes("量子计算"))
    assert.ok(hits.data.items[0].snippet.length<=360)
    assert.doesNotMatch(JSON.stringify(hits.data),
      /HIDDEN_AFTER_400|B_CONFIDENTIAL|DO_NOT_RETURN_PENDING_DOC|object_key|embedding|private-company-storage/)
    assert.deepEqual((await call("POST",searchPath,aToken,{query:"%%"})).data.items,[])
    assert.deepEqual((await call("POST",searchPath,aToken,{query:"' OR 1=1 --"})).data.items,[])
    assert.equal((await call("POST",searchPath,aToken,{query:" "})).status,400)
    assert.equal((await call("POST",searchPath,aToken,{query:"量子计算",limit:100})).status,400)
    assert.equal((await call("POST",searchPath,aToken,{
      query:"量子计算",object_key:"forged",
    })).status,400)
    assert.equal((await call("POST",searchPath,bToken,{query:"量子计算"})).status,404)
    assert.equal((await call("POST",searchPath,undefined,{query:"量子计算"},
      {"X-Rh-User-Id":"A"})).status,401)
    const bResults=await call("POST",base+"/"+b.data.item.id+"/search",
      bToken,{query:"量子计算"})
    assert.equal(bResults.status,200)
    assert.equal(bResults.data.items.length,1)
    assert.equal(bResults.data.items[0].filename,"secret.pdf")
    assert.doesNotMatch(JSON.stringify(bResults.data),/manual\.pdf|A-PENDING-STORAGE/)



    // Server-only semantic retrieval contract. No browser API accepts vectors;
    // embeddings are synthetic and provided by an authorized internal test.
    const embedding=Array.from({length:1536},(_,i)=>i===0?1:0)
    const serialized="["+embedding.join(",")+"]"
    for(const item of [document.rows[0].id,bSecretDoc.rows[0].id,pendingDoc.rows[0].id]){
      await pg.query(
        "UPDATE agentstudio.knowledge_chunks "+
        "SET embedding=$1::vector,embedding_model='synthetic-1536' "+
        "WHERE document_id=$2",[serialized,item])
    }
    const repo=new KnowledgeBaseRepository(pool)
    const identityA={issuer,subject:"A"}
    const identityB={issuer,subject:"B"}
    await assert.rejects(
      repo.searchByTrustedEmbedding(identityA,a.data.item.id,[1,2],"synthetic-1536"),
      error=>error.code==="invalid_embedding_vector")
    await assert.rejects(
      repo.searchByTrustedEmbedding(identityA,a.data.item.id,
        embedding.map((v,i)=>i===3?NaN:v),"synthetic-1536"),
      error=>error.code==="invalid_embedding_vector")
    await assert.rejects(
      repo.searchByTrustedEmbedding(identityA,a.data.item.id,embedding,"invalid model;"),
      error=>error.code==="invalid_embedding_model")
    const semantic=await repo.searchByTrustedEmbedding(
      identityA,a.data.item.id,embedding,"synthetic-1536",5)
    assert.equal(semantic.length,1)
    assert.equal(semantic[0].filename,"manual.pdf")
    assert.equal(semantic[0].document_id,document.rows[0].id)
    assert.equal(semantic[0].distance,0)
    assert.equal(semantic[0].citation,"manual.pdf#chunk-0")
    assert.ok(semantic[0].snippet.length<=360)
    assert.doesNotMatch(JSON.stringify(semantic),
      /private-company-storage|object_key|embedding|HIDDEN_AFTER_400|B_CONFIDENTIAL|DO_NOT_RETURN_PENDING_DOC/)
    const otherSemantic=await repo.searchByTrustedEmbedding(
      identityB,b.data.item.id,embedding,"synthetic-1536",5)
    assert.equal(otherSemantic.length,1)
    assert.equal(otherSemantic[0].filename,"secret.pdf")
    assert.equal(await repo.searchByTrustedEmbedding(
      identityB,a.data.item.id,embedding,"synthetic-1536",5),null)
    assert.deepEqual(await repo.searchByTrustedEmbedding(
      identityA,a.data.item.id,embedding,"different-model",5),[])


    // Fully API-driven synthetic TXT ingestion: employee -> private KB ->
    // transactionally persisted chunks -> keyword search with citations.
    const importedText="知识库写入与检索闭环。"+("测试资料正文与来源引用。".repeat(190))
    const ingestionPath=base+"/"+a.data.item.id+"/text-documents"
    const invalidFile=await call("POST",ingestionPath,aToken,{
      filename:"../internal.txt",text:importedText,
    })
    assert.equal(invalidFile.status,400)
    assert.equal((await call("POST",ingestionPath,aToken,{
      filename:"script.exe",text:importedText,
    })).status,400)
    assert.equal((await call("POST",ingestionPath,aToken,{
      filename:"import.md",text:" ",
    })).status,400)
    assert.equal((await call("POST",ingestionPath,aToken,{
      filename:"import.md",text:importedText,owner_user_id:users.B,
    })).status,400)
    assert.equal((await call("POST",ingestionPath,bToken,{
      filename:"stolen.md",text:importedText,
    })).status,404)
    assert.equal((await call("GET",ingestionPath,aToken)).status,405)

    const imported=await call("POST",ingestionPath,aToken,{
      filename:"内部记录.md",text:importedText,
    })
    assert.equal(imported.status,201,JSON.stringify(imported.data))
    assert.equal(imported.data.scope,"private_keyword_only")
    assert.equal(imported.data.item.filename,"内部记录.md")
    assert.equal(imported.data.item.status,"indexed")
    assert.ok(imported.data.item.chunk_count>=2)
    assert.ok(imported.data.item.chunk_count<=15)
    assert.match(imported.data.item.sha256,/^[0-9a-f]{64}$/)
    assert.doesNotMatch(JSON.stringify(imported.data),
      /object_key|inline-db|text_content|embedding|测试资料正文/)
    const duplicates=await call("POST",ingestionPath,aToken,{
      filename:"相同内容的副本.txt",text:importedText,
    })
    assert.equal(duplicates.status,409)
    assert.equal(duplicates.data.error,"duplicate_document")
    const importedRows=await pg.query(
      "SELECT d.object_key,d.mime_type,d.status,"+
      "(SELECT count(*)::int FROM agentstudio.knowledge_chunks c "+
      "WHERE c.document_id=d.id) AS count "+
      "FROM agentstudio.knowledge_documents d WHERE d.id=$1",
      [imported.data.item.id])
    assert.equal(importedRows.rows[0].mime_type,"text/markdown")
    assert.match(importedRows.rows[0].object_key,/^inline-db:/)
    assert.equal(importedRows.rows[0].count,imported.data.item.chunk_count)
    const importedSearch=await call("POST",searchPath,aToken,{
      query:"知识库写入",limit:3,
    })
    assert.equal(importedSearch.status,200,JSON.stringify(importedSearch.data))
    assert.equal(importedSearch.data.items.length,1)
    assert.equal(importedSearch.data.items[0].filename,"内部记录.md")
    assert.equal(importedSearch.data.items[0].citation,"内部记录.md#chunk-0")
    assert.ok(importedSearch.data.items[0].snippet.includes("知识库写入"))
    assert.doesNotMatch(JSON.stringify(importedSearch.data),/inline-db|object_key|embedding/)
    const docsAfter=await call("GET",base+"/"+a.data.item.id+"/documents",aToken)
    assert.equal(docsAfter.status,200)
    assert.equal(docsAfter.data.items.length,3)
    assert.ok(docsAfter.data.items.some(item=>item.id===imported.data.item.id))
    assert.doesNotMatch(JSON.stringify(docsAfter.data),/inline-db|object_key|text_content/)


    // Real PDF and DOCX uploaded as bounded base64 bytes, parsed server-side,
    // indexed inside the owner transaction, and retrievable only by that user.
    const pdf=await PDFDocument.create()
    const pdfPage=pdf.addPage([420,290])
    const pdfFont=await pdf.embedFont(StandardFonts.Helvetica)
    pdfPage.drawText("Standalone PDF analyst evidence",{
      x:40,y:210,font:pdfFont,size:13,
    })
    const pdfBase64=Buffer.from(await pdf.save()).toString("base64")
    const filesPath=base+"/"+a.data.item.id+"/document-files"
    assert.equal((await call("GET",filesPath,aToken)).status,405)
    for(const endpoint of [
      searchPath,ingestionPath,filesPath,base+"/"+a.data.item.id+"/documents",
    ]){
      assert.equal((await call("PATCH",endpoint,aToken,{
        name:"illegal",description:"do not modify via action routes",
        expected_revision:2,
      })).status,405,"PATCH must never be accepted at "+endpoint)
    }

    assert.equal((await call("POST",filesPath,bToken,{
      filename:"private.pdf",content_base64:pdfBase64,
    })).status,404)
    const pdfImported=await call("POST",filesPath,aToken,{
      filename:"equity-report.pdf",content_base64:pdfBase64,
    })
    assert.equal(pdfImported.status,201,JSON.stringify(pdfImported.data))
    assert.equal(pdfImported.data.item.filename,"equity-report.pdf")
    assert.ok(pdfImported.data.item.chunk_count>=1)
    const pdfSearch=await call("POST",searchPath,aToken,{query:"analyst evidence"})
    assert.equal(pdfSearch.status,200)
    assert.equal(pdfSearch.data.items.length,1)
    assert.equal(pdfSearch.data.items[0].filename,"equity-report.pdf")
    assert.match(pdfSearch.data.items[0].snippet,/PDF 第1页/)
    assert.match(pdfSearch.data.items[0].citation,/equity-report.pdf#chunk-0/)
    assert.equal((await call("POST",filesPath,aToken,{
      filename:"again.pdf",content_base64:pdfBase64,
    })).status,409)

    const docxZip=new JSZip()
    docxZip.file("[Content_Types].xml",
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
      '<Default Extension="xml" ContentType="application/xml"/>'+
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    docxZip.file("_rels/.rels",
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    docxZip.file("word/document.xml",
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'+
      '<w:body><w:p><w:r><w:t>Standalone DOCX market evidence</w:t></w:r></w:p></w:body></w:document>')
    const docxBytes=await docxZip.generateAsync({type:"nodebuffer",compression:"DEFLATE"})
    const docxImported=await call("POST",filesPath,aToken,{
      filename:"research.docx",content_base64:docxBytes.toString("base64"),
    })
    assert.equal(docxImported.status,201,JSON.stringify(docxImported.data))
    const docxSearch=await call("POST",searchPath,aToken,{query:"market evidence"})
    assert.equal(docxSearch.status,200)
    assert.equal(docxSearch.data.items.length,1)
    assert.equal(docxSearch.data.items[0].filename,"research.docx")
    const docsWithFiles=await call("GET",base+"/"+a.data.item.id+"/documents",aToken)
    assert.equal(docsWithFiles.status,200)
    assert.ok(docsWithFiles.data.items.some(item=>item.mime_type==="application/pdf"))
    assert.ok(docsWithFiles.data.items.some(item=>
      item.mime_type==="application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
    assert.doesNotMatch(JSON.stringify(docsWithFiles.data),/inline-db|object_key|text_content|embedding/)
    assert.equal((await call("POST",filesPath,aToken,{
      filename:"evil.exe",content_base64:pdfBase64,
    })).status,400)
    assert.equal((await call("POST",filesPath,aToken,{
      filename:"broken.pdf",content_base64:Buffer.from("not a pdf").toString("base64"),
    })).status,422)
    assert.equal((await call("POST",filesPath,aToken,{
      filename:"massive.pdf",content_base64:Buffer.alloc(580000).toString("base64"),
    })).status,413)

    // Database defense-in-depth still blocks cross-owner queries if a future
    // repository accidentally omits the explicit owner filter.
    await pg.exec("BEGIN")
    try {
      await pg.exec("SET LOCAL ROLE agentstudio_api")
      await pg.query("SELECT set_config('agentstudio.actor_id',$1,true)",[users.B])
      const visibility=await pg.query("SELECT name FROM agentstudio.knowledge_bases")
      assert.deepEqual(visibility.rows.map(item=>item.name),["财务资料"])
      const ownDocs=await pg.query("SELECT filename FROM agentstudio.knowledge_documents")
      assert.deepEqual(ownDocs.rows.map(x=>x.filename),["secret.pdf"])
    }finally{await pg.exec("ROLLBACK")}
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve))
    await pg.close()
  }
})
