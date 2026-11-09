// Named composite readers only. The unchanged Staff wrapper verifies the real
// composite ledger RPC's source/ACL/target before and after these catalog reads
// on its same repeatable-read client. Ordinary/default source SQL stays intact.
import {originalQuality089CatalogSQL as qualitySource} from './original-quality089-catalog-sql.mjs';
import {complete078Staff084CatalogSQL as staffSource,complete078StaffQuality089CatalogSQL as staffQualitySource} from './staff084-complete078-auth-catalog.mjs';
const once=(source,before,after)=>{if(typeof source!=='string'||source.split(before).length!==2)throw Error('staff084_named_ledger_SQL_source_refused');return source.replace(before,after)};
// NativeAuth lacks EXECUTE on the API-only078 RPC. Reuse the already protected
// composite RPC, which is independently source/ACL/physical-target checked.
export const originalQuality089CatalogSQL=once(qualitySource,'FROM agentstudio.employee_ui078_catalog_ledger()','FROM agentstudio.staff084_composite_ledger()');
// API cannot directly SELECT schema_migrations. The RPC deliberately exposes
// actual version/description only; no fabricated applied_at timestamp is added.
const from='FROM agentstudio.schema_migrations m',to='FROM (SELECT version,description FROM agentstudio.staff084_composite_ledger()) m';
export const complete078Staff084CatalogSQL=once(staffSource,from,to);
export const complete078StaffQuality089CatalogSQL=once(staffQualitySource,from,to);
