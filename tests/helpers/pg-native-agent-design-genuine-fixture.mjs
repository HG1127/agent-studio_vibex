// Root-hosted browser helper uses the SAME actual PG18/HTTP/mTLS/provider chain.
// No PGlite, page.route result fill, direct design result insert or metadata fake.
import {requireAgentDesignGenuineCi,agentDesignGenuineFixture} from '../../services/pg-api/tests/helpers/agent-design-genuine-fixture.mjs'
export async function startPgNativeAgentDesignGenuineBrowserFixture(env=process.env){
  requireAgentDesignGenuineCi(env)
  if(env.GITHUB_JOB!=='pg18-agent-design-browser')throw Error('agent_design_browser_job_required')
  const [fs,path,url,https,viteModule,reactModule]=await Promise.all([import('node:fs'),import('node:path'),import('node:url'),import('node:https'),import('vite'),import('@vitejs/plugin-react')])
  const root=path.resolve(url.fileURLToPath(new URL('../../',import.meta.url))),parent=path.join(root,'.tmp','pg-migration-completion')
  fs.mkdirSync(parent,{recursive:true});const scratch=fs.mkdtempSync(path.join(parent,'f01-genuine-browser-'))
  if(path.dirname(fs.realpathSync(scratch))!==fs.realpathSync(parent))throw Error('unsafe_F01_browser_scratch')
  let fixture,vite,closed=false
  const close=async()=>{if(closed)return;closed=true;try{await vite?.close()}finally{try{await fixture?.close()}finally{if(path.dirname(fs.realpathSync(scratch))!==fs.realpathSync(parent)||!path.basename(scratch).startsWith('f01-genuine-browser-'))throw Error('unsafe_F01_browser_cleanup');fs.rmSync(scratch,{recursive:true,force:true})}}}
  try{
    fixture=await agentDesignGenuineFixture(env,{browserMode:true})
    fs.writeFileSync(path.join(scratch,'index.html'),'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>F01 actual synthetic PG18</title></head><body><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>')
    fs.writeFileSync(path.join(scratch,'entry.tsx'),'import React from "react";import {createRoot} from "react-dom/client";import PgNativePilotPage from "/src/pages/PgNativePilot/PgNativePilotPage.tsx";import "/src/index.css";createRoot(document.getElementById("root")!).render(<React.StrictMode><PgNativePilotPage/></React.StrictMode>);')
    const target=new URL(fixture.nativeOrigin),agent=new https.Agent({ca:fixture.serverTls.ca,rejectUnauthorized:true,servername:'localhost'})
    vite=await viteModule.createServer({configFile:false,envFile:false,root,plugins:[reactModule.default()],cacheDir:path.join(scratch,'vite-cache'),resolve:{alias:{'@':path.join(root,'src')}},server:{host:'127.0.0.1',port:17443,strictPort:true,https:fixture.serverTls,hmr:false,ws:false,watch:null,proxy:{'/__pg_native':{target:'https://127.0.0.1:'+target.port,agent,secure:true,changeOrigin:true,rewrite:p=>p.replace(/^\/__pg_native(?=\/|$)/,'')}}}})
    await vite.listen()
    const address='https://localhost:17443/'+path.relative(root,scratch).replaceAll('\\','/')+'/index.html'
    return {...fixture,url:address,browserOrigin:'https://localhost:17443',evidenceScope:'actual PostgreSQL18 TCP + Native HTTPS Cookie + mTLS + actual encrypted-key Broker + synthetic provider single real TLS POST; PGlite not used',close:async()=>{try{await close()}finally{agent.destroy()}}}
  }catch(error){await close();throw error}
}
