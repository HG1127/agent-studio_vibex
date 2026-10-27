// Pure preflight. The browser suite must call this BEFORE child processes,
// file reads, sockets or chromium.launch. Never runs on this Windows host.
export function requireNativeBrowserCi(env=process.env,
  platform=process.platform,uid=process.getuid?.()??0){
  if(platform!=="linux"||!Number.isSafeInteger(uid)||uid<=0||
     env.GITHUB_ACTIONS!=="true"||env.CI!=="true"||
     env.RUNNER_ENVIRONMENT!=="github-hosted"||
     !/^[0-9]{1,32}$/.test(env.GITHUB_RUN_ID??"")||
     env.AGENT_STUDIO_NATIVE_BROWSER_CI!=="SYNTHETIC_GITHUB_ONLY"||
     Object.keys(env).some(name=>name==="DATABASE_URL"||(/^PG[A-Z_]/.test(name)&&env[name]!==undefined)))
    throw Error("refuse_non_ephemeral_native_browser_ci")
  return Object.freeze({synthetic_only:true,origin:"http://localhost:17443"})
}
