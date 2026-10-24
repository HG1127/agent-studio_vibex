import test from "node:test"
import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {safeKnowledgeQueryRequest,QUERY_CHARGE_ACKNOWLEDGEMENT} from "../src/knowledge-query-contracts.ts"
import {selectNativePg18UatCapabilities,permitNativePg18BusinessUatRequest} from "../src/native-config-uat-policy.ts"

test("query request rejects caller-supplied credentials, malformed modes, partial consent and oversized text",()=>{
  const id=randomUUID(),base=randomUUID(),request={request_id:id,base_ids:[base],query:" evidence "}
  assert.deepEqual(safeKnowledgeQueryRequest({...request,base_ids:[base,base.toUpperCase()]}),{...request,base_ids:[base],query:"evidence",mode:"auto",limit:8})
  for(const patch of [{api_key:"forbidden"},{owner_id:id},{vector:[1,0]},{base_url:"https://example.test"},{mode:["auto"]},{mode:null},{mode:"semantic"},{mode:"hybrid"},
    {limit:9},{query:"x".repeat(301)},{query:"\ud800"},{query:"bad\0query"},{profile_id:id},{acknowledgement:QUERY_CHARGE_ACKNOWLEDGEMENT}])
    assert.throws(()=>safeKnowledgeQueryRequest({...request,...patch}),error=>error.status===400)
  const paid={...request,mode:"semantic",profile_id:id,profile_revision:1,consent_revision:1,acknowledgement:QUERY_CHARGE_ACKNOWLEDGEMENT}
  assert.equal(safeKnowledgeQueryRequest(paid).mode,"semantic")
  assert.throws(()=>safeKnowledgeQueryRequest({...paid,mode:"lexical"}),error=>error.status===400)
})

test("native query dispatch requires independent approval and metadata permissions but does not enable indexing",()=>{
  const metadata={AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:"true",AGENT_STUDIO_PG18_UAT_APPROVAL:"APPROVE_ISOLATED_PG18_CONFIG_UAT_ONLY",
    AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_ENABLED:"true",AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_KNOWLEDGE_SHARING_ONLY",
    AGENT_STUDIO_PG18_EMBEDDING_SETTINGS_UAT_ENABLED:"true",AGENT_STUDIO_PG18_EMBEDDING_SETTINGS_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_EMBEDDING_SETTINGS_ONLY",
    AGENT_STUDIO_PG18_EMBEDDING_CONSENT_UAT_ENABLED:"true",AGENT_STUDIO_PG18_EMBEDDING_CONSENT_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_EMBEDDING_CONSENT_NO_DISPATCH"}
  const origin="https://query.example.test",approved={...metadata,AGENT_STUDIO_PG18_KNOWLEDGE_QUERY_UAT_ENABLED:"true",AGENT_STUDIO_PG18_KNOWLEDGE_QUERY_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_READER_EMBEDDING_QUERY_UAT"}
  assert.equal(permitNativePg18BusinessUatRequest("/api/v2/knowledge-query/submit","POST",selectNativePg18UatCapabilities(metadata,true,origin,1001)),false)
  const selected=selectNativePg18UatCapabilities(approved,true,origin,1001)
  assert.equal(selected.knowledgeQueryRuntimeUat,true);assert.notEqual(selected.knowledgeIndexRuntimeUat,true)
  assert.equal(permitNativePg18BusinessUatRequest("/api/v2/knowledge-query/submit","POST",selected),true)
  for(const [listen,site,uid] of [[false,origin,1001],[true,"http://query.example.test",1001],[true,origin,0]])assert.throws(()=>selectNativePg18UatCapabilities(approved,listen,site,uid))
  assert.throws(()=>selectNativePg18UatCapabilities({...approved,AGENT_STUDIO_PG18_KNOWLEDGE_QUERY_UAT_APPROVED:"wrong"},true,origin,1001))
  assert.throws(()=>selectNativePg18UatCapabilities({...approved,AGENT_STUDIO_PG18_EMBEDDING_CONSENT_UAT_ENABLED:undefined,AGENT_STUDIO_PG18_EMBEDDING_CONSENT_UAT_APPROVED:undefined},true,origin,1001))
})
