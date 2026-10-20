// Strict "test database only" guard for real PostgreSQL 18 TCP CI.
// This module is pure: it never creates connections or reads secrets/files.
// Never pass a production DATABASE_URL or a BaoTa 127.0.0.1:5333 target.
export function requireEphemeralPg18Ci(env=process.env) {
  const runId=env.GITHUB_RUN_ID??""
  const password=env.AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD??""
  if(env.GITHUB_ACTIONS!=="true"||env.CI!=="true"||
     env.AGENT_STUDIO_PG18_CI_EPHEMERAL!=="true"||
     env.AGENT_STUDIO_PG18_CI_WRITE_APPROVED!=="YES_DISPOSABLE_GITHUB_ONLY"||
     !/^[0-9]{1,32}$/.test(runId)||
     env.AGENT_STUDIO_PG18_CI_HOST!=="127.0.0.1"||
     env.AGENT_STUDIO_PG18_CI_PORT!=="5432"||
     env.AGENT_STUDIO_PG18_CI_DATABASE!=="agentstudio_pg18_ci"||
     env.AGENT_STUDIO_PG18_CI_ADMIN_USER!=="agentstudio_admin"||
     password!=="synthetic-agentstudio-pg18-ci-"+runId||
     Object.keys(env).some(key=>key==="DATABASE_URL"||
       (/^PG[A-Z_]/.test(key)&&env[key]!==undefined)))
    throw Error("refuse_non_ephemeral_pg18_ci")
  return Object.freeze({
    host:"127.0.0.1",port:5432,database:"agentstudio_pg18_ci",
    user:"agentstudio_admin",password,
    max:4,connectionTimeoutMillis:5000,statement_timeout:15000
  })
}
