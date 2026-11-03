// Import-safe, new-purpose hosted SQL admission. No file, SQL or Pool access.
export const originalRoleAbSqlCiPurpose='YES_DISPOSABLE_ORIGINAL_ROLE_AB_SQL_ONLY'
export const originalRoleAbSqlCiProfile='original-role-ab-sql-v1'
export function requireOriginalRoleAbSqlCi(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 const run=env.GITHUB_RUN_ID,attempt=env.GITHUB_RUN_ATTEMPT,head=env.GITHUB_SHA,ref=env.GITHUB_REF,repository=env.GITHUB_REPOSITORY
 if(platform!=='linux'||!Number.isSafeInteger(uid)||uid<=0||process.versions.node.split('.')[0]!=='24'||env.GITHUB_ACTIONS!=='true'||env.CI!=='true'||
    env.GITHUB_JOB!=='pg18-original-role-ab-sql'||!['push','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)||
    !/^[1-9][0-9]{0,19}$/.test(run??'')||!/^[1-9][0-9]{0,5}$/.test(attempt??'')||!/^[a-f0-9]{40}$/.test(head??'')||
    !/^refs\/heads\/codex\/pg18-worker-heartbeat-[A-Za-z0-9._-]+$/.test(ref??'')||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository??'')||
    env.GITHUB_WORKFLOW_REF!==repository+'/.github/workflows/pg18-original-role-ab-sql-ci.yml@'+ref||
    env.AGENT_STUDIO_ORIGINAL_ROLE_AB_SQL_CI!==originalRoleAbSqlCiPurpose||env.AGENT_STUDIO_ORIGINAL_ROLE_AB_SQL_PROFILE!==originalRoleAbSqlCiProfile||
    env.AGENT_STUDIO_ORIGINAL_ROLE_AB_SQL_EXPECTED_HEAD!==head||!/^[a-f0-9]{64}$/.test(env.AGENT_STUDIO_ORIGINAL_ROLE_AB_SQL_SOURCES_SHA256??'')||
    env.AGENT_STUDIO_PG18_CI_EPHEMERAL!=='true'||env.AGENT_STUDIO_PG18_CI_WRITE_APPROVED!=='YES_DISPOSABLE_GITHUB_ONLY'||
    env.AGENT_STUDIO_PG18_CI_HOST!=='127.0.0.1'||env.AGENT_STUDIO_PG18_CI_PORT!=='5333'||env.AGENT_STUDIO_PG18_CI_DATABASE!=='agent_studio'||env.AGENT_STUDIO_PG18_CI_ADMIN_USER!=='postgres'||
    env.AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD!=='synthetic-role-ab-'+run+'-'+attempt+'-only'||
    Object.keys(env).some(k=>(/^PG[A-Z_]/.test(k)||k==='DATABASE_URL')&&env[k]!==undefined)||
    ['AGENT_STUDIO_FINAL13_PATH_CI_PURPOSE','AGENT_STUDIO_COMPANION_CI_PURPOSE','AGENT_STUDIO_PLAN_WORKFLOW_PAIR_CI_PURPOSE','AGENT_STUDIO_F27_GENUINE_SUITE','AGENT_STUDIO_ORIGINAL_HOME070_CI'].some(k=>env[k]!==undefined))throw Error('original_role_ab_sql_ci_admission_refused')
 return Object.freeze({profile:originalRoleAbSqlCiProfile,run,attempt,head,host:'127.0.0.1',port:5333,database:'agent_studio',admin:'postgres',sources_sha256:env.AGENT_STUDIO_ORIGINAL_ROLE_AB_SQL_SOURCES_SHA256,synthetic_only:true,provider_execution:false,production_GO:false})
}
