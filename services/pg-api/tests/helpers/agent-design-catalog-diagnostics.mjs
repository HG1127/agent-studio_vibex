// Test-only facts; never a product permission result. Original f.audit remains.
import {requireAgentDesignDatabaseCi} from './agent-design-database-ci.mjs'

export async function diagnoseAgentDesignFixture(f,env=process.env){
  const target=requireAgentDesignDatabaseCi(env)
  const [assertModule,pgModule,repository,core,company,descriptive,generated]=await Promise.all([
    import('node:assert/strict'),import('pg'),import('../../src/repository.ts'),
    import('./agent-design-diagnostic-core.ts'),import('./agent-design-diagnostic-company.ts'),import('./agent-design-diagnostic-descriptive.ts'),import('../../src/agent-generated-audit.ts')])
  const assert=assertModule.default,pg=pgModule.default,observations=[]
  const onClient=async(db,kind,expectedLogin,expectedRole)=>{
    assert.ok(db instanceof pg.Client);assert.equal(db.connectionParameters.host,target.host);assert.equal(Number(db.connectionParameters.port),5432);assert.equal(db.connectionParameters.database,target.database)
    assert.equal(db.connection.stream.remoteAddress,'127.0.0.1');assert.equal(db.connection.stream.remotePort,5432)
    const who=(await db.query('SELECT session_user AS login,current_user AS role,pg_backend_pid() AS pid')).rows[0]
    assert.equal(who.login,expectedLogin);assert.equal(who.role,expectedRole);assert.equal(who.pid,db.processID)
    for(const [stage,run] of [['core062',core.runDiagnosticCore],['company061',company.runDiagnosticCore],['descriptive060',descriptive.runDiagnosticCore],['generated059_chain',generated.verifyAgentGeneratedCredentials],['original062_wrapper',f.audit]]){
      await db.query('SAVEPOINT f01_catalog_diagnostic')
      try{
        const value=await run(db)
        observations.push({principal:kind,stage,result:value===true?'true':value===false?'false':'unexpected-result'})
      }catch(error){
        const predicates=Array.isArray(error.diagnostic_predicates)&&error.diagnostic_predicates.every(v=>typeof v==='boolean')?error.diagnostic_predicates:[]
        const context=error.diagnostic_context&&Object.getPrototypeOf(error.diagnostic_context)===Object.prototype?Object.fromEntries(Object.entries(error.diagnostic_context).filter(([k,v])=>['actual','relation','f','c','field'].includes(k)&&typeof v==='string'&&v.length<140)):{}
        observations.push({principal:kind,stage,result:'rejected',site:typeof error.diagnostic_site==='string'?error.diagnostic_site:'original-query-or-wrapper',predicates,context,code:typeof error.code==='string'&&/^[0-9A-Z]{5}$/.test(error.code)?error.code:null,message:typeof error.message==='string'?error.message.slice(0,180):'non-Error failure'})
      }finally{await db.query('ROLLBACK TO SAVEPOINT f01_catalog_diagnostic');await db.query('RELEASE SAVEPOINT f01_catalog_diagnostic')}
    }
  }
  const identity=await f.identityFor('alice')
  await repository.withActor(f.pool,identity,db=>onClient(db,'api','synthetic_assessment_api','agentstudio_api'))
  for(const [kind,role,login,pool] of [['worker','agentstudio_design_worker','synthetic_design_worker',f.workerPool],['dispatch','agentstudio_design_dispatch','synthetic_design_dispatch',f.dispatchPool]]){
    const db=await pool.connect();let begun=false
    try{await db.query('BEGIN READ ONLY');begun=true;await db.query('SET LOCAL ROLE '+role);await onClient(db,kind,login,role)}
    finally{try{if(begun)await db.query('ROLLBACK')}finally{db.release()}}
  }
  // No catalog row bodies, ACL rows, credentials, identities, source content,
  // owner IDs or SQL source are logged. The source manifest maps static sites.
  return {format:'F01_actual_catalog_diagnostic_observations_v1',observations,authorizes_product:false,mutations:false}
}
