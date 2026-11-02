import {expect} from '@playwright/test'
export function releaseHistoryHeader(page,n){return page.getByRole('heading',{name:/^版本历史/}).locator('..').locator('..').getByText('v'+n,{exact:true}).locator('..')}
export const releaseWire=(page,path,method)=>page.waitForResponse(r=>new URL(r.url()).pathname==='/__pg_native'+path&&r.request().method()===method)
export async function releaseLogin(page,context,f,who){
 const target='/version-release?spec='+f.owned[who].id
 await page.goto(f.origin+'/login?next='+encodeURIComponent(target),{waitUntil:'domcontentloaded'})
 await page.getByRole('textbox',{name:'工作邮箱',exact:true}).fill(f.credentials[who].email);await page.getByLabel('密码',{exact:true}).fill(f.credentials[who].password)
 const ack=releaseWire(page,'/api/native-auth/login','POST');await page.getByRole('button',{name:'登录',exact:true}).click();expect((await ack).status()).toBe(200);await expect(page).toHaveURL(f.origin+target);await releaseSettled(page,f.owned[who].id)
 const cookies=(await context.cookies(f.origin)).filter(c=>c.name==='__Host-agentstudio_session');expect(cookies).toHaveLength(1);expect(cookies[0]).toMatchObject({secure:true,httpOnly:true,sameSite:'Strict',domain:'localhost',path:'/'})
}
export async function releaseLogout(page,f,who){const menu=page.getByRole('menu');if(!await menu.isVisible())await page.getByRole('button',{name:new RegExp(f.profiles[who].display_name)}).click();const ack=releaseWire(page,'/api/native-auth/logout','POST');await menu.getByRole('menuitem',{name:'退出登录',exact:true}).click();expect((await ack).status()).toBe(200);await expect(page).toHaveURL(f.origin+'/login')}
export async function releaseSettled(page,spec){
 await expect(page.getByRole('heading',{name:'发布流水线',exact:true})).toBeVisible()
 await expect(page.locator('#vr-spec-select')).toHaveValue(spec)
 await expect(page.getByRole('button',{name:'刷新版本',exact:true})).toBeEnabled()
 const notice=page.getByRole('status').filter({has:page.getByRole('button',{name:'刷新版本',exact:true})}).locator('p')
 await expect(notice).toBeVisible()
 await expect(notice).toContainText('当前显示最近100个版本和10条验收记录，历史为部分列表；当前发布版本已按服务端标识另行核对。')
}
export async function releasePendingMarker(page,owner){return page.evaluate(id=>{const raw=sessionStorage.getItem('agent-studio:original-version-release:v1:'+id);return raw===null?null:JSON.parse(raw)},owner)}
export async function releaseDropCommitted(page,f,action,trigger,record){
 const suffix=action==='acceptance'?'/acceptance':'/change',path='/__pg_native/api/v2/original-ui/agent-releases/'+f.owned.alice.id+suffix
 const failed=page.waitForEvent('requestfailed',{predicate:r=>new URL(r.url()).origin===f.origin&&new URL(r.url()).pathname===path&&r.method()==='POST',timeout:8000});void failed.catch(()=>{})
 await f.dropNextActualReleaseReply(action);await trigger();const original=await failed;expect(original.failure()?.errorText).toBeTruthy()
 await expect.poll(()=>f.observations.committed_response_prefixes.length).toBe(record.failed+1)
 expect(f.observations.committed_response_prefixes.at(-1)).toMatchObject({status:200,forwarded_body_bytes:1,headers_written:true,write_callback_confirmed:true,before_client_deadline:true,actual_proxy_response_closed:true,actual_socket_destroyed:true})
 expect(f.observations.committed_losses.at(-1)).toMatchObject({action,actual_native_cookie_owner:true,actual_exact_receipt_row:true,actual_owner_actor_audit:true,receipt_delta:1,audit_delta:1})
 const marker=await releasePendingMarker(page,f.users.alice);expect(marker).toMatchObject({format:'native_original_version_release_v1',employee_id:f.users.alice,spec_id:f.owned.alice.id,action,request_id:f.observations.committed_losses.at(-1).request_id,request_sha256:f.observations.committed_losses.at(-1).request_sha256});expect(Object.keys(marker).sort()).toEqual(['format','employee_id','spec_id','action','request_id','request_sha256','created_at','expected_spec_revision','source_sha256','version_id','version_sha256','expected_version_revision','expected_release_revision','test_linked'].sort());expect(Object.keys(marker).join(',')).not.toMatch(/instruction|note|reason|snapshot|api_key|password/)
 record.failed++;record.markers.push({request_id:marker.request_id,action:marker.action,request_sha256:marker.request_sha256});return marker
}
export async function releaseQueryOnly(page,f,marker,record){
 const posts=f.observations.receipt_posts,before=await f.counts(),path='/api/v2/original-ui/agent-releases/'+marker.spec_id+'/receipts/'+marker.request_id
 const response=releaseWire(page,path,'GET');await page.getByRole('button',{name:'核对原请求结果',exact:true}).click();const raw=await response;expect(raw.status()).toBe(200);const body=await raw.json();expect(body.item.mode).toBe('read_only_exact_agent_release_receipt');expect(body.item.request_sha256).toBe(marker.request_sha256);expect(body.item.result.request_id).toBe(marker.request_id)
 await expect(page.getByRole('button',{name:'核对原请求结果',exact:true})).toHaveCount(0);expect(await releasePendingMarker(page,f.users.alice)).toBeNull();expect(f.observations.receipt_posts).toBe(posts);expect(await f.counts()).toEqual(before);record.queries++;return body.item.result
}
export async function releaseReview(page,version,kind){await releaseHistoryHeader(page,version).getByRole('button',{name:kind==='restore'?'恢复':kind==='publish'?'发布':'删除草稿 v'+version,exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();const button=dialog.getByRole('button',{name:kind==='restore'?'确认恢复':kind==='publish'?'确认发布':'确认删除',exact:true});await expect(button).toBeDisabled();if(kind==='restore')await dialog.getByLabel('恢复说明（8–500字）',{exact:true}).fill('Synthetic complete original configuration restore');await dialog.getByRole('checkbox').check();await expect(button).toBeEnabled();return{dialog,button}}
