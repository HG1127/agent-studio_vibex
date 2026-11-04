// New actual-original-page fixture purpose. No test mocks or pilot mount.
import {requireOriginalResourceReadCi} from '../../services/pg-api/tests/helpers/original-resource-read-genuine-guard.mjs'
export async function startOriginalResourceReadFixture(env=process.env,{storyCase=env.AGENT_STUDIO_ORIGINAL_RESOURCE_CASE}={}){
 requireOriginalResourceReadCi(env,storyCase)
 const [{toolHubGenuineFixture},fs,path,url,https,viteModule,reactModule]=await Promise.all([import('../../services/pg-api/tests/helpers/tool-hub-genuine-fixture.mjs'),import('node:fs'),import('node:path'),import('node:url'),import('node:https'),import('vite'),import('@vitejs/plugin-react')])
 const root=path.resolve(url.fileURLToPath(new URL('../../',import.meta.url))),parent=path.join(root,'.tmp','pg-migration-completion');fs.mkdirSync(parent,{recursive:true});const scratch=fs.mkdtempSync(path.join(parent,'original-resource-browser-'));let f,vite,agent,closed=false
 const close=async()=>{if(closed)return;closed=true;const errors=[];try{await vite?.close()}catch(e){errors.push(e)}agent?.destroy();try{await f?.close()}catch(e){errors.push(e)}if(path.dirname(fs.realpathSync(scratch))!==fs.realpathSync(parent)||!path.basename(scratch).startsWith('original-resource-browser-'))throw Error('original_resource_owned_cleanup_required');fs.rmSync(scratch,{recursive:true,force:true});if(errors.length)throw new AggregateError(errors,'original_resource_fixture_cleanup_failed')}
 try{
  // Sole fresh database initializer. Neither local-device nor Home fixtures
  // are bootstrapped later on this service. Two owners share this one fixture.
  f=await toolHubGenuineFixture(env,{browserMode:true,originalHomeReadOnly:false,originalResourceReadOnly:storyCase})
  if(f.originalResourceCase!==storyCase)throw Error('original_resource_actual_fixture_required')
  const html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Original resource isolated actual PG18</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',target=new URL(f.nativeOrigin)
  agent=new https.Agent({ca:f.serverTls.ca,rejectUnauthorized:true,servername:'localhost'})
  const originalEntry={name:'original-resource-owned-entry',configureServer(server){server.middlewares.use(async(req,res,next)=>{const p=new URL(req.url??'/','https://localhost:17443').pathname;if(!['/','/login','/harness','/execution-connections','/tool-connections','/run-detail'].includes(p))return next();try{const document=await server.transformIndexHtml(p,html);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(document)}catch(e){next(e)}})}}
  vite=await viteModule.createServer({configFile:false,envFile:false,root,appType:'custom',plugins:[reactModule.default(),originalEntry],define:{'import.meta.env.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED':'"true"','import.meta.env.VITE_AGENT_STUDIO_PG_NATIVE_LOCAL_UI_ENABLED':'"false"','import.meta.env.VITE_AGENT_STUDIO_PG_PILOT_UI_ENABLED':'"false"'},cacheDir:path.join(scratch,'vite-cache'),resolve:{alias:{'@':path.join(root,'src')}},server:{host:'127.0.0.1',port:17443,strictPort:true,https:f.serverTls,hmr:false,ws:false,watch:null,proxy:{'/__pg_native':{target:'https://127.0.0.1:'+target.port,agent,secure:true,changeOrigin:true,rewrite:value=>value.replace(/^\/__pg_native(?=\/|$)/,'')}}}})
  await vite.listen();return{...f,browserOrigin:'https://localhost:17443',close}
 }catch(error){await close();throw error}
}
