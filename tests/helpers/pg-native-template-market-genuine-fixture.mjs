// Actual guarded F07 HTTPS/Vite browser fixture. Proxy may buffer one genuine
// upstream response to test late scope completion; it never fabricates a body.
import {requireAgentTemplateMarketGenuineCi} from '../../services/pg-api/tests/helpers/agent-template-market-genuine-guard.mjs'
import {agentTemplateMarketGenuineFixture} from '../../services/pg-api/tests/helpers/agent-template-market-genuine-fixture.mjs'
// BROWSER_SOURCE_PINS_INSERTED_BY_AUTHOR_FROM_ACTUAL_H
export const agentTemplateMarketBrowserFrozenSources=Object.freeze({
  "src/pages/PgNativePilot/PgNativePilotPage.tsx": "09b3f240c73fa30379f9ed5653763e41c860388020336ef9ccb3f31fc8fa9d87",
  "src/pages/PgNativePilot/PgNativeTemplateMarketAgentSetup.tsx": "1484c40905eb35baed8c1aa8fb2770792f029100c10336a52be3b58d27977c80",
  "src/pages/PgNativePilot/PgNativeTemplateMarketPanel.tsx": "979724b650999ed48141e7a01866057c3e0ee3b77121d2e6ec37b3a7ea644e4a",
  "src/lib/pgNativeTemplateMarket.ts": "0fa32da7d9537868b702010b5d3bf15b26d517425105105c16e29d9fe8e0dfd4",
  "src/lib/pgNativeTemplateMarketSession.ts": "e7306b0868a1769a2835ccc0d25d63fc978898977068cd40937753590dc6a4ea",
  "src/lib/pgNativePilotApi.ts": "41b4402dee8eaacc7bdcff1b749c970d62c13d2416aff3ba73151efcdafcd793",
  "src/pages/PgNativePilot/PgNativeAgentModelBindingPanel.tsx": "3bc4784404e4a8c804c634775d59293f56362fd77384a76bd82c0688902e03c9",
  "src/pages/PgNativePilot/PgNativeAgentHttpToolsPanel.tsx": "0ea640a8336933efcf6426bdcf4a9d4742afb608fc28af59dd3c6edc1b30497a",
  "src/pages/PgNativePilot/PgNativeAgentMcpToolsPanel.tsx": "5fdbd2f86dc925d583a2172e81a0c9ccf5861348bf1c0252216417d64c9be482",
  "src/pages/PgNativePilot/PgNativeAgentKnowledgePanel.tsx": "6c04d30c4048ed0bc4b1ed7620d8c0a52c5bb32c5a7e8703cebeff84c1dee41c"
})
export async function startPgNativeTemplateMarketGenuineBrowserFixture(env=process.env){
  requireAgentTemplateMarketGenuineCi(env)
  if(env.GITHUB_JOB!=='pg18-template-market-browser'||env.AGENT_STUDIO_F07_GENUINE_SUITE!=='browser')throw Error('agent_template_market_browser_job_required')
  const [fs,path,url,https,crypto,viteModule,reactModule]=await Promise.all([import('node:fs'),import('node:path'),import('node:url'),import('node:https'),import('node:crypto'),import('vite'),import('@vitejs/plugin-react')])
  const root=path.resolve(url.fileURLToPath(new URL('../../',import.meta.url))),parent=path.join(root,'.tmp','pg-migration-completion')
  if(Object.keys(agentTemplateMarketBrowserFrozenSources).length<8)throw Error('F07_browser_reviewed_source_pins_required')
  for(const [relative,expected]of Object.entries(agentTemplateMarketBrowserFrozenSources))if(typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(expected)||crypto.createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex')!==expected)throw Error('F07_browser_reviewed_source_changed')
  fs.mkdirSync(parent,{recursive:true});const scratch=fs.mkdtempSync(path.join(parent,'f07-genuine-browser-'))
  if(path.dirname(fs.realpathSync(scratch))!==fs.realpathSync(parent))throw Error('unsafe_F07_browser_scratch')
  let fixture,vite,agent,closed=false,holding=null
  const held=new Set()
  const close=async()=>{
    if(closed)return;closed=true;for(const gate of held)gate.release();held.clear();holding=null
    try{await vite?.close()}finally{try{agent?.destroy();await fixture?.close()}finally{if(path.dirname(fs.realpathSync(scratch))!==fs.realpathSync(parent)||!path.basename(scratch).startsWith('f07-genuine-browser-'))throw Error('unsafe_F07_browser_cleanup');fs.rmSync(scratch,{recursive:true,force:true})}}
  }
  try{
    fixture=await agentTemplateMarketGenuineFixture(env,{browserMode:true})
    fs.writeFileSync(path.join(scratch,'index.html'),'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>F07 actual synthetic PG18</title></head><body><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>')
    fs.writeFileSync(path.join(scratch,'entry.tsx'),'import React from "react";import {createRoot} from "react-dom/client";import PgNativePilotPage from "/src/pages/PgNativePilot/PgNativePilotPage.tsx";import "/src/index.css";createRoot(document.getElementById("root")!).render(<React.StrictMode><PgNativePilotPage/></React.StrictMode>);')
    const target=new URL(fixture.nativeOrigin);agent=new https.Agent({ca:fixture.serverTls.ca,rejectUnauthorized:true,servername:'localhost'})
    vite=await viteModule.createServer({configFile:false,envFile:false,root,plugins:[reactModule.default()],cacheDir:path.join(scratch,'vite-cache'),resolve:{alias:{'@':path.join(root,'src')}},
      server:{host:'127.0.0.1',port:17443,strictPort:true,https:fixture.serverTls,hmr:false,ws:false,watch:null,proxy:{'/__pg_native':{target:'https://127.0.0.1:'+target.port,agent,secure:true,changeOrigin:true,rewrite:value=>value.replace(/^\/__pg_native(?=\/|$)/,''),
        configure(proxy){proxy.on('proxyRes',(upstream,req,res)=>{
          const gate=holding,pathName=new URL(req.url,'http://127.0.0.1').pathname
          if(!gate||req.method!=='GET'||!pathName.endsWith(gate.path))return
          holding=null
          if(upstream.statusCode!==200){gate.reject(Error('F07_held_actual_Agent_GET_must_be200'));held.delete(gate);return}
          // All bytes/headers come from one actual CA-validated Native response.
          // Buffer its real writes/end until release; no route.fulfill/mock API.
          const originalEnd=res.end;res.cork()
          res.end=function(...args){gate.enter({status:upstream.statusCode,path:gate.path});void gate.wait.then(()=>{held.delete(gate);if(!res.destroyed)originalEnd.apply(res,args)});return this}
        })}
      }}}})
    await vite.listen()
    const address='https://localhost:17443/'+path.relative(root,scratch).replaceAll('\\','/')+'/index.html'
    return{...fixture,url:address,browserOrigin:'https://localhost:17443',evidenceScope:'actual PG18 TCP + Native HTTPS Cookie + product Root page/SDK/Panel/resource setup; no PGlite/API body mocks/provider execution',
      holdNextAgentResponse(id){
        if(holding||closed||typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))throw Error('F07_one_exact_held_Agent_required')
        let release,enter,reject;const wait=new Promise(resolve=>{release=resolve}),entered=new Promise((resolve,refuse)=>{enter=resolve;reject=refuse})
        const gate={path:'/api/v2/agent-specs/'+id,wait,release,enter,reject};holding=gate;held.add(gate)
        return{entered:async()=>{let timer;try{return await Promise.race([entered,new Promise((_,refuse)=>{timer=setTimeout(()=>refuse(Error('F07_actual_Agent_response_hold_timeout')),20000)})])}finally{clearTimeout(timer)}},release(){if(holding===gate)holding=null;gate.release()}}
      },close}
  }catch(error){await close();throw error}
}
