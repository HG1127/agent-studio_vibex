// CI admission only; NOT a DB/container attestation or an operator approval.
// Import-safe original main gate: no driver, Docker, filesystem or writes.
import {requireEphemeralPg18Ci} from '../../src/pg18-ephemeral-ci-guard.mjs'

const prefix='AGENT_STUDIO_DESCRIPTIVE_INSTALL_CI_'
const workflow='Agent Studio PG18 descriptive operator isolated verification',job='pg18-descriptive-operator-install'
const source='daa6e1c402221335d204c55e1469d290ca3aaf898b1c66fdc09d0262f5298247'
const lock='eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a'
const pkg='90488a84c79a53a83efea6440062941f08668765f76b7effd97bf6a33e4b9d58'
const permits=new WeakSet(),bindings=new WeakMap(),hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
const positive=value=>typeof value==='string'&&/^[1-9][0-9]{0,31}$/.test(value)
const refuse=code=>{throw Error('descriptive_install_ci_refused:'+code)}
const keys=['EPHEMERAL','PURPOSE','WRITE_APPROVED','NONCE','MAIN_CONTAINER_ID','RESTORE_CONTAINER_ID','IMAGE_ID','SOURCE_SHA256','SOURCE_MANIFEST_SHA256','RUNTIME_MANIFEST_SHA256','LOCK_SHA256','PACKAGE_SHA256']
function common(env){
 if(env!==process.env)refuse('ambient_environment_required')
 if(process.platform!=='linux'||process.getuid?.()!==0||process.getgid?.()!==0||process.versions.node.split('.')[0]!=='24'||
  process.execArgv.some(value=>value!=='--experimental-strip-types'))refuse('host')
 // Mandatory ORIGINAL ephemeral-main boundary. Its credentials are not exposed
 // or reused as permission to connect to any install/restore target.
 requireEphemeralPg18Ci(env)
 if(env.RUNNER_OS!=='Linux'||env.RUNNER_ENVIRONMENT!=='github-hosted'||env.GITHUB_REPOSITORY!=='HG1127/agent-studio_vibex'||
  env.GITHUB_WORKFLOW!==workflow||env.GITHUB_JOB!==job||!['push','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)||
  !positive(env.GITHUB_RUN_ID)||!positive(env.GITHUB_RUN_ATTEMPT)||env[prefix+'EPHEMERAL']!=='true'||
  env[prefix+'PURPOSE']!=='DESCRIPTIVE_060_AUTHENTIC_INSTALL_RESTORE_SYNTHETIC_ONLY'||env[prefix+'WRITE_APPROVED']!=='YES_NEW_DISPOSABLE_CONTAINERS_ONLY')refuse('environment')
 for(const key of Object.keys(env))if(key.startsWith(prefix)&&!keys.includes(key.slice(prefix.length))||
  /^AGENT_STUDIO_GENERATED_OPERATOR_CI_|^AGENT_STUDIO_GENERATED_059_|^AGENT_STUDIO_DESCRIPTIVE_PATCH_060_/.test(key)||
  ['NODE_OPTIONS','NODE_PATH','NODE_COMPILE_CACHE','NODE_V8_COVERAGE','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','SSL_CERT_FILE','SSL_CERT_DIR','OPENSSL_CONF','OPENSSL_MODULES','LD_PRELOAD','LD_LIBRARY_PATH','DYLD_INSERT_LIBRARIES','DYLD_LIBRARY_PATH','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','DOCKER_HOST','DOCKER_CONTEXT'].includes(key))refuse('ambient_configuration')
}
function mint(binding){const permit=Object.freeze({});permits.add(permit);bindings.set(permit,Object.freeze(binding));return permit}
export function requireDescriptivePatchInstallProvisionCi(env=process.env){
 common(env)
 if(Object.keys(env).some(key=>key.startsWith(prefix)&&!['EPHEMERAL','PURPOSE','WRITE_APPROVED'].includes(key.slice(prefix.length))))refuse('provision_configuration')
 return mint({kind:'provision',run:env.GITHUB_RUN_ID,attempt:env.GITHUB_RUN_ATTEMPT})
}
export function requireDescriptivePatchInstallCi(env=process.env){
 common(env)
 if(!['NONCE','MAIN_CONTAINER_ID','RESTORE_CONTAINER_ID','SOURCE_MANIFEST_SHA256','RUNTIME_MANIFEST_SHA256'].every(key=>hex(env[prefix+key]))||env[prefix+'MAIN_CONTAINER_ID']===env[prefix+'RESTORE_CONTAINER_ID']||!/^sha256:[a-f0-9]{64}$/.test(env[prefix+'IMAGE_ID']??'')||env[prefix+'SOURCE_SHA256']!==source||env[prefix+'LOCK_SHA256']!==lock||env[prefix+'PACKAGE_SHA256']!==pkg)refuse('fixture_configuration')
 // These IDs remain untrusted claims until the independent builder checks
 // Docker metadata, pg_controldata AND actual fresh SQL identity/ownership.
 return mint({kind:'fixture',run:env.GITHUB_RUN_ID,attempt:env.GITHUB_RUN_ATTEMPT,nonce:env[prefix+'NONCE'],mainId:env[prefix+'MAIN_CONTAINER_ID'],restoreId:env[prefix+'RESTORE_CONTAINER_ID'],imageId:env[prefix+'IMAGE_ID'],sourceManifestSha:env[prefix+'SOURCE_MANIFEST_SHA256'],runtimeManifestSha:env[prefix+'RUNTIME_MANIFEST_SHA256']})
}
export function assertDescriptivePatchInstallCiPermit(permit){if(!permits.has(permit))refuse('unsealed_ci_permit')}
export function descriptivePatchInstallCiBinding(permit){assertDescriptivePatchInstallCiPermit(permit);return bindings.get(permit)}
