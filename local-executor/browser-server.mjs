// Microsoft Playwright MCP over stdio, using a separate browser context.
import { createConnection } from '@playwright/mcp'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createRequire } from 'node:module'
import {BROWSER_EVENT_PREFIX,browserFailureCode,safeBrowserUrl} from './browser-feedback.mjs'
// Browser and MCP snapshot references must use the exact same installed version.
const {chromium}=createRequire(import.meta.resolve('@playwright/mcp'))('playwright')
const config=JSON.parse(process.env.STUDIO_BROWSER_CONFIG||'{}')
const origins=new Set(config.allowedOrigins||[])
if(!origins.size)throw Error('browser_origins_required')
function allowed(raw){
 try{const u=new URL(raw);return !u.username&&!u.password&&['http:','https:'].includes(u.protocol)&&origins.has(u.origin)}catch{return false}
}
let browser,context
async function getContext(){
 if(context)return context
 browser=await chromium.launch({headless:config.headless!==false,...(config.executablePath?{executablePath:config.executablePath}:{channel:config.channel||'chrome'})})
 const currentBrowser=browser
 context=await browser.newContext({serviceWorkers:'block',acceptDownloads:true})
 const currentContext=context
 const closed=()=>console.error(BROWSER_EVENT_PREFIX+JSON.stringify({kind:'closed'}))
 currentBrowser.on('disconnected',()=>{if(browser===currentBrowser){browser=undefined;context=undefined;closed()}})
 currentContext.on('close',()=>{if(context===currentContext){context=undefined;closed()}})
 currentContext.on('page',page=>{
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())console.error(BROWSER_EVENT_PREFIX+JSON.stringify({kind:'frame',errorDocument:frame.url().startsWith('chrome-error://')}))})
  page.on('close',()=>{if(!currentContext.pages().length)closed()})
 })
 const top=route=>route.request().isNavigationRequest()&&route.request().frame()===route.request().frame().page().mainFrame()
 const report=(route,event)=>{if(top(route))console.error(BROWSER_EVENT_PREFIX+JSON.stringify({...event,url:safeBrowserUrl(route.request().url())}))}
 // Check every resource and redirect before any request; never relax the allowlist.
 await context.route('**/*',async route=>{
  if(!allowed(route.request().url())){report(route,{kind:'failed',code:'browser_origin_denied'});return route.abort('blockedbyclient')}
  try{
   const response=await route.fetch({maxRedirects:0,maxRetries:0,timeout:20000})
   const location=response.headers().location
   if(location&&!allowed(new URL(location,route.request().url()).href)){report(route,{kind:'failed',code:'browser_origin_denied'});return route.abort('blockedbyclient')}
   report(route,{kind:'response',status:response.status()})
   await route.fulfill({response})
  }catch(error){
   report(route,{kind:'failed',code:browserFailureCode(error)})
   await route.abort().catch(()=>{})
   // Do not setContent a fake diagnostic page: a late replacement can erase a
   // subsequent good page or impersonate the last successfully loaded URL.
  }
 })
 await context.routeWebSocket('**/*',socket=>socket.close())
 return context
}
const server=await createConnection({imageResponses:config.images===true?'allow':'omit',outputDir:process.cwd(),browser:{isolated:false}},getContext)
await server.connect(new StdioServerTransport())
process.stdin.on('end',async()=>{await browser?.close();process.exit(0)})
