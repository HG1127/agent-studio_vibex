
import {isProxy} from 'node:util/types'
const grants=new WeakMap(),prefix='AGENT_STUDIO_QUALITY089_',fail=()=>{throw Error('quality089_hosted_admission_refused')}
export const quality089HostedWorkflow='Agent Studio original quality089 isolated verification'
export function requireQuality089Hosted(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 if(!env||typeof env!=='object'||isProxy(env)||(![Object.prototype,null].includes(Object.getPrototypeOf(env))&&env!==process.env))fail()
 const ds=Object.getOwnPropertyDescriptors(env);for(const k of Reflect.ownKeys(ds))if(typeof k!=='string'||!Object.hasOwn(ds[k],'value'))fail()
 const v=k=>ds[k]?.value
 if(platform!=='linux'||!Number.isSafeInteger(uid)||uid<=0||v('RUNNER_OS')!=='Linux'||v('RUNNER_ENVIRONMENT')!=='github-hosted'||v('GITHUB_ACTIONS')!=='true'||v('CI')!=='true'||v('GITHUB_REPOSITORY')!=='HG1127/agent-studio_vibex'||v('GITHUB_WORKFLOW')!==quality089HostedWorkflow||v('GITHUB_JOB')!=='quality089-isolation'||!['workflow_dispatch','push'].includes(v('GITHUB_EVENT_NAME'))||!/^refs\/heads\/codex\/pg18-[A-Za-z0-9._/-]+$/.test(v('GITHUB_REF')??'')||!/^[a-f0-9]{40}$/.test(v('GITHUB_SHA')??'')||v(prefix+'EXPECTED_HEAD')!==v('GITHUB_SHA')||!/^[1-9][0-9]{0,31}$/.test(v('GITHUB_RUN_ID')??'')||!/^[1-9][0-9]{0,31}$/.test(v('GITHUB_RUN_ATTEMPT')??''))fail()
 if(v(prefix+'PURPOSE')!=='YES_NEW_OWNED_DISPOSABLE_ORIGINAL_QUALITY089_ONLY'||!['schema-http','worker-browser'].includes(v(prefix+'SUITE'))||v(prefix+'TARGET')!=='127.0.0.1:5333/agent_studio/postgres'||v(prefix+'WRITE_APPROVED')!=='YES_SYNTHETIC_SAME_RUN_ONLY')fail()
 const allowed=['EXPECTED_HEAD','PURPOSE','SUITE','TARGET','WRITE_APPROVED']
 for(const k of Object.keys(ds))if(k.startsWith(prefix)&&!allowed.includes(k.slice(prefix.length))||k==='DATABASE_URL'||/^PG[A-Z_]/.test(k)||/^(?:NODE_OPTIONS|NODE_PATH|NODE_EXTRA_CA_CERTS|NODE_TLS_REJECT_UNAUTHORIZED|NODE_COMPILE_CACHE|NODE_V8_COVERAGE|SSL_CERT_FILE|SSL_CERT_DIR|OPENSSL_|LD_|DYLD_|DOCKER_HOST|DOCKER_CONTEXT|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|http_proxy|https_proxy|all_proxy)/.test(k)||/^(?:OPENAI|ANTHROPIC|GEMINI|GOOGLE|AZURE_OPENAI)_API_KEY$/.test(k)||/^AGENT_STUDIO_(?:F01|COMPLETE_PROFILE_CI|GENERATED_OPERATOR_CI|DESCRIPTIVE_INSTALL_CI|ORIGINAL_.*_CI|ARTIFACT|MATERIAL)/.test(k))fail()
 const permit=Object.freeze({head:v('GITHUB_SHA'),suite:v(prefix+'SUITE'),origin:'https://localhost:17443',run:v('GITHUB_RUN_ID'),attempt:v('GITHUB_RUN_ATTEMPT'),target:Object.freeze({host:'127.0.0.1',port:5333,database:'agent_studio',user:'postgres'}),synthetic_only:true,production_GO:false})
 grants.set(permit,{env,uid});return permit
}
export function assertQuality089HostedPermit(p){if(!grants.has(p))fail();return p}
export function quality089WorkerPolicy(p,env){assertQuality089HostedPermit(p);if(p.suite!=='worker-browser'||grants.get(p).env!==env)fail();return p}
