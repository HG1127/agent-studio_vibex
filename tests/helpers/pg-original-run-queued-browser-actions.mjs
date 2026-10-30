import {chromium,expect} from '@playwright/test'
import {installOriginalLegacyBlockObserver} from './pg-original-login-legacy-observer.mjs'
import {originalRunQueuedDomSafety,originalRunQueuedImageBuffer,originalRunQueuedObservationBytes} from './pg-original-run-queued-artifacts.mjs'
export async function originalQueuedBrowserSession(f){
 const browser=await chromium.launch({headless:true,args:['--ignore-certificate-errors-spki-list='+f.spki]}),context=await browser.newContext({viewport:{width:1360,height:1100},serviceWorkers:'block'}),legacy=await installOriginalLegacyBlockObserver(context)
 const secrets=new Set([f.credentials.alice.password,f.credentials.bob.password,'synthetic-alice-assessment-key-never-network','synthetic-bob-assessment-key-never-network','knowledge-body-never-send',...Array.from({length:60},(_,i)=>'synthetic-queued-selector-key-'+i)]),images=[],outside=[],pages=new Set();let webSockets=0,closed=false
 await context.route('**/*',async route=>{if(new URL(route.request().url()).origin!==f.origin){if(outside.length<128)outside.push('outside_origin');else f.observations.overflow=true;await route.abort();return}await route.continue()})
 await context.routeWebSocket('**/*',socket=>{webSockets=Math.min(129,webSockets+1);socket.close()})
 const page=async()=>{const p=await context.newPage();pages.add(p);p.setDefaultTimeout(18000);p.setDefaultNavigationTimeout(25000);return p}
 const wire=(p,path,method='GET')=>p.waitForResponse(r=>new URL(r.url()).pathname==='/__pg_native'+path&&r.request().method()===method)
 const focus=async p=>{await p.bringToFront();await p.evaluate(()=>window.dispatchEvent(new Event('focus')))}
 const login=async(p,who,next='/agent-run')=>{
  f.allowSignedOutReads(4);await p.goto(f.origin+'/login?next='+encodeURIComponent(next),{waitUntil:'domcontentloaded'});await p.getByRole('textbox',{name:'工作邮箱',exact:true}).fill(f.credentials[who].email);await p.getByLabel('密码',{exact:true}).fill(f.credentials[who].password)
  const response=wire(p,'/api/native-auth/login','POST');await p.getByRole('button',{name:'登录',exact:true}).click();expect((await response).status()).toBe(200);await expect(p).toHaveURL(f.origin+next)
  const cookies=(await context.cookies(f.origin)).filter(c=>c.name==='__Host-agentstudio_session');expect(cookies).toHaveLength(1);expect(cookies[0].secure&&cookies[0].httpOnly&&cookies[0].sameSite==='Strict'&&cookies[0].domain==='localhost'&&cookies[0].path==='/').toBe(true);secrets.add(cookies[0].value)
 }
 const logout=async(p,who)=>{const menu=p.getByRole('menu');if(!await menu.isVisible())await p.getByRole('button',{name:new RegExp(f.profiles[who].display_name)}).click();const response=wire(p,'/api/native-auth/logout','POST');f.allowSignedOutReads(4);await menu.getByRole('menuitem',{name:'退出登录',exact:true}).click();expect((await response).status()).toBe(200);await expect(p).toHaveURL(f.origin+'/login')}
 const expectedDialog=(p,type,contains,before=async()=>{})=>new Promise((resolve,reject)=>{p.once('dialog',async dialog=>{try{expect(dialog.type()).toBe(type);if(contains)expect(dialog.message()).toContain(contains);await before();await dialog.accept();resolve()}catch(e){await dialog.dismiss();reject(e)}})})
 const image=async(name,p)=>{await expect(p.locator('input[type="password"]')).toHaveCount(0);const sample=await p.evaluate(()=>({text:document.body.innerText,values:[...document.querySelectorAll('input,textarea')].map(e=>e.value),passwordInputs:document.querySelectorAll('input[type="password"]').length}));const safety=originalRunQueuedDomSafety(sample,[...secrets]);expect(Object.values(safety).every(v=>v===true)).toBe(true);images.push(originalRunQueuedImageBuffer(name,await p.screenshot({fullPage:true}),safety))}
 const zeros=async()=>{for(const key of ['legacy_backend_requests','unexpected_api_failures','blocked_requests','submission_posts'])expect(f.observations[key]).toEqual([]);expect(f.observations.forbidden_auth_headers).toBe(0);expect(f.observations.partial_model_reads).toBe(0);expect(f.observations.overflow).toBe(false);expect(f.observations.gate_deadline_failures).toBe(0);expect(outside).toEqual([]);expect(webSockets).toBe(0);expect(legacy.snapshot()).toEqual({event_count_capped_129:0,codes:[],overflow:false});f.assertNoUnconsumedMisses();return await f.assertZeroExecution()}
 return{browser,context,page,wire,focus,login,logout,expectedDialog,image,images,secrets,legacy,zeros,
  async closePage(p){if(!p.isClosed()){await legacy.flush(p);await p.close()}},
  async close(){if(closed)return;closed=true;const errors=[];for(const p of pages)if(!p.isClosed())try{await legacy.flush(p)}catch(e){errors.push(e)}try{await context.close()}catch(e){errors.push(e)}try{await browser.close()}catch(e){errors.push(e)}if(errors.length)throw new AggregateError(errors,'original_queued_browser_cleanup_failed')},
  async writeAfterCleanup(testInfo,completed,primary,cleanup,observation){
   let bytes;try{bytes=originalRunQueuedObservationBytes({...observation,story_completed:false,provider_network_acceptance:false,production_GO:false},[...secrets])}catch(e){cleanup.push({label:'bounded_observation_preflight',error:e})}
   const success=completed&&!primary&&!testInfo.errors.length&&!cleanup.length
   if(success)for(const item of images)try{await (await import('node:fs/promises')).writeFile(testInfo.outputPath(item.name),item.bytes,{flag:'wx'})}catch(e){cleanup.push({label:'fixed_success_image_write',error:e})}
   try{bytes=originalRunQueuedObservationBytes({...observation,story_completed:success&&!cleanup.length,provider_network_acceptance:false,production_GO:false,cleanup_failures:cleanup.map(x=>x.label)},[...secrets]);await (await import('node:fs/promises')).writeFile(testInfo.outputPath('original-run-queued-observation.json'),bytes,{flag:'wx'})}catch(e){cleanup.push({label:'bounded_observation_write',error:e})}
   for(const item of images)item.bytes.fill(0);images.length=0;secrets.clear()
  },
 }
}
