// Actual guarded F08 HTTPS/Vite browser fixture. Proxy may buffer one genuine
// upstream response to test late scope completion; it never fabricates a body.
import {requireAgentInternalShareGenuineCi} from '../../services/pg-api/tests/helpers/agent-internal-share-genuine-guard.mjs'
import {agentInternalShareGenuineFixture} from '../../services/pg-api/tests/helpers/agent-internal-share-genuine-fixture.mjs'
// BROWSER_SOURCE_PINS_INSERTED_BY_AUTHOR_FROM_ACTUAL_H
export const agentInternalShareBrowserFrozenSources=Object.freeze({
  "shared/agent-internal-share-contract.ts": "1f29bece171b7ae575d6ee8e6b4cfdfb9e7dc411ab7568c9b463df3ad79215ee",
  "src/lib/pgNativeInternalShare.ts": "3bf8a7fd1e6ee9499cc752310784cfd8bb4926b0d57109b9feeec632de317343",
  "src/lib/pgNativeInternalShareSession.ts": "b37829fe1ed78c6b5956a3911eaed9c8e8707a818b8adde11665f45934a52ad1",
  "src/lib/pgNativePilotApi.ts": "ee2dd39d5d37681f02eb79c90ab31fd3cf0ab72cd2005e360a6c1c2ac20b7d92",
  "src/lib/pgNativeTemplateMarket.ts": "0fa32da7d9537868b702010b5d3bf15b26d517425105105c16e29d9fe8e0dfd4",
  "src/pages/PgNativePilot/PgNativeAgentHttpToolsPanel.tsx": "0ea640a8336933efcf6426bdcf4a9d4742afb608fc28af59dd3c6edc1b30497a",
  "src/pages/PgNativePilot/PgNativeAgentKnowledgePanel.tsx": "6c04d30c4048ed0bc4b1ed7620d8c0a52c5bb32c5a7e8703cebeff84c1dee41c",
  "src/pages/PgNativePilot/PgNativeAgentMcpToolsPanel.tsx": "5fdbd2f86dc925d583a2172e81a0c9ccf5861348bf1c0252216417d64c9be482",
  "src/pages/PgNativePilot/PgNativeAgentModelBindingPanel.tsx": "3bc4784404e4a8c804c634775d59293f56362fd77384a76bd82c0688902e03c9",
  "src/pages/PgNativePilot/PgNativeInternalSharePanel.tsx": "e4f62f87c29fce2e22cc98a4ba4efbc0b096cebd9f1caf2c08265fa243a73f5f",
  "src/pages/PgNativePilot/PgNativePilotPage.tsx": "31c9099dd73b761bd4bad53255975814da3115a9d4a50a0c0d35d3cf915f9306",
  "src/pages/PgNativePilot/PgNativeTemplateMarketAgentSetup.tsx": "1484c40905eb35baed8c1aa8fb2770792f029100c10336a52be3b58d27977c80",
  "src/pages/PgNativePilot/PgNativeTemplateMarketPanel.tsx": "edf7af34ede2268eb4d6c8104811e3cec5303286b141b7bede0c1daf69b91abb"
})
export async function startPgNativeInternalShareGenuineBrowserFixture(env=process.env){
  requireAgentInternalShareGenuineCi(env)
  if(env.GITHUB_JOB!=='pg18-internal-share-browser'||env.AGENT_STUDIO_F08_GENUINE_SUITE!=='browser')throw Error('agent_internal_share_browser_job_required')
  const [fs,path,url,https,crypto,viteModule,reactModule]=await Promise.all([import('node:fs'),import('node:path'),import('node:url'),import('node:https'),import('node:crypto'),import('vite'),import('@vitejs/plugin-react')])
  const root=path.resolve(url.fileURLToPath(new URL('../../',import.meta.url))),parent=path.join(root,'.tmp','pg-migration-completion')
  if(Object.keys(agentInternalShareBrowserFrozenSources).length<8)throw Error('F08_browser_reviewed_source_pins_required')
  for(const [relative,expected]of Object.entries(agentInternalShareBrowserFrozenSources))if(typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(expected)||crypto.createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex')!==expected)throw Error('F08_browser_reviewed_source_changed')
  fs.mkdirSync(parent,{recursive:true});const scratch=fs.mkdtempSync(path.join(parent,'f08-genuine-browser-'))
  if(path.dirname(fs.realpathSync(scratch))!==fs.realpathSync(parent))throw Error('unsafe_F08_browser_scratch')
  let fixture,vite,agent,closed=false,holding=null
  const held=new Set()
  const close=async()=>{
    if(closed)return;closed=true;for(const gate of held)gate.release();held.clear();holding=null
    try{await vite?.close()}finally{try{agent?.destroy();await fixture?.close()}finally{if(path.dirname(fs.realpathSync(scratch))!==fs.realpathSync(parent)||!path.basename(scratch).startsWith('f08-genuine-browser-'))throw Error('unsafe_F08_browser_cleanup');fs.rmSync(scratch,{recursive:true,force:true})}}
  }
  try{
    fixture=await agentInternalShareGenuineFixture(env,{browserMode:true})
    fs.writeFileSync(path.join(scratch,'index.html'),'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>F08 actual synthetic PG18</title></head><body><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>')
    fs.writeFileSync(path.join(scratch,'entry.tsx'),'import React from "react";import {createRoot} from "react-dom/client";import PgNativePilotPage from "/src/pages/PgNativePilot/PgNativePilotPage.tsx";import "/src/index.css";createRoot(document.getElementById("root")!).render(<React.StrictMode><PgNativePilotPage/></React.StrictMode>);')
    const target=new URL(fixture.nativeOrigin);agent=new https.Agent({ca:fixture.serverTls.ca,rejectUnauthorized:true,servername:'localhost'})
    vite=await viteModule.createServer({configFile:false,envFile:false,root,plugins:[reactModule.default()],cacheDir:path.join(scratch,'vite-cache'),resolve:{alias:{'@':path.join(root,'src')}},
      server:{host:'127.0.0.1',port:17443,strictPort:true,https:fixture.serverTls,hmr:false,ws:false,watch:null,proxy:{'/__pg_native':{target:'https://127.0.0.1:'+target.port,agent,secure:true,changeOrigin:true,rewrite:value=>value.replace(/^\/__pg_native(?=\/|$)/,''),
        configure(proxy){proxy.on('proxyRes',(upstream,req,res)=>{
          const gate=holding,pathName=new URL(req.url,'http://127.0.0.1').pathname
          if(!gate||req.method!=='GET'||!pathName.endsWith(gate.path))return
          holding=null
          if(upstream.statusCode!==200){gate.reject(Error('F08_held_actual_Agent_GET_must_be200'));held.delete(gate);return}
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
        if(holding||closed||typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))throw Error('F08_one_exact_held_Agent_required')
        let release,enter,reject;const wait=new Promise(resolve=>{release=resolve}),entered=new Promise((resolve,refuse)=>{enter=resolve;reject=refuse})
        const gate={path:'/api/v2/agent-specs/'+id,wait,release,enter,reject};holding=gate;held.add(gate)
        return{entered:async()=>{let timer;try{return await Promise.race([entered,new Promise((_,refuse)=>{timer=setTimeout(()=>refuse(Error('F08_actual_Agent_response_hold_timeout')),20000)})])}finally{clearTimeout(timer)}},release(){if(holding===gate)holding=null;gate.release()}}
      },close}
  }catch(error){await close();throw error}
}
