// PGlite is PG17 with an embedded connection rather than an installed PG18
// TCP server. Only the TEST COPY drops exact environment guards. This does
// not modify the actual BaoTa migration SQL checked into db/postgres/.
const substitutions=[
  ["current_database() <> 'agent_studio'","FALSE"],
  ["current_setting('server_version_num')::int < 180000","FALSE"],
  ["current_setting('server_version_num')::int >= 190000","FALSE"],
  ["current_setting('port')::integer <> 5333","FALSE"],
  ["(SELECT extversion FROM pg_extension WHERE extname='vector') IS DISTINCT FROM '0.8.7'","FALSE"],
]
export function reviewedNativeSqlForEmbeddedTest(sql){
  let copy=sql
  for(const [before,after] of substitutions){
    if(!copy.includes(before)||copy.split(before).length!==2)
      throw Error("embedded_test_guard_changed")
    copy=copy.replace(before,after)
  }
  return copy
}
export async function prepareNativeAuthPgliteRoles(db){
  // The production PG18 fresh initializer already created these logins.
  // The baseline SQL reused by PGlite test fixtures intentionally did not.
  await db.exec([
    "CREATE ROLE agentstudio_stage_login LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;",
    "CREATE ROLE agentstudio_stage_worker LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;",
    "GRANT agentstudio_api TO agentstudio_stage_login;",
    "GRANT agentstudio_worker,agentstudio_api TO agentstudio_stage_worker;",
  ].join("\n"))
}
