import assert from 'node:assert/strict'
// Called only by the genuine independently admitted owned PG fixture. These
// are real persisted untested connections; no probe/discovery DTO is invented.
export async function verifyOriginalHomeOwnedResources(f){
 const [{ToolConnectionRepository},{McpConnectionRepository},{KnowledgeBaseRepository}]=await Promise.all([import('../../src/tool-connection-repository.ts'),import('../../src/mcp-connection-repository.ts'),import('../../src/knowledge-repository.ts')])
 const tools=new ToolConnectionRepository(f.pool,f.key),mcp=new McpConnectionRepository(f.pool,f.key),knowledge=new KnowledgeBaseRepository(f.pool),created={}
 for(const who of ['alice','bob']){
  const identity=await f.identityFor(who)
  const http=await tools.create(identity,{name:'Home owned HTTP '+who,description:'Actual untested fixture connection',url:'https://example.com/never-output-home-'+who,method:'GET',headers:[{key:'X-Home-Fixture',value:'header-value-never-output'}],body_template:'',timeout_s:5,enabled:true})
  const connection=await mcp.create(identity,{name:'Home owned MCP '+who,description:'Actual untested MCP fixture',url:'https://example.com/never-output-mcp-'+who,headers:[{key:'X-Home-Fixture',value:'mcp-header-never-output'}],enabled:true})
  const base=await knowledge.create(identity,'Home owned KB '+who,'Actual stored knowledge metadata')
  await knowledge.createTextDocument(identity,base.id,{filename:'home-owned-one.txt',text:'body-never-output-'+who+' '+('知识😀'.repeat(700))})
  await knowledge.createTextDocument(identity,base.id,{filename:'home-owned-two.md',text:'second-body-never-output-'+who+' '+('metadata fixture '.repeat(80))})
  const actual=(await f.db.query("SELECT b.id,b.owner_user_id,b.created_at,b.updated_at,(SELECT count(*)::integer FROM agentstudio.knowledge_documents d WHERE d.base_id=b.id AND d.owner_user_id=b.owner_user_id AND d.status<>'deleted') AS documents,(SELECT count(*)::integer FROM agentstudio.knowledge_chunks c JOIN agentstudio.knowledge_documents d ON d.id=c.document_id AND d.owner_user_id=c.owner_user_id WHERE d.base_id=b.id AND d.owner_user_id=b.owner_user_id AND d.status<>'deleted') AS chunks FROM agentstudio.knowledge_bases b WHERE b.id=$1 AND b.owner_user_id=$2",[base.id,f.users[who]])).rows[0]
  assert.equal(actual.documents,2);assert(actual.chunks>2);created[who]={http,connection,base,actual}
 }
 const counts=async()=> (await f.db.query('SELECT (SELECT count(*)::integer FROM agentstudio.tool_connections) AS http,(SELECT count(*)::integer FROM agentstudio.mcp_connections) AS mcp,(SELECT count(*)::integer FROM agentstudio.knowledge_bases) AS bases,(SELECT count(*)::integer FROM agentstudio.knowledge_documents) AS documents,(SELECT count(*)::integer FROM agentstudio.knowledge_chunks) AS chunks,(SELECT count(*)::integer FROM agentstudio.audit_events) AS audits')).rows[0]
 const before=await counts()
 for(const who of ['alice','bob']){
  const other=who==='alice'?'bob':'alice',response=await f.raw('/api/v2/original-ui/home-resources',{who})
  assert.equal(response.status,200);const value=response.body,expected=created[who]
  assert.equal(value.format,'agentstudio.original-home-resources.v1');assert.equal(value.employee_id,f.users[who]);assert.equal(value.knowledge_sharing_enabled,true)
  assert(value.http_connections.every(row=>row.owner_user_id===f.users[who]));assert(value.mcp_connections.every(row=>row.owner_user_id===f.users[who]))
  const http=value.http_connections.find(row=>row.id===expected.http.id),connection=value.mcp_connections.find(row=>row.id===expected.connection.id),base=value.knowledge_bases.find(row=>row.id===expected.base.id)
  assert(http&&connection&&base);assert.equal(http.revision,expected.http.revision);assert.equal(http.status,'untested');assert.equal(http.binding,null)
  assert.equal(connection.revision,expected.connection.revision);assert.equal(connection.status,'untested');assert.equal(connection.catalog_sha256,null);assert.deepEqual(connection.tools,[])
  assert.equal(base.access_role,'owner');assert.equal(base.owner_user_id,f.users[who]);assert.equal(base.document_count,expected.actual.documents);assert.equal(base.chunk_count,expected.actual.chunks);assert.equal(base.created_at,new Date(expected.actual.created_at).toISOString());assert.equal(base.updated_at,new Date(expected.actual.updated_at).toISOString())
  assert(!value.http_connections.some(row=>row.id===created[other].http.id));assert(!value.mcp_connections.some(row=>row.id===created[other].connection.id));assert(!value.knowledge_bases.some(row=>row.id===created[other].base.id))
  const encoded=JSON.stringify(value);for(const hidden of ['never-output-home-','never-output-mcp-','header-value-never-output','mcp-header-never-output','body-never-output','input_schema','object_key','text_content'])assert(!encoded.includes(hidden))
 }
 assert.deepEqual(await counts(),before);assert.equal(f.providerRequests.length,0)
 return {case:'owned_home_resources_real_counts_and_untested_connections',actual_HTTPS:true,actual_PG_counts:true,probe_or_discovery_performed:false,shared_statistics_claimed:false,production_GO:false}
}
