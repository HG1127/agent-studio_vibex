import {requireOriginalVersionReleaseCi} from './pg-original-version-release-browser-guard.mjs'
import {originalLoginReviewedSources} from './pg-original-login-reviewed-sources.mjs'
import {originalVersionReleasePath} from './pg-original-version-release-browser-policy.mjs'
export const originalVersionReleaseRequiredSources=Object.freeze([
 "shared/original-version-release-contract.ts",
 "package.json",
 "src/pages/VersionRelease/useVersionRelease.ts",
 "src/pages/VersionRelease/usePgVersionRelease.ts",
 "ops/original-version-release-page-actions.json",
 "ops/build-pg18-native-api-preflight-bundle.mjs",
 "src/lib/originalVersionReleaseIdentity.ts",
 "src/lib/originalVersionReleaseData.ts",
 "src/lib/originalVersionReleaseApi.ts",
 "src/lib/originalVersionRelease.ts",
 "tests/helpers/original-version-release-terminal-data.mjs",
 "src/components/version-release/VrDiffPanel.tsx",
 "services/pg-api/src/original-version-release-http.ts",
 "services/pg-api/src/http.ts",
 "services/pg-api/src/agent-release-repository.ts",
 "tests/original-version-release-source.test.mjs",
 "tests/original-version-release-model-refresh.test.mjs",
 "tests/original-version-release-identity-hook.test.mjs",
 "tests/original-version-release-api.test.mjs",
 "tests/original-version-release-auth-regression.test.mjs",
 "tests/original-version-release-data.test.mjs",
 "tests/original-version-release-controller.test.mjs",
 "tests/original-release-schedules-native-admission.test.mjs",
 "src/pages/VersionRelease/VersionReleasePage.tsx",
 "src/pages/VersionRelease/index.tsx",
 "src/components/version-release/VrTopBar.tsx",
 "src/components/version-release/VrLoginGate.tsx",
 "src/components/version-release/VrConfirmDialog.tsx",
 "src/components/version-release/VersionHistoryList.tsx",
 "src/components/version-release/SpecSelector.tsx",
 "src/components/version-release/SaveVersionCard.tsx",
 "src/components/version-release/PublishRecordsTable.tsx",
 "src/components/version-release/PublishCard.tsx",
 "src/components/version-release/AcceptanceTestCard.tsx",
 "src/main.tsx",
 "src/App.tsx",
 "src/lib/pgNativeAgentRelease.ts",
 "src/lib/originalModelConnectionsApi.ts",
 "src/lib/originalHomeAgentApi.ts",
 "src/lib/originalRunDetailRoute.ts",
 "src/lib/studioAuth.ts",
 "src/lib/pgNativeSession.ts",
 "services/pg-api/src/native-auth-http.mjs",
 "services/pg-api/src/native-original-ui-preconditions.ts",
 "services/pg-api/src/agent-release-audit.ts",
 "services/pg-api/src/agent-release-contract.ts",
 "services/pg-api/src/workflow-v2-worker.ts",
 "db/postgres/migrations/pg_v9_046_agent_releases.sql",
 "tests/helpers/pg-original-model-committed-prefix-loss.mjs"
])
export const originalVersionReleaseReviewedRequiredSources=Object.freeze([...originalVersionReleaseRequiredSources,'services/pg-api/src/native-config-uat-policy.ts','services/pg-api/src/own-operations-http.ts','services/pg-api/src/native-server.ts',...['browser-guard','browser-policy','reviewed-check','backend-fixture','browser-fixture','proof-contract','prefix-loss','artifacts','browser-actions'].map(v=>'tests/helpers/pg-original-version-release-'+v+'.mjs'),'tests/pg-original-version-release-genuine.spec.mjs','tests/pg-original-version-release-genuine.config.mjs','tests/pg-original-version-release-policy-pure.test.mjs','tests/pg-original-version-release-proof-pure.test.mjs','.github/workflows/pg18-agent-design-genuine-ci.yml'])
export async function verifyOriginalVersionReleaseReviewedSources(env=process.env){
 const permit=requireOriginalVersionReleaseCi(env)
 const [fs,path,url,crypto,child,{default:assert}]=await Promise.all([import('node:fs'),import('node:path'),import('node:url'),import('node:crypto'),import('node:child_process'),import('node:assert/strict')])
 const repo=fs.realpathSync(url.fileURLToPath(new URL('../../',import.meta.url)))
 const required=originalVersionReleaseReviewedRequiredSources
 for(const file of required)assert.match(originalLoginReviewedSources[file]??'',/^[a-f0-9]{64}$/,'Root must seal final CURRENT release source DAG: '+file)
 const check=()=>{assert.equal(child.execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8',maxBuffer:4096}).trim(),permit.head);assert.equal(child.execFileSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:repo,encoding:'utf8',maxBuffer:65536}).trim(),'','exact clean committed current release sources required')
  for(const[file,hash]of Object.entries(originalLoginReviewedSources)){assert.equal(originalVersionReleasePath('/'+file),'/'+file);assert.match(hash,/^[a-f0-9]{64}$/);let at=repo;for(const part of file.split('/')){assert(!fs.lstatSync(at).isSymbolicLink());at=path.join(at,part)}const stat=fs.lstatSync(at),real=fs.realpathSync(at);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=16*1024*1024&&real.startsWith(repo+path.sep));const bytes=fs.readFileSync(real),committed=child.execFileSync('git',['show',permit.head+':'+file],{cwd:repo,maxBuffer:16*1024*1024});assert(bytes.equals(committed));assert.equal(crypto.createHash('sha256').update(committed).digest('hex'),hash,'current release source changed: '+file)}
 }
 check();return{repo,check,sources:Object.entries(originalLoginReviewedSources).map(([file,sha256])=>({file,sha256}))}
}
