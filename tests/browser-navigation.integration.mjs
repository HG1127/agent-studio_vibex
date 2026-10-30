// Real isolated Chrome + stdio MCP; no company domains, credentials or user sessions.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {createServer} from 'node:http'
import {createRuntime} from '../local-executor/runtime.mjs'
import {browserPageFromResult} from '../src/lib/browserNavigationFeedback.ts'
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'agentstudio-browser-nav-'))
let runtime,probe,checks=0,forbiddenRequests=0,slowRequests=0
const sockets=new Set(),timers=new Set(),pass=t=>{checks++;console.log('PASS '+t)}
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r('http://127.0.0.1:'+s.address().port)))
const denied=createServer((req,res)=>{forbiddenRequests++;res.end('forbidden')})
const deniedOrigin=await listen(denied)
const site=createServer((req,res)=>{
 res.setHeader('Content-Type','text/html; charset=utf-8')
 if(req.url==='/redirect'){res.writeHead(302,{location:'/good'});res.end();return}
 if(req.url==='/blocked'){res.writeHead(302,{location:deniedOrigin+'/no'});res.end();return}
 if(req.url==='/404'){res.writeHead(404);res.end('<title>Missing</title><h1>Not found</h1>');return}
 if(req.url==='/drop'){req.socket.destroy();return}
 if(req.url==='/slow'){slowRequests++;const t=setTimeout(()=>{timers.delete(t);res.end('<title>Late</title><h1>Late response</h1>')},23000);timers.add(t);return}
 if(req.url==='/default'){res.end('<title>恭喜，站点创建成功！</title><h1>这是默认index.html</h1>');return}
 res.end('<title>Navigation verified</title><h1>Actual approved destination</h1>')
})
site.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s))})
const origin=await listen(site),portProbe=createServer(),dnsOrigin='http://nonexistent-agentstudio-browser.invalid'
const unreachable=await listen(portProbe);await new Promise(r=>portProbe.close(r))
const config={roots:[{name:'work',path:temp}],files:{enabled:false},browser:{enabled:true,headless:true,images:true,channel:'chrome',allowedOrigins:[origin,unreachable,dnsOrigin]}}
const call=(tool,args={},signal)=>runtime.execute({tool:'browser.'+tool,arguments:args},signal)
try{
 // Invalid executable proves an observation-only request did not launch Chrome.
 probe=await createRuntime({...config,browser:{...config.browser,executablePath:path.join(temp,'not-installed.exe')}})
 for(const tool of ['browser_snapshot','browser_take_screenshot'])await assert.rejects(()=>probe.execute({tool:'browser.'+tool,arguments:{}}),/^Error: browser_no_open_page$/)
 await probe.close();probe=null;pass('reading before navigation fails explicitly without creating an empty browser window')
 runtime=await createRuntime(config)
 let value=await call('browser_navigate',{url:origin+'/good'});assert.equal(browserPageFromResult(value).url,origin+'/good');assert.match(value,/Actual approved destination/)
 pass('approved navigation returns the real loaded URL and page contents')
 value=await call('browser_snapshot');assert.equal(browserPageFromResult(value).url,origin+'/good')
 value=await call('browser_navigate',{url:origin+'/redirect'});assert.equal(browserPageFromResult(value).url,origin+'/good');assert.equal(browserPageFromResult(value).redirected,true)
 pass('read-only snapshot and allowed redirect report the actual destination')
 value=await call('browser_navigate',{url:origin+'/default'});assert.equal(browserPageFromResult(value).placeholder,true)
 pass('default hosting page is detected without claiming the business system is available')
 await assert.rejects(()=>call('browser_navigate',{url:origin+'/blocked'}),/^Error: browser_origin_denied$/);assert.equal(forbiddenRequests,0)
 pass('cross-origin redirect is blocked before the forbidden destination receives a request')
 await assert.rejects(()=>call('browser_navigate',{url:origin+'/404'}),/^Error: browser_http_error$/)
 await assert.rejects(()=>call('browser_snapshot'),/^Error: browser_http_error$/)
 pass('HTTP error page and subsequent snapshot cannot be reported as healthy page results')
 await assert.rejects(()=>call('browser_navigate',{url:dnsOrigin+'/'}),/^Error: browser_dns_failed$/)
 pass('DNS failure survives route and MCP boundaries as a precise safe failure code')
 await assert.rejects(()=>call('browser_navigate',{url:unreachable+'/'}),/^Error: browser_connection_refused$/)
 pass('connection refusal is distinct from an unpaired or offline device')
 await assert.rejects(()=>call('browser_navigate',{url:origin+'/slow'}),/^Error: browser_navigation_timeout$/)
 assert.equal(slowRequests,1);pass('navigation timeout is bounded and never automatically retries the HTTP request')
 const cancelled=new AbortController();cancelled.abort();await assert.rejects(()=>call('browser_navigate',{url:origin+'/good'},cancelled.signal),e=>e.name==='AbortError')
 value=await call('browser_navigate',{url:origin+'/good'});assert.equal(browserPageFromResult(value).url,origin+'/good')
 await new Promise(r=>setTimeout(r,100));assert.match(await call('browser_snapshot'),/Actual approved destination/)
 pass('explicit retry after failure recovers; no delayed diagnostic HTML overwrites the valid page')
 await call('browser_close');await assert.rejects(()=>call('browser_snapshot'),/^Error: browser_no_open_page$/)
 value=await call('browser_navigate',{url:origin+'/good'});assert.equal(browserPageFromResult(value).url,origin+'/good')
 pass('closing the isolated browser does not create an empty replacement on read; explicit reopen works')
 console.log('BROWSER_NAVIGATION_ACCEPTANCE '+JSON.stringify({status:'PASS',checks,realChrome:true,realMCP:true,externalSites:false,forbiddenRequests,slowRequests}))
}finally{await probe?.close();await runtime?.close();for(const t of timers)clearTimeout(t);for(const s of sockets)s.destroy();await new Promise(r=>site.close(r));await new Promise(r=>denied.close(r));await fs.rm(temp,{recursive:true,force:true,maxRetries:20,retryDelay:100})}
