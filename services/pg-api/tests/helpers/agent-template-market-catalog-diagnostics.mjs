// Failure-only test hook. Pure guard is the sole top-level dependency.
import {requireAgentTemplateMarketGenuineCi} from './agent-template-market-genuine-guard.mjs'
const active=new WeakSet()
const sourceSha='1f2c8edd622d4ade4f4198e0a7bd1c64e71be18944682b3b892fa37c87565e65'
export const validateAgentTemplateMarketDiagnosticContext=(env,platform,uid)=>requireAgentTemplateMarketGenuineCi(env,platform,uid)
export function isOriginalAgentTemplateMarketAuditRefusal(error){
  return error instanceof Error&&Object.getOwnPropertyDescriptor(error,'message')?.value==='unsafe_agent_template_market_privileges'
}
export function assertAgentTemplateMarketDiagnosticScope(db,env=process.env){
  requireAgentTemplateMarketGenuineCi(env)
  if(!active.has(db))throw Error('refuse_unconfirmed_agent_template_market_diagnostic')
}
// Pure observation primitives. Values are returned unchanged and every
// original operand is evaluated exactly once by its unchanged caller syntax.
export function createAgentTemplateMarketDiagnosticTrace(observe){
  const masks=new Map()
  return {
    reset(site,count){if(/^D063C[0-9]{3}$/.test(site)&&Number.isInteger(count)&&count>=1&&count<=64)masks.set(site,Array(count).fill('u'))},
    /** @template T @param {string} site @param {number} index @param {T} value @returns {T} */
    bit(site,index,value){const mask=masks.get(site);if(mask&&Number.isInteger(index)&&index>=0&&index<mask.length)mask[index]=value?'1':'0';return value},
    failureAt(site,condition){
      if(!/^D063F[0-9]{3}$/.test(site))return
      const mask=masks.get(condition)?.join('')??''
      try{observe(site,mask)}catch{/* Observation must not replace the original rejection. */}
    },
  }
}
const emit=(site,mask='')=>{
  if(!/^(?:D063F[0-9]{3}|D063_PROVENANCE|D063_CLIENT|D063_RECHECK|D063_OBSERVER)$/.test(site)||!/^[01u]{0,64}$/.test(mask))return
  process.stderr.write('F07_CATALOG_DIAGNOSTIC '+JSON.stringify({site,mask})+'\n')
}

/** Always throws the identical original object; never returns a permission. */
export async function rethrowAgentTemplateMarketAuditFailureWithDiagnostics(db,originalError,env=process.env){
  try{
    requireAgentTemplateMarketGenuineCi(env)
    if(!isOriginalAgentTemplateMarketAuditRefusal(originalError)||active.has(db))return
    const [pgModule,fs,crypto,audit]=await Promise.all([import('pg'),import('node:fs'),import('node:crypto'),import('../../src/agent-template-market-audit.ts')])
    const raw=fs.readFileSync(new URL('../../src/agent-template-market-audit-core.ts',import.meta.url))
    if(crypto.createHash('sha256').update(raw).digest('hex')!==sourceSha){emit('D063_PROVENANCE','0');return}
    const target=requireAgentTemplateMarketGenuineCi(env)
    if(!(db instanceof pgModule.default.Client)||db.connectionParameters.host!==target.host||Number(db.connectionParameters.port)!==target.port||db.connectionParameters.database!==target.database||db.connectionParameters.user===target.user||db.connection.stream.remoteAddress!==target.host||db.connection.stream.remotePort!==target.port){emit('D063_CLIENT','0');return}
    const rows=(await db.query("SELECT current_user='agentstudio_api' AND session_user=$1::text AND pg_backend_pid()=$2::integer AND current_database()=$3::text AND current_setting('server_version_num')::integer BETWEEN 180000 AND 189999 AS same_client",[db.connectionParameters.user,db.processID,target.database])).rows
    if(rows.length!==1||rows[0].same_client!==true){emit('D063_CLIENT','0');return}
    let confirmed=false
    try{await audit.verifyAgentTemplateMarketCredentials(db)}catch(error){confirmed=isOriginalAgentTemplateMarketAuditRefusal(error)}
    if(!confirmed){emit('D063_RECHECK','0');return}
    // Only a real original-client production refusal can activate this scope.
    // No fresh pool, actor transaction, role change, savepoint or commit.
    active.add(db)
    try{
      const diagnostic=await import('./agent-template-market-diagnostic-core.ts')
      await diagnostic.runAgentTemplateMarketDiagnosticCore(db,emit,env)
    }catch{/* No clone error text, SQL, catalog rows or acceptance result escapes. */}
    finally{active.delete(db)}
  }catch{/* Guard/import/transport/observer failures cannot replace originalError. */}
  finally{throw originalError}
}
