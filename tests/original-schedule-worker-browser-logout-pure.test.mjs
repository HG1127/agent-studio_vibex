import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'

// Execute the exact browser callback against terminal fetch DATA. This never
// starts Chromium, TLS, SQL, a Worker, or a Native server.
const source=readFileSync(new URL('./pg-original-schedule-worker-genuine.spec.mjs',import.meta.url),'utf8')
const start=source.indexOf('async function revokeHeldResultSession(){')
const end=source.indexOf(');expect(logout.status).toBe(200)',start)
assert(start>=0&&end>start)
const callback=source.slice(start,end)
function request(fetch){return vm.runInNewContext('('+callback+')',{fetch})()}

test('held-read revocation uses the current browser same-origin Cookie and SPKI connection',async()=>{
 const calls=[]
 const result=await request(async(url,options)=>{calls.push({url,options});return{status:200,json:async()=>({ok:true})}})
 assert.equal(result.status,200);assert.equal(result.body.ok,true);assert.equal(calls.length,1)
 assert.equal(calls[0].url,'/__pg_native/api/native-auth/logout')
 assert.equal(calls[0].options.method,'POST');assert.equal(calls[0].options.credentials,'same-origin')
 assert.equal(calls[0].options.cache,'no-store');assert.equal(calls[0].options.redirect,'error')
 assert.equal(calls[0].options.body,'{}')
 assert.deepEqual(Object.entries(calls[0].options.headers),[['Content-Type','application/json'],['X-AgentStudio-Request','1']])
 assert.equal(Object.hasOwn(calls[0].options.headers,'Cookie'),false)
 assert.equal(Object.hasOwn(calls[0].options.headers,'Authorization'),false)
 assert.equal(Object.hasOwn(calls[0].options.headers,'X-Rh-User-Id'),false)
})
for(const status of [401,403,503])test('browser callback preserves actual logout rejection '+status,async()=>{
 let count=0;const result=await request(async()=>{count++;return{status,json:async()=>({error:'session_required'})}})
 assert.equal(result.status,status);assert.equal(result.body.error,'session_required');assert.equal(count,1)
})
test('logout transport failure is fatal without a second request',async()=>{
 let count=0;const primary=Error('synthetic_transport_failure')
 await assert.rejects(request(async()=>{count++;throw primary}),error=>error===primary);assert.equal(count,1)
})
test('logout JSON failure remains fatal without fabricating success',async()=>{
 let count=0;const primary=Error('invalid_logout_json')
 await assert.rejects(request(async()=>{count++;return{status:200,json:async()=>{throw primary}}}),error=>error===primary);assert.equal(count,1)
})
test('original stale clipboard check keeps actual revocation, revalidation and output removal',()=>{
 const held=source.slice(source.indexOf("await test.step('real session revocation"),source.indexOf('await f.assertNoDispatchReplay()'))
 assert(held.includes('expect(logout.status).toBe(200)'));assert(held.includes('expect(logout.body.ok).toBe(true)'))
 assert(held.includes("const signedOut=wire('/api/native-auth/me','GET');held.release()"))
 assert(held.includes('expect((await signedOut).status).toBe(401)'))
 assert(held.includes("await expect(page.getByRole('dialog')).toHaveCount(0)"))
 assert(held.includes('expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(lastClipboard)'))
 assert(!source.includes('ignoreHTTPSErrors'));assert(!source.includes('NODE_TLS_REJECT_UNAUTHORIZED'))
 assert(source.includes("'--ignore-certificate-errors-spki-list='+f.spki"))
})
