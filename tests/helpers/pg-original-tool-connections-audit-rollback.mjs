// Future hosted-only disposable fault. No role grants or repository substitutes.
export async function originalToolAuditRollbackProof(f,assert){
 const before=await f.toolCounts();let installed=false
 try{
  await f.db.exec("CREATE FUNCTION agentstudio.synthetic_original_tool_audit_refusal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target_kind='tool_connection' AND NEW.action='tool.connection_create' AND EXISTS(SELECT 1 FROM agentstudio.tool_connections WHERE id=NEW.target_id::uuid AND name='Synthetic original Tool audit rollback') THEN RAISE EXCEPTION 'synthetic_original_tool_audit_refusal'; END IF; RETURN NEW; END; $$; CREATE TRIGGER synthetic_original_tool_audit_refusal BEFORE INSERT ON agentstudio.audit_events FOR EACH ROW EXECUTE FUNCTION agentstudio.synthetic_original_tool_audit_refusal()")
  installed=true
  const result=await f.request('alice','/api/v2/tool-connections','POST',{name:'Synthetic original Tool audit rollback',description:'Disposable atomic audit failure only',url:'https://example.com/metadata-rollback',method:'GET',headers:[],body_template:'',timeout_s:15,enabled:true})
  assert.equal(result.status,503);assert.deepEqual(await f.toolCounts(),before)
  return Object.freeze({actual_Native_status:503,actual_owner_transaction_rolled_back:true,tool_and_audit_counts_unchanged:true,credential_input_absent:true,temporary_trigger_cleanup_required:true})
 }finally{if(installed)await f.db.exec('DROP TRIGGER synthetic_original_tool_audit_refusal ON agentstudio.audit_events; DROP FUNCTION agentstudio.synthetic_original_tool_audit_refusal()')}
}
