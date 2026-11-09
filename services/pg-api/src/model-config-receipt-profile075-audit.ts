import type {SqlClient} from './contracts.ts'
/** Additional075 shadows are rejected in every namespace. Existing exact075
 * table/column/function/ACL/RLS auditors still inspect the unmodified client. */
export const modelConfigReceiptGlobalInventory075Sql=`SELECT NOT EXISTS(
 SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE starts_with(c.relname,'model_config_write_receipts075') AND n.nspname<>'agentstudio'
 UNION ALL SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE (starts_with(t.typname,'model_config_write_receipts075') OR starts_with(t.typname,'_model_config_write_receipts075')) AND (n.nspname<>'agentstudio' OR t.typname NOT IN('model_config_write_receipts075','_model_config_write_receipts075'))
 UNION ALL SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE starts_with(p.proname,'model_config_receipt_') AND position('075' in p.proname)>0 AND n.nspname<>'agentstudio'
 UNION ALL SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace WHERE starts_with(c.conname,'model_config_write_receipts075') AND n.nspname<>'agentstudio'
 UNION ALL SELECT 1 FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE starts_with(p.polname,'model_config_write_receipts075') AND (n.nspname<>'agentstudio' OR c.relname<>'model_config_write_receipts075')
 UNION ALL SELECT 1 FROM pg_catalog.pg_trigger t WHERE NOT t.tgisinternal AND (starts_with(t.tgname,'model_config_write_receipts075') OR starts_with(t.tgname,'model_config_receipt_') AND position('075' in t.tgname)>0)
 UNION ALL SELECT 1 FROM pg_catalog.pg_event_trigger e WHERE starts_with(e.evtname,'model_config_write_receipts075') OR starts_with(e.evtname,'model_config_receipt_') AND position('075' in e.evtname)>0
 UNION ALL SELECT 1 FROM pg_catalog.pg_roles r WHERE starts_with(r.rolname,'agentstudio_model_config_receipt075') OR starts_with(r.rolname,'model_config_write_receipts075')
 UNION ALL SELECT 1 FROM pg_catalog.pg_namespace n WHERE starts_with(n.nspname,'model_config_write_receipts075') OR starts_with(n.nspname,'model_config_receipt_') AND position('075' in n.nspname)>0
) AS ok`
export async function verifyModelConfigReceiptGlobalInventory075(db:SqlClient):Promise<void>{const rows=(await db.query<{ok:boolean}>(modelConfigReceiptGlobalInventory075Sql)).rows;if(!Array.isArray(rows)||rows.length!==1||rows[0]?.ok!==true)throw Error('unsafe_model_config_receipt_global075')}
