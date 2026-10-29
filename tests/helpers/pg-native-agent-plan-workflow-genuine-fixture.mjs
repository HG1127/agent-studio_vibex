// Actual guarded F05 HTTPS/Vite browser fixture. Proxy may buffer one genuine
// upstream response to test late scope completion; it never fabricates a body.
import {requireAgentPlanWorkflowGenuineCi} from '../../services/pg-api/tests/helpers/agent-plan-workflow-genuine-guard.mjs'
import {agentPlanWorkflowRuntimeGenuineFixture} from '../../services/pg-api/tests/helpers/agent-plan-workflow-runtime-genuine-fixture.mjs'
// BROWSER_SOURCE_PINS_INSERTED_BY_AUTHOR_FROM_ACTUAL_H
export const agentPlanWorkflowBrowserFrozenSources=Object.freeze({
  "src/pages/PgNativePilot/PgNativePilotPage.tsx": "31c9099dd73b761bd4bad53255975814da3115a9d4a50a0c0d35d3cf915f9306",
  "src/pages/PgNativePilot/PgNativeAgentPlanWorkflowPanel.tsx": "afb5dbb87aeb5938039ef892a14d62ac371571c5bf916f1c06a8d7f2ec8814c8",
  "src/pages/PgNativePilot/PgNativeWorkflowWorkspace.tsx": "feaf8c020b14e819cd0103686cd9c4d2da11b2a4426940df1f49aa8765e3f733",
  "src/pages/PgNativePilot/PgNativeWorkflowNodeForm.tsx": "ae518e62ad0fb171ce186d435aeb503996ebcd7a7cea8e0a048312bd8642826d",
  "src/lib/pgNativeAgentPlanWorkflow.ts": "675fd2507c6cbdc7e43184372dc5aea8aef7921278590de36c629ed35a0c08e7",
  "src/lib/pgNativeAgentPlanWorkflowSession.ts": "42f186e3538d010af2a616c484d9a96a7a31c1caebf6261daa15f201631116c9",
  "src/lib/pgNativeWorkflowGeneratedDraft.ts": "6bf25416747995adc9c2bd232fc1bb799e330d4c268a8779a371d5e3c06c78a0",
  "src/lib/pgNativePilotApi.ts": "ee2dd39d5d37681f02eb79c90ab31fd3cf0ab72cd2005e360a6c1c2ac20b7d92",
  "src/pages/PgNativePilot/PgNativeWorkflowCanvas.tsx": "1f271f636e47dc3e5190ecbcde8ce17e3b2355b9f3eed979b90f5fb3994033e8",
  "src/lib/pgNativeWorkflowEditor.ts": "6953b75015b6f2448ad3262e48908e5242836f752f7b7c1587bcc5bf7e17617c"
})
export async function startPgNativeAgentPlanWorkflowGenuineBrowserFixture(env=process.env){
  requireAgentPlanWorkflowGenuineCi(env)
  if(env.GITHUB_JOB!=='pg18-plan-workflow-browser'||env.AGENT_STUDIO_F05_GENUINE_SUITE!=='browser')throw Error('agent_plan_workflow_browser_job_required')
  const [fs,path,url,https,crypto,viteModule,reactModule]=await Promise.all([import('node:fs'),import('node:path'),import('node:url'),import('node:https'),import('node:crypto'),import('vite'),import('@vitejs/plugin-react')])
  const root=path.resolve(url.fileURLToPath(new URL('../../',import.meta.url))),parent=path.join(root,'.tmp','pg-migration-completion')
  if(Object.keys(agentPlanWorkflowBrowserFrozenSources).length<8)throw Error('F05_browser_reviewed_source_pins_required')
  for(const [relative,expected]of Object.entries(agentPlanWorkflowBrowserFrozenSources))if(typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(expected)||crypto.createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex')!==expected)throw Error('F05_browser_reviewed_source_changed')
  fs.mkdirSync(parent,{recursive:true});const scratch=fs.mkdtempSync(path.join(parent,'f05-genuine-browser-'))
  if(path.dirname(fs.realpathSync(scratch))!==fs.realpathSync(parent))throw Error('unsafe_F05_browser_scratch')
  let fixture,vite,agent,closed=false,holding=null
  const held=new Set()
  const close=async()=>{
    if(closed)return;closed=true;for(const gate of held)gate.release();held.clear();holding=null
    try{await vite?.close()}finally{try{agent?.destroy();await fixture?.close()}finally{if(path.dirname(fs.realpathSync(scratch))!==fs.realpathSync(parent)||!path.basename(scratch).startsWith('f05-genuine-browser-'))throw Error('unsafe_F05_browser_cleanup');fs.rmSync(scratch,{recursive:true,force:true})}}
  }
  try{
    fixture=await agentPlanWorkflowRuntimeGenuineFixture(env,{browserMode:true})
    fs.writeFileSync(path.join(scratch,'index.html'),'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>F05 actual synthetic PG18</title></head><body><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>')
    fs.writeFileSync(path.join(scratch,'entry.tsx'),'import React from "react";import {createRoot} from "react-dom/client";import PgNativePilotPage from "/src/pages/PgNativePilot/PgNativePilotPage.tsx";import "/src/index.css";createRoot(document.getElementById("root")!).render(<React.StrictMode><PgNativePilotPage/></React.StrictMode>);')
    const target=new URL(fixture.nativeOrigin);agent=new https.Agent({ca:fixture.serverTls.ca,rejectUnauthorized:true,servername:'localhost'})
    vite=await viteModule.createServer({configFile:false,envFile:false,root,plugins:[reactModule.default()],cacheDir:path.join(scratch,'vite-cache'),resolve:{alias:{'@':path.join(root,'src')}},
      server:{host:'127.0.0.1',port:17443,strictPort:true,https:fixture.serverTls,hmr:false,ws:false,watch:null,proxy:{'/__pg_native':{target:'https://127.0.0.1:'+target.port,agent,secure:true,changeOrigin:true,rewrite:value=>value.replace(/^\/__pg_native(?=\/|$)/,''),
        configure(proxy){proxy.on('proxyRes',(upstream,req,res)=>{
          const gate=holding,pathName=new URL(req.url,'http://127.0.0.1').pathname
          if(!gate||req.method!=='GET'||!pathName.endsWith(gate.path))return
          holding=null
          if(upstream.statusCode!==200){gate.reject(Error('F05_held_actual_result_GET_must_be200'));held.delete(gate);return}
          // All bytes/headers come from one actual CA-validated Native response.
          // Buffer its real writes/end until release; no route.fulfill/mock API.
          const originalEnd=res.end;res.cork()
          res.end=function(...args){gate.enter({status:upstream.statusCode,path:gate.path});void gate.wait.then(()=>{held.delete(gate);if(!res.destroyed)originalEnd.apply(res,args)});return this}
        })}
      }}}})
    await vite.listen()
    const address='https://localhost:17443/'+path.relative(root,scratch).replaceAll('\\','/')+'/index.html'
    return{...fixture,url:address,browserOrigin:'https://localhost:17443',evidenceScope:'actual PG18 TCP + Native HTTPS Cookie + product page/SDK/Panel/canvas + dedicated Worker/Broker mTLS + synthetic model TLS; no PGlite/API body mocks/real vendor or fee',
      holdNextResultResponse(id){
        if(holding||closed||typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))throw Error('F05_one_exact_held_result_required')
        let release,enter,reject;const wait=new Promise(resolve=>{release=resolve}),entered=new Promise((resolve,refuse)=>{enter=resolve;reject=refuse})
        const gate={path:'/api/v2/agent-plan-workflow/requests/'+id,wait,release,enter,reject};holding=gate;held.add(gate)
        return{entered:async()=>{let timer;try{return await Promise.race([entered,new Promise((_,refuse)=>{timer=setTimeout(()=>refuse(Error('F05_actual_result_response_hold_timeout')),20000)})])}finally{clearTimeout(timer)}},release(){if(holding===gate)holding=null;gate.release()}}
      },close}
  }catch(error){await close();throw error}
}
