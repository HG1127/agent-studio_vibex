// Original product Root/SDK/Panel through real HTTPS proxy. No API body mocks.
import {requireToolHubGenuineCi} from '../../services/pg-api/tests/helpers/tool-hub-genuine-guard.mjs'
import {toolHubGenuineFixture} from '../../services/pg-api/tests/helpers/tool-hub-genuine-fixture.mjs'
export async function startPgNativeToolHubGenuineBrowserFixture(env=process.env){
 requireToolHubGenuineCi(env)
 if(env.GITHUB_JOB!=='pg18-tool-hub-browser'||env.AGENT_STUDIO_TOOL_HUB_GENUINE_SUITE!=='browser')throw Error('tool_hub_genuine_browser_job_required')
 const [fs,path,url,https,viteModule,reactModule]=await Promise.all([import('node:fs'),import('node:path'),import('node:url'),import('node:https'),import('vite'),import('@vitejs/plugin-react')]),root=path.resolve(url.fileURLToPath(new URL('../../',import.meta.url))),parent=path.join(root,'.tmp','pg-migration-completion')
 fs.mkdirSync(parent,{recursive:true});const scratch=fs.mkdtempSync(path.join(parent,'f16-tool-hub-browser-'));if(path.dirname(fs.realpathSync(scratch))!==fs.realpathSync(parent))throw Error('unsafe_tool_hub_browser_scratch')
 let fixture,vite,agent,closed=false
 const close=async()=>{if(closed)return;closed=true;const errors=[];try{await vite?.close()}catch(e){errors.push(e)}agent?.destroy();try{await fixture?.close()}catch(e){errors.push(e)}if(path.dirname(fs.realpathSync(scratch))!==fs.realpathSync(parent)||!path.basename(scratch).startsWith('f16-tool-hub-browser-'))throw Error('unsafe_tool_hub_browser_cleanup');fs.rmSync(scratch,{recursive:true,force:true});if(errors.length)throw new AggregateError(errors,'tool_hub_browser_owned_cleanup_failed')}
 try{
  fixture=await toolHubGenuineFixture(env,{browserMode:true})
  fs.writeFileSync(path.join(scratch,'index.html'),'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>F16-19 isolated actual PG18</title></head><body><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>')
  fs.writeFileSync(path.join(scratch,'entry.tsx'),'import React from "react";import {createRoot} from "react-dom/client";import PgNativePilotPage from "/src/pages/PgNativePilot/PgNativePilotPage.tsx";import "/src/index.css";createRoot(document.getElementById("root")!).render(<React.StrictMode><PgNativePilotPage/></React.StrictMode>);')
  const target=new URL(fixture.nativeOrigin);agent=new https.Agent({ca:fixture.serverTls.ca,rejectUnauthorized:true,servername:'localhost'})
  vite=await viteModule.createServer({configFile:false,envFile:false,root,plugins:[reactModule.default()],cacheDir:path.join(scratch,'vite-cache'),resolve:{alias:{'@':path.join(root,'src')}},server:{host:'127.0.0.1',port:17443,strictPort:true,https:fixture.serverTls,hmr:false,ws:false,watch:null,proxy:{'/__pg_native':{target:'https://127.0.0.1:'+target.port,agent,secure:true,changeOrigin:true,rewrite:value=>value.replace(/^\/__pg_native(?=\/|$)/,'')}}}})
  await vite.listen();return {...fixture,url:'https://localhost:17443/'+path.relative(root,scratch).replaceAll('\\','/')+'/index.html',browserOrigin:'https://localhost:17443',evidenceScope:'Actual product Root/SDK/Panel, PG18 TCP, Native Cookie/HTTPS, original Worker and private mTLS Broker; final provider/public directory are synthetic.',close}
 }catch(error){await close();throw error}
}
