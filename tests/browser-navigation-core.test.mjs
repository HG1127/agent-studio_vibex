import test from 'node:test'
import assert from 'node:assert/strict'
import {browserNavigationHint,browserPageFromResult,browserJobPresentation} from '../src/lib/browserNavigationFeedback.ts'
import {browserObservation,browserReceipt,browserFailureCode,safeBrowserUrl} from '../local-executor/browser-feedback.mjs'
import {executeClaim} from '../local-executor/connection.mjs'
const page=(url,title='Test')=>'### Page\n- Page URL: '+url+'\n- Page Title: '+title+'\n### Snapshot\n```yaml\n- heading "Test"\n```'
const origin='http://127.0.0.1:8000'
const job=(result,status='succeeded')=>({id:'job',status,result,error:''})
test('old successful about:blank snapshots are not presented as a successfully opened website',()=>{
 const result=browserJobPresentation(job(page('about:blank')),'browser.browser_snapshot',origin)
 assert.equal(result.title,'尚未打开网页');assert.equal(result.tone,'warning');assert.equal(result.canOpenTarget,true)
 assert.throws(()=>browserObservation(page('about:blank'),{origins:[origin]}),/^Error: browser_no_open_page$/)
})
test('verifiable navigation envelopes preserve actual URL and explicit authorized redirects',()=>{
 const receipt=browserObservation(page(origin+'/final'),{origins:[origin],requestedUrl:origin+'/start',httpStatus:200})
 const output=browserReceipt(receipt,page(origin+'/final'))
 assert.equal(browserPageFromResult(output).url,origin+'/final')
 assert.equal(browserJobPresentation(job(output),'browser.browser_navigate',origin+'/start',[origin]).title,'已打开跳转后的网页')
})
test('a snapshot of a different page never claims to have opened the typed address',()=>{
 const shown=browserJobPresentation(job(page(origin+'/old')),'browser.browser_snapshot',origin+'/new',[origin])
 assert.match(shown.title,/未跳转/);assert.equal(shown.page.url,origin+'/old');assert.equal(shown.canOpenTarget,true)
})
test('placeholder content and missing metadata remain distinguishable from business page success',()=>{
 assert.equal(browserJobPresentation(job(page(origin,'恭喜，站点创建成功！')),'browser.browser_navigate',origin,[origin]).tone,'warning')
 assert.equal(browserJobPresentation(job('The tool worked'),'browser.browser_navigate',origin,[origin]).title,'已收到回执，实际网址未核实')
})
test('HTTP errors, unauthorized actual locations and fake diagnostic schemes cannot pass navigation verification',()=>{
 assert.throws(()=>browserObservation(page(origin),{origins:[origin],httpStatus:404}),/^Error: browser_http_error$/)
 assert.throws(()=>browserObservation(page('http://outside.invalid/'),{origins:[origin]}),/^Error: browser_origin_denied$/)
 assert.throws(()=>browserObservation(page('chrome-error://chromewebdata/'),{origins:[origin]}),/^Error: browser_navigation_failed$/)
 assert.equal(browserPageFromResult('### Snapshot\n- text: "Page URL: http://evil.invalid"'),null)
})
test('diagnostic URL presentation removes credentials, query secrets and fragments',()=>{
 assert.equal(safeBrowserUrl('https://user:password@site.test/path?token=abc#secret'),'https://site.test/path')
 assert.equal(browserPageFromResult(page('https://site.test/?token=abc#secret')).url,'https://site.test/')
})
test('queued, running, cancelled and unknown states never claim success',()=>{
 for(const status of ['queued','running','cancelled','unknown','expired'])assert.notEqual(browserJobPresentation(job('',status),'browser.browser_navigate',origin).tone,'success')
})
test('error classification retains an actionable safe code without exposing raw stack text',()=>{
 assert.equal(browserFailureCode(Error('request failed',{cause:'getaddrinfo ENOTFOUND private.test'})),'browser_dns_failed')
 assert.equal(browserFailureCode('connect ECONNREFUSED'),'browser_connection_refused')
 assert.match(browserNavigationHint('[code:browser_no_open_page]'),/打开目标网页/)
})
test('real executor completion retains browser failure code, never success or upstream secrets',async()=>{
 const calls=[];const api=async(route,body)=>{calls.push({route,body});return {active:true}}
 await executeClaim(api,{execute:async()=>{throw Error('browser_dns_failed',{cause:'secret=should-not-leak'})}},{id:'browser-test',claim:'isolated-claim',deadline_ms:Date.now()+10000,input:{} })
 const complete=calls.find(c=>c.route.endsWith('/complete')).body
 assert.equal(complete.ok,false);assert.match(complete.result,/browser_dns_failed/);assert.doesNotMatch(complete.result,/should-not-leak/)
})
