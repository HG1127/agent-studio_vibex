import type {SqlClient} from "./contracts.ts"

// A migrated disabled employee can own strictly quarantined staging records
// only with a SAME-SNAPSHOT, reviewed v8_011 identity crosswalk. This grants
// NO authentication or active-user API access.
export async function isApprovedStageMigrationOwner(
  db:SqlClient, userId:string, sourceSha:string):Promise<boolean>{
  const user=await db.query<{status:string}>(
    "SELECT status FROM agentstudio.users WHERE id=$1::uuid",[userId])
  if(user.rows[0]?.status==="active")return true
  if(user.rows[0]?.status!=="disabled")return false
  const ready=await db.query<{ok:boolean}>(
    "SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations "+
    "WHERE version='pg_v8_011') AND "+
    "to_regclass('agentstudio.legacy_user_imports') IS NOT NULL AS ok")
  if(!ready.rows[0]?.ok)return false
  const match=await db.query<{id:string}>(
    "SELECT u.id FROM agentstudio.users AS u "+
    "JOIN agentstudio.legacy_user_imports AS m "+
    "ON m.target_user_id=u.id "+
    "WHERE u.id=$1::uuid AND u.status='disabled' "+
    "AND m.source_snapshot_sha256=$2::text "+
    "AND m.active_automatically=false AND "+
    "m.reviewed_mapping_sha256 ~ '^[0-9a-f]{64}$' AND "+
    "m.reviewed_idp_sha256 ~ '^[0-9a-f]{64}$'",
    [userId,sourceSha])
  return match.rows.length===1
}
