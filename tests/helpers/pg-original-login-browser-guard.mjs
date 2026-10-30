import {requireEphemeralPg18Ci} from '../../services/pg-api/src/pg18-ephemeral-ci-guard.mjs'

// Pure preflight only; the original genuine fixture applies its own guard too.
export function requireOriginalLoginBrowserCi(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
  if(platform!=='linux'||!Number.isSafeInteger(uid)||uid<=0||
    env.RUNNER_OS!=='Linux'||env.RUNNER_ENVIRONMENT!=='github-hosted'||
    env.GITHUB_REPOSITORY!=='HG1127/agent-studio_vibex'||
    env.GITHUB_WORKFLOW!=='Agent Studio F01 Agent Design genuine PG18 isolated verification'||
    env.GITHUB_JOB!=='pg18-agent-design-browser'||
    env.AGENT_STUDIO_F01_GENUINE_CI!=='YES_DISPOSABLE_F01_ONLY'||
    env.AGENT_STUDIO_ORIGINAL_PG_LOGIN_CI!=='YES_DISPOSABLE_ORIGINAL_LOGIN_ONLY'||
    ['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED',
      'HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy']
      .some(name=>env[name]!==undefined))
    throw Error('refuse_non_ephemeral_original_login_browser_ci')
  requireEphemeralPg18Ci(env)
  return Object.freeze({origin:'https://localhost:17443',synthetic_only:true})
}

/** No filesystem access. Reject aliases before URL normalization can hide them. */
export function originalLoginPath(raw){
  if(typeof raw!=='string'||raw.length>8192||!raw.startsWith('/')||raw.startsWith('//')||
    /[\\\u0000-\u001f\u007f-\u009f]/u.test(raw)||raw.includes('#'))return null
  const rawPath=raw.split('?',1)[0]
  if(/%2f|%5c/i.test(rawPath))return null
  let decoded
  try{decoded=decodeURIComponent(rawPath)}catch{return null}
  if(!decoded.startsWith('/')||decoded.startsWith('//')||
    /[\\%\u0000-\u001f\u007f-\u009f]/u.test(decoded))return null
  if(decoded!=='/'&&decoded.split('/').slice(1).some(part=>!part||part==='.'||part==='..'))return null
  return decoded
}

/** A fixture routing restriction, never an authentication or capability grant. */
export function originalLoginRequestPolicy(method,raw,accept=''){
  const pathname=originalLoginPath(raw)
  if(!pathname)return {kind:'denied',pathname:'/invalid-path'}
  if(/^\/__(?:pb|pg)(?:\/|$)/.test(pathname))return {kind:'legacy_denied',pathname}
  if(pathname.startsWith('/__pg_native/api/')){
    // Do not decode an encoded API alias and then proxy a different wire path.
    if(raw.split('?',1)[0]!==pathname)return {kind:'denied',pathname}
    if(method==='GET'||method==='HEAD'||method==='POST'&&
      ['/__pg_native/api/native-auth/login','/__pg_native/api/native-auth/logout'].includes(pathname))
      return {kind:'native',pathname}
    return {kind:'api_denied',pathname}
  }
  if(pathname.startsWith('/api/')||pathname==='/api'||pathname.startsWith('/__'))
    return {kind:'api_denied',pathname}
  if(!['GET','HEAD'].includes(method))return {kind:'denied',pathname}
  if(pathname==='/index.html'||pathname==='/agent-studio.svg'||pathname.startsWith('/assets/'))
    return {kind:'asset',pathname}
  if(typeof accept==='string'&&accept.includes('text/html')&&!pathname.split('/').at(-1).includes('.'))
    return {kind:'spa',pathname}
  return {kind:'denied',pathname}
}
